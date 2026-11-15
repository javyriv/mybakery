const express = require('express');
const router = express.Router();
const { query, get } = require('../database/db');

// Obtener métricas financieras y operativas con filtro de período
router.get('/', (req, res) => {
    try {
        const { period } = req.query; // 'today', 'week', 'month', 'all' (por defecto 'month')

        let dateFilterOrders = "WHERE o.status != 'CANCELADO'";
        let dateFilterPayments = "WHERE 1=1";
        const today = new Date().toISOString().split('T')[0];

        if (period === 'today') {
            dateFilterOrders += ` AND o.delivery_date = '${today}'`;
            dateFilterPayments += ` AND date(p.payment_date) = '${today}'`;
        } else if (period === 'week') {
            dateFilterOrders += ` AND o.delivery_date >= date('now', '-7 days')`;
            dateFilterPayments += ` AND date(p.payment_date) >= date('now', '-7 days')`;
        } else if (period === 'month') {
            dateFilterOrders += ` AND o.delivery_date >= date('now', 'start of month')`;
            dateFilterPayments += ` AND date(p.payment_date) >= date('now', 'start of month')`;
        }

        // Totales de pedidos (Ventas pactadas y costos de insumos)
        const totals = get(`
            SELECT 
                COUNT(*) as total_orders,
                COALESCE(SUM(total_amount), 0) as total_revenue,
                COALESCE(SUM(total_cost), 0) as total_cost,
                COALESCE(SUM(total_paid), 0) as total_collected,
                COALESCE(SUM(total_amount - total_paid), 0) as total_receivables
            FROM orders o
            ${dateFilterOrders}
        `);

        // Ganancia neta y margen
        const netProfit = totals.total_revenue - totals.total_cost;
        const profitMarginPct = totals.total_revenue > 0 
            ? Math.round(((netProfit / totals.total_revenue) * 100) * 10) / 10 
            : 0;

        // Cuentas por cobrar globales (todos los pedidos pendientes de pago no cancelados)
        const globalReceivables = get(`
            SELECT COALESCE(SUM(total_amount - total_paid), 0) as pending_balance
            FROM orders
            WHERE status != 'CANCELADO' AND payment_status != 'PAGADO'
        `);

        // Desglose de pedidos por estado
        const statusBreakdown = query(`
            SELECT status, COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total_amount
            FROM orders
            GROUP BY status
        `);

        // Top 5 Productos más vendidos en el período
        const topProducts = query(`
            SELECT 
                p.id,
                p.name,
                p.category,
                SUM(oi.quantity) as units_sold,
                SUM(oi.subtotal) as total_revenue,
                SUM(oi.unit_cost * oi.quantity) as total_cost,
                SUM(oi.subtotal - (oi.unit_cost * oi.quantity)) as profit
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            JOIN products p ON oi.product_id = p.id
            WHERE o.status != 'CANCELADO'
            ${dateFilterOrders ? dateFilterOrders.replace('WHERE', 'AND') : ''}
            GROUP BY p.id
            ORDER BY units_sold DESC
            LIMIT 5
        `);

        // Datos para gráfico (si es histórico agrupa por fechas de pedidos, si no últimos 7 días)
        let dailyChart;
        if (period === 'all') {
            dailyChart = query(`
                SELECT 
                    o.delivery_date as date,
                    COALESCE(SUM(o.total_amount), 0) as revenue,
                    COALESCE(SUM(o.total_cost), 0) as cost,
                    COALESCE(SUM(o.total_amount - o.total_cost), 0) as profit
                FROM orders o
                WHERE o.status != 'CANCELADO'
                GROUP BY o.delivery_date
                ORDER BY o.delivery_date ASC
            `);
        } else {
            dailyChart = query(`
                WITH RECURSIVE dates(date) AS (
                    SELECT date('now', '-6 days')
                    UNION ALL
                    SELECT date(date, '+1 day')
                    FROM dates
                    WHERE date < date('now')
                )
                SELECT 
                    d.date,
                    COALESCE(SUM(o.total_amount), 0) as revenue,
                    COALESCE(SUM(o.total_cost), 0) as cost,
                    COALESCE(SUM(o.total_amount - o.total_cost), 0) as profit
                FROM dates d
                LEFT JOIN orders o ON d.date = o.delivery_date AND o.status != 'CANCELADO'
                GROUP BY d.date
                ORDER BY d.date ASC
            `);
        }

        // Resumen de consumo de insumos e ingredientes usados en el período
        const ingredientsConsumed = query(`
            SELECT 
                i.id as ingredient_id,
                i.name as ingredient_name,
                i.category as ingredient_category,
                i.unit as ingredient_unit,
                i.cost_per_unit,
                ROUND(SUM((r.quantity * (oi.quantity / COALESCE(NULLIF(p.yield_quantity, 0), 1)))), 3) as total_used,
                ROUND(SUM((r.quantity * (oi.quantity / COALESCE(NULLIF(p.yield_quantity, 0), 1))) * i.cost_per_unit), 2) as total_cost,
                COUNT(DISTINCT o.id) as orders_count
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            JOIN products p ON oi.product_id = p.id
            JOIN recipes r ON r.product_id = p.id
            JOIN ingredients i ON r.ingredient_id = i.id
            WHERE o.status != 'CANCELADO'
            ${dateFilterOrders ? dateFilterOrders.replace('WHERE', 'AND') : ''}
            GROUP BY i.id
            ORDER BY total_cost DESC, total_used DESC
        `);

        // Resumen rápido de inventario
        const inventorySummary = get(`
            SELECT 
                COUNT(*) as total_ingredients,
                SUM(CASE WHEN current_stock <= min_stock THEN 1 ELSE 0 END) as low_stock_count,
                COALESCE(SUM(current_stock * cost_per_unit), 0) as total_inventory_value
            FROM ingredients
        `);

        // Resumen detallado del estado de pedidos por producto (Entregados vs. Pendientes)
        const productsOrderStatus = query(`
            SELECT 
                p.id,
                p.name,
                p.category,
                COALESCE(p.yield_unit, 'unidad') as yield_unit,
                COUNT(DISTINCT o.id) as orders_count,
                COALESCE(SUM(oi.quantity), 0) as total_units,
                COALESCE(SUM(CASE WHEN o.status = 'ENTREGADO' THEN oi.quantity ELSE 0 END), 0) as delivered_units,
                COALESCE(SUM(CASE WHEN o.status IN ('PENDIENTE', 'EN_PREPARACION', 'LISTO') THEN oi.quantity ELSE 0 END), 0) as pending_units,
                COALESCE(SUM(CASE WHEN o.status = 'PENDIENTE' THEN oi.quantity ELSE 0 END), 0) as status_pending,
                COALESCE(SUM(CASE WHEN o.status = 'EN_PREPARACION' THEN oi.quantity ELSE 0 END), 0) as status_baking,
                COALESCE(SUM(CASE WHEN o.status = 'LISTO' THEN oi.quantity ELSE 0 END), 0) as status_ready,
                COALESCE(SUM(oi.subtotal), 0) as total_revenue,
                COALESCE(SUM(CASE WHEN o.status = 'ENTREGADO' THEN oi.subtotal ELSE 0 END), 0) as delivered_revenue,
                COALESCE(SUM(CASE WHEN o.status IN ('PENDIENTE', 'EN_PREPARACION', 'LISTO') THEN oi.subtotal ELSE 0 END), 0) as pending_revenue
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            JOIN products p ON oi.product_id = p.id
            ${dateFilterOrders}
            GROUP BY p.id
            ORDER BY pending_units DESC, total_units DESC
        `);

        res.json({
            period: period || 'month',
            summary: {
                total_orders: totals.total_orders,
                total_revenue: totals.total_revenue,
                total_cost: totals.total_cost,
                net_profit: netProfit,
                profit_margin_pct: profitMarginPct,
                total_collected: totals.total_collected,
                period_receivables: totals.total_receivables,
                global_receivables: globalReceivables.pending_balance
            },
            inventory: inventorySummary,
            status_breakdown: statusBreakdown,
            top_products: topProducts,
            products_order_status: productsOrderStatus,
            ingredients_consumed: ingredientsConsumed,
            daily_chart: dailyChart
        });
    } catch (err) {
        console.error('Error calculando métricas:', err);
        res.status(500).json({ error: 'Error al generar reporte financiero' });
    }
});

module.exports = router;
