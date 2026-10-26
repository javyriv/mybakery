const express = require('express');
const router = express.Router();
const { query, get, run, transaction } = require('../database/db');

// Proyección de insumos y costos para una cantidad dada de producto
router.post('/project', (req, res) => {
    try {
        const { product_id, quantity } = req.body;
        const qty = parseFloat(quantity);

        if (!product_id || isNaN(qty) || qty <= 0) {
            return res.status(400).json({ error: 'Debe especificar el producto y una cantidad válida mayor a cero' });
        }

        const product = get('SELECT * FROM products WHERE id = ?', [product_id]);
        if (!product) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }

        // Obtener ingredientes de la receta base
        const recipeItems = query(`
            SELECT 
                r.ingredient_id,
                r.quantity as base_quantity,
                i.name as ingredient_name,
                i.category as ingredient_category,
                i.unit as ingredient_unit,
                i.cost_per_unit,
                i.current_stock,
                i.min_stock
            FROM recipes r
            JOIN ingredients i ON r.ingredient_id = i.id
            WHERE r.product_id = ?
            ORDER BY i.name ASC
        `, [product_id]);

        if (recipeItems.length === 0) {
            return res.status(400).json({ 
                error: 'Este producto no tiene una receta configurada todavía. Vaya a Catálogo & Recetas para agregar los ingredientes.' 
            });
        }

        // Factor de escala: cantidad a producir dividido entre el rendimiento base de la receta
        const yieldQty = product.yield_quantity > 0 ? product.yield_quantity : 1;
        const scaleFactor = qty / yieldQty;

        let totalProductionCost = 0;
        let hasShortage = false;

        const calculatedIngredients = recipeItems.map(item => {
            const requiredQuantity = Math.round((item.base_quantity * scaleFactor) * 1000) / 1000;
            const itemTotalCost = Math.round((requiredQuantity * item.cost_per_unit) * 100) / 100;
            totalProductionCost += itemTotalCost;

            const isEnough = item.current_stock >= requiredQuantity;
            const shortage = isEnough ? 0 : Math.round((requiredQuantity - item.current_stock) * 1000) / 1000;
            if (!isEnough) hasShortage = true;

            return {
                ingredient_id: item.ingredient_id,
                name: item.ingredient_name,
                category: item.ingredient_category,
                unit: item.ingredient_unit,
                unit_cost: item.cost_per_unit,
                base_quantity: item.base_quantity,
                required_quantity: requiredQuantity,
                current_stock: item.current_stock,
                is_enough: isEnough,
                shortage: shortage,
                total_cost: itemTotalCost
            };
        });

        // Ingreso proyectado por venta (unidades a producir * precio de venta unitario)
        const expectedRevenue = Math.round((qty * product.sale_price) * 100) / 100;
        const expectedGrossProfit = Math.round((expectedRevenue - totalProductionCost) * 100) / 100;
        const profitMarginPct = expectedRevenue > 0 
            ? Math.round(((expectedGrossProfit / expectedRevenue) * 100) * 10) / 10 
            : 0;

        res.json({
            product: {
                id: product.id,
                name: product.name,
                category: product.category,
                sale_price: product.sale_price,
                yield_quantity: product.yield_quantity,
                yield_unit: product.yield_unit
            },
            production_plan: {
                quantity_to_produce: qty,
                scale_factor: Math.round(scaleFactor * 1000) / 1000,
                batches: Math.round(scaleFactor * 10) / 10,
                ingredients: calculatedIngredients,
                has_shortage: hasShortage,
                total_cost: totalProductionCost,
                expected_revenue: expectedRevenue,
                expected_profit: expectedGrossProfit,
                profit_margin_pct: profitMarginPct
            }
        });
    } catch (err) {
        console.error('Error calculando proyección:', err);
        res.status(500).json({ error: 'Error al calcular proyección de insumos' });
    }
});

