const express = require('express');
const router = express.Router();
const { query, get, run, transaction } = require('../database/db');

// Función auxiliar para descontar insumos de un pedido
function deductOrderInventory(orderId, orderNumber) {
    const items = query('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
    for (const item of items) {
        const product = get('SELECT * FROM products WHERE id = ?', [item.product_id]);
        if (!product) continue;

        const recipeItems = query('SELECT * FROM recipes WHERE product_id = ?', [item.product_id]);
        const yieldQty = product.yield_quantity > 0 ? product.yield_quantity : 1;
        const scaleFactor = item.quantity / yieldQty;

        for (const rItem of recipeItems) {
            const required = Math.round((rItem.quantity * scaleFactor) * 1000) / 1000;
            const ing = get('SELECT * FROM ingredients WHERE id = ?', [rItem.ingredient_id]);
            const unitCost = ing ? ing.cost_per_unit : 0;

            run(`
                UPDATE ingredients 
                SET current_stock = current_stock - ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [required, rItem.ingredient_id]);

            run(`
                INSERT INTO inventory_movements (ingredient_id, type, quantity, unit_cost, reference, notes)
                VALUES (?, 'SALIDA_PEDIDO', ?, ?, ?, ?)
            `, [
                rItem.ingredient_id, 
                required, 
                unitCost, 
                `Pedido ${orderNumber}`, 
                `Insumos descontados para ${item.quantity} ${product.name}`
            ]);
        }
    }

    run('UPDATE orders SET inventory_deducted = 1 WHERE id = ?', [orderId]);
}

// Función auxiliar para reponer insumos si un pedido descontado se cancela
function restoreOrderInventory(orderId, orderNumber) {
    const items = query('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
    for (const item of items) {
        const product = get('SELECT * FROM products WHERE id = ?', [item.product_id]);
        if (!product) continue;

        const recipeItems = query('SELECT * FROM recipes WHERE product_id = ?', [item.product_id]);
        const yieldQty = product.yield_quantity > 0 ? product.yield_quantity : 1;
        const scaleFactor = item.quantity / yieldQty;

        for (const rItem of recipeItems) {
            const returned = Math.round((rItem.quantity * scaleFactor) * 1000) / 1000;
            const ing = get('SELECT * FROM ingredients WHERE id = ?', [rItem.ingredient_id]);
            const unitCost = ing ? ing.cost_per_unit : 0;

            run(`
                UPDATE ingredients 
                SET current_stock = current_stock + ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [returned, rItem.ingredient_id]);

            run(`
                INSERT INTO inventory_movements (ingredient_id, type, quantity, unit_cost, reference, notes)
                VALUES (?, 'ENTRADA', ?, ?, ?, ?)
            `, [
                rItem.ingredient_id, 
                returned, 
                unitCost, 
                `Cancelación ${orderNumber}`, 
                `Reingreso de insumos por pedido cancelado`
            ]);
        }
    }

    run('UPDATE orders SET inventory_deducted = 0 WHERE id = ?', [orderId]);
}

// Listar pedidos con filtros de fecha y estado
router.get('/', (req, res) => {
    try {
        const { status, payment_status, period, date } = req.query;
        let sql = `
            SELECT 
                o.id,
                o.order_number,
                o.customer_id,
                o.delivery_date,
                o.delivery_time,
                o.delivery_type,
                o.delivery_address,
                o.status,
                o.payment_status,
                o.total_amount,
                o.total_cost,
                o.total_paid,
                (o.total_amount - o.total_paid) as pending_balance,
                o.inventory_deducted,
                o.notes,
                o.created_at,
                c.name as customer_name,
                c.phone as customer_phone,
                (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as items_count
            FROM orders o
            JOIN customers c ON o.customer_id = c.id
            WHERE 1=1
        `;
        const params = [];

        if (status) {
            sql += ` AND o.status = ?`;
            params.push(status);
        }

        if (payment_status) {
            sql += ` AND o.payment_status = ?`;
            params.push(payment_status);
        }

        if (date) {
            sql += ` AND o.delivery_date = ?`;
            params.push(date);
        } else if (period === 'today') {
            const today = new Date().toISOString().split('T')[0];
            sql += ` AND o.delivery_date = ?`;
            params.push(today);
        } else if (period === 'tomorrow') {
            const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
            sql += ` AND o.delivery_date = ?`;
            params.push(tomorrow);
        } else if (period === 'week') {
            const today = new Date().toISOString().split('T')[0];
            const nextWeek = new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0];
            sql += ` AND o.delivery_date BETWEEN ? AND ?`;
            params.push(today, nextWeek);
        }

        sql += ` ORDER BY o.delivery_date ASC, o.delivery_time ASC, o.id DESC`;

        const orders = query(sql, params);
        if (orders.length > 0) {
            const orderIds = orders.map(o => o.id);
            const placeholders = orderIds.map(() => '?').join(',');
            const allItems = query(`
                SELECT oi.id, oi.order_id, oi.product_id, oi.quantity, oi.unit_price, oi.subtotal, oi.notes, p.name as product_name, p.category as product_category
                FROM order_items oi
                JOIN products p ON oi.product_id = p.id
                WHERE oi.order_id IN (${placeholders})
            `, orderIds);
            const itemsByOrder = {};
            for (const it of allItems) {
                if (!itemsByOrder[it.order_id]) itemsByOrder[it.order_id] = [];
                itemsByOrder[it.order_id].push(it);
            }
            for (const o of orders) {
                o.items = itemsByOrder[o.id] || [];
            }
        }
        res.json(orders);
    } catch (err) {
        console.error('Error listando pedidos:', err);
        res.status(500).json({ error: 'Error al consultar pedidos' });
    }
});

// Detalle de un pedido específico
router.get('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const order = get(`
            SELECT 
                o.*,
                (o.total_amount - o.total_paid) as pending_balance,
                c.name as customer_name,
                c.phone as customer_phone,
                c.email as customer_email,
                c.address as customer_default_address
            FROM orders o
            JOIN customers c ON o.customer_id = c.id
            WHERE o.id = ?
        `, [id]);

        if (!order) {
            return res.status(404).json({ error: 'Pedido no encontrado' });
        }

        const items = query(`
            SELECT 
                oi.*,
                p.name as product_name,
                p.category as product_category,
                p.yield_unit
            FROM order_items oi
            JOIN products p ON oi.product_id = p.id
            WHERE oi.order_id = ?
        `, [id]);

        const payments = query(`
            SELECT * FROM payments WHERE order_id = ? ORDER BY payment_date ASC
        `, [id]);

        res.json({
            ...order,
            items,
            payments
        });
    } catch (err) {
        console.error('Error obteniendo pedido:', err);
        res.status(500).json({ error: 'Error al consultar pedido' });
    }
});

// Crear nuevo pedido
router.post('/', (req, res) => {
    try {
        const {
            customer_id,
            delivery_date,
            delivery_time,
            delivery_type,
            delivery_address,
            notes,
            items, // Array de { product_id, quantity, unit_price, notes }
            initial_payment, // Opcional { amount, payment_method, reference }
            deduct_inventory_now
        } = req.body;

        if (!customer_id || !delivery_date || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Cliente, fecha de entrega y al menos un producto son obligatorios' });
        }

        // Generar número de pedido único legible (ej: PED-2026-0005)
        const year = new Date().getFullYear();
        const countRow = get('SELECT COUNT(*) as c FROM orders');
        const nextNum = (countRow.c + 1).toString().padStart(4, '0');
        const orderNumber = `PED-${year}-${nextNum}`;

        let totalAmount = 0;
        let totalCost = 0;

        // Calcular totales de los productos
        const processedItems = [];
        for (const it of items) {
            const product = get('SELECT * FROM products WHERE id = ?', [it.product_id]);
            if (!product) continue;

            const qty = parseFloat(it.quantity) || 1;
            const price = it.unit_price !== undefined ? parseFloat(it.unit_price) : product.sale_price;
            const subtotal = qty * price;
            totalAmount += subtotal;

            // Calcular costo de insumos de este item
            const yieldQty = product.yield_quantity > 0 ? product.yield_quantity : 1;
            const recipeCostRow = get(`
                SELECT COALESCE(SUM(r.quantity * i.cost_per_unit), 0) as cost
                FROM recipes r
                JOIN ingredients i ON r.ingredient_id = i.id
                WHERE r.product_id = ?
            `, [it.product_id]);
            const unitCost = recipeCostRow ? (recipeCostRow.cost / yieldQty) : 0;
            totalCost += (unitCost * qty);

            processedItems.push({
                product_id: it.product_id,
                quantity: qty,
                unit_price: price,
                unit_cost: unitCost,
                subtotal: subtotal,
                notes: it.notes || ''
            });
        }

        let orderId;
        transaction(() => {
            // Determinar abono inicial si viene
            const initialAmount = (initial_payment && parseFloat(initial_payment.amount)) || 0;
            let paymentStatus = 'PENDIENTE';
            if (initialAmount >= totalAmount) {
                paymentStatus = 'PAGADO';
            } else if (initialAmount > 0) {
                paymentStatus = 'ABONO_PARCIAL';
            }

            const orderResult = run(`
                INSERT INTO orders (
                    order_number, customer_id, delivery_date, delivery_time, delivery_type, 
                    delivery_address, status, payment_status, total_amount, total_cost, 
                    total_paid, inventory_deducted, notes
                ) VALUES (?, ?, ?, ?, ?, ?, 'PENDIENTE', ?, ?, ?, ?, 0, ?)
            `, [
                orderNumber,
                customer_id,
                delivery_date,
                delivery_time || '12:00',
                delivery_type || 'RETIRO',
                delivery_address || '',
                paymentStatus,
                totalAmount,
                totalCost,
                initialAmount,
                notes || ''
            ]);

            orderId = orderResult.lastInsertRowid;

            // Insertar items
            for (const item of processedItems) {
                run(`
                    INSERT INTO order_items (order_id, product_id, quantity, unit_price, unit_cost, subtotal, notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `, [orderId, item.product_id, item.quantity, item.unit_price, item.unit_cost, item.subtotal, item.notes]);
            }

            // Registrar abono inicial si existe
            if (initialAmount > 0) {
                run(`
                    INSERT INTO payments (order_id, customer_id, amount, payment_method, reference, notes)
                    VALUES (?, ?, ?, ?, ?, ?)
                `, [
                    orderId,
                    customer_id,
                    initialAmount,
                    initial_payment.payment_method || 'EFECTIVO',
                    initial_payment.reference || 'Anticipo al crear pedido',
                    'Abono inicial registrado con la creación del pedido'
                ]);
            }

            // Descontar inventario de inmediato si fue marcado
            if (deduct_inventory_now) {
                deductOrderInventory(orderId, orderNumber);
            }
        });

        const createdOrder = get('SELECT * FROM orders WHERE id = ?', [orderId]);
        res.status(201).json(createdOrder);
    } catch (err) {
        console.error('Error creando pedido:', err);
        res.status(500).json({ error: 'Error al guardar pedido' });
    }
});

// Cambiar estado de un pedido (Flujo de Producción & Entrega)
router.patch('/:id/status', (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const validStatuses = ['PENDIENTE', 'EN_PREPARACION', 'LISTO', 'ENTREGADO', 'CANCELADO'];

        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Estado de pedido no válido' });
        }

        const order = get('SELECT * FROM orders WHERE id = ?', [id]);
        if (!order) {
            return res.status(404).json({ error: 'Pedido no encontrado' });
        }

        transaction(() => {
            // Si pasa a EN_PREPARACION, LISTO o ENTREGADO y aún no se habían descontado los insumos, descontar ahora
            if (['EN_PREPARACION', 'LISTO', 'ENTREGADO'].includes(status) && order.inventory_deducted === 0) {
                deductOrderInventory(id, order.order_number);
            }

            // Si se cancela y ya se habían descontado insumos, devolverlos al inventario
            if (status === 'CANCELADO' && order.inventory_deducted === 1) {
                restoreOrderInventory(id, order.order_number);
            }

            run(`
                UPDATE orders
                SET status = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [status, id]);
        });

        const updated = get('SELECT * FROM orders WHERE id = ?', [id]);
        res.json({ message: `Estado actualizado a ${status}`, order: updated });
    } catch (err) {
        console.error('Error actualizando estado:', err);
        res.status(500).json({ error: 'Error al actualizar estado del pedido' });
    }
});