// Ejecutar producción (Descuenta los insumos del inventario y registra la hornada)
router.post('/execute', (req, res) => {
    try {
        const { product_id, quantity, notes, allow_negative_stock } = req.body;
        const qty = parseFloat(quantity);

        if (!product_id || isNaN(qty) || qty <= 0) {
            return res.status(400).json({ error: 'Producto y cantidad válida requeridos' });
        }

        const product = get('SELECT * FROM products WHERE id = ?', [product_id]);
        if (!product) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }

        const recipeItems = query(`
            SELECT 
                r.ingredient_id,
                r.quantity as base_quantity,
                i.name as ingredient_name,
                i.unit as ingredient_unit,
                i.cost_per_unit,
                i.current_stock
            FROM recipes r
            JOIN ingredients i ON r.ingredient_id = i.id
            WHERE r.product_id = ?
        `, [product_id]);

        if (recipeItems.length === 0) {
            return res.status(400).json({ error: 'El producto no tiene receta definida' });
        }

        const yieldQty = product.yield_quantity > 0 ? product.yield_quantity : 1;
        const scaleFactor = qty / yieldQty;

        // Verificar stock si no se permite negativo
        if (!allow_negative_stock) {
            for (const item of recipeItems) {
                const required = item.base_quantity * scaleFactor;
                if (item.current_stock < required) {
                    return res.status(400).json({
                        error: `Stock insuficiente para '${item.ingredient_name}'. Requerido: ${Math.round(required * 100) / 100} ${item.ingredient_unit}, Disponible: ${item.current_stock} ${item.ingredient_unit}.`
                    });
                }
            }
        }

        let totalCost = 0;
        let productionId;

        transaction(() => {
            // Descontar cada ingrediente y registrar movimiento
            for (const item of recipeItems) {
                const required = Math.round((item.base_quantity * scaleFactor) * 1000) / 1000;
                const cost = Math.round((required * item.cost_per_unit) * 100) / 100;
                totalCost += cost;

                run(`
                    UPDATE ingredients 
                    SET current_stock = current_stock - ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `, [required, item.ingredient_id]);

                run(`
                    INSERT INTO inventory_movements (ingredient_id, type, quantity, unit_cost, reference, notes)
                    VALUES (?, 'SALIDA_PRODUCCION', ?, ?, ?, ?)
                `, [
                    item.ingredient_id,
                    required,
                    item.cost_per_unit,
                    `Producción: ${qty} ${product.name}`,
                    notes || 'Consumo automático de insumos por producción'
                ]);
            }

            const revenue = Math.round((qty * product.sale_price) * 100) / 100;
            const prodRes = run(`
                INSERT INTO productions (product_id, quantity, total_cost, expected_revenue, notes)
                VALUES (?, ?, ?, ?, ?)
            `, [product_id, qty, totalCost, revenue, notes || `Elaboración de ${qty} ${product.name}`]);
            productionId = prodRes.lastInsertRowid;
        });

        res.status(201).json({
            message: '¡Producción ejecutada con éxito! Insumos descontados del inventario.',
            production_id: productionId,
            product_name: product.name,
            quantity_produced: qty,
            total_cost_consumed: totalCost
        });
    } catch (err) {
        console.error('Error ejecutando producción:', err);
        res.status(500).json({ error: 'Error al registrar producción' });
    }
});

// Listar historial de producciones
router.get('/history', (req, res) => {
    try {
        const history = query(`
            SELECT 
                pr.id,
                pr.quantity,
                pr.total_cost,
                pr.expected_revenue,
                pr.production_date,
                pr.notes,
                p.name as product_name,
                p.yield_unit
            FROM productions pr
            JOIN products p ON pr.product_id = p.id
            ORDER BY pr.production_date DESC
            LIMIT 50
        `);
        res.json(history);
    } catch (err) {
        console.error('Error obteniendo historial de producción:', err);
        res.status(500).json({ error: 'Error al consultar historial' });
    }
});

module.exports = router;