// Actualizar información del pedido (fecha, hora, notas)
router.put('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { delivery_date, delivery_time, delivery_type, delivery_address, notes } = req.body;

        const current = get('SELECT * FROM orders WHERE id = ?', [id]);
        if (!current) {
            return res.status(404).json({ error: 'Pedido no encontrado' });
        }

        run(`
            UPDATE orders
            SET delivery_date = ?, delivery_time = ?, delivery_type = ?, delivery_address = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [
            delivery_date || current.delivery_date,
            delivery_time || current.delivery_time,
            delivery_type || current.delivery_type,
            delivery_address !== undefined ? delivery_address : current.delivery_address,
            notes !== undefined ? notes : current.notes,
            id
        ]);

        const updated = get('SELECT * FROM orders WHERE id = ?', [id]);
        res.json(updated);
    } catch (err) {
        console.error('Error actualizando pedido:', err);
        res.status(500).json({ error: 'Error al actualizar pedido' });
    }
});


// Eliminar pedido (con restauración automática de inventario si ya fue descontado)
router.delete('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const order = get('SELECT * FROM orders WHERE id = ?', [id]);
        if (!order) {
            return res.status(404).json({ error: 'Pedido no encontrado' });
        }

        transaction(() => {
            // Si el inventario fue descontado, reponerlo automáticamente
            if (order.inventory_deducted === 1) {
                restoreOrderInventory(id, order.order_number);
            }

            // Eliminar pagos asociados
            run('DELETE FROM payments WHERE order_id = ?', [id]);

            // Eliminar items del pedido
            run('DELETE FROM order_items WHERE order_id = ?', [id]);

            // Eliminar pedido
            run('DELETE FROM orders WHERE id = ?', [id]);
        });

        res.json({ message: `Pedido #${order.order_number} eliminado con éxito` });
    } catch (err) {
        console.error('Error eliminando pedido:', err);
        res.status(500).json({ error: 'Error al eliminar el pedido' });
    }
});

module.exports = router;

