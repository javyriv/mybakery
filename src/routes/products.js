const express = require('express');
const router = express.Router();
const { query, get, run, transaction } = require('../database/db');

// Función auxiliar para calcular el costo total de los insumos de una receta
function getProductCostAndRecipe(productId, yieldQty = 1) {
    const effectiveYield = parseFloat(yieldQty) > 0 ? parseFloat(yieldQty) : 1;
    const items = query(`
        SELECT 
            r.id as recipe_item_id,
            r.ingredient_id,
            r.quantity as recipe_quantity,
            r.notes as recipe_notes,
            i.name as ingredient_name,
            i.category as ingredient_category,
            i.unit as ingredient_unit,
            i.cost_per_unit,
            i.current_stock,
            (r.quantity * i.cost_per_unit) as ingredient_total_cost
        FROM recipes r
        JOIN ingredients i ON r.ingredient_id = i.id
        WHERE r.product_id = ?
        ORDER BY i.name ASC
    `, [productId]);

    const enrichedItems = items.map(it => {
        const unitQty = Math.round((it.recipe_quantity / effectiveYield) * 10000) / 10000;
        const unitCost = Math.round((it.ingredient_total_cost / effectiveYield) * 100) / 100;
        return {
            ...it,
            unit_quantity: unitQty,
            unit_cost: unitCost
        };
    });

    const totalCost = items.reduce((sum, item) => sum + (item.ingredient_total_cost || 0), 0);
    return { items: enrichedItems, totalCost };
}

// Listar todos los productos con costos y margen calculados
router.get('/', (req, res) => {
    try {
        const products = query(`
            SELECT 
                p.id,
                p.name,
                p.category,
                p.description,
                p.sale_price,
                p.yield_quantity,
                p.yield_unit,
                p.raw_weight,
                p.raw_weight_unit,
                p.is_active,
                p.created_at,
                (
                    SELECT COALESCE(SUM(r.quantity * i.cost_per_unit), 0)
                    FROM recipes r
                    JOIN ingredients i ON r.ingredient_id = i.id
                    WHERE r.product_id = p.id
                ) as total_recipe_cost,
                (
                    SELECT COUNT(*)
                    FROM recipes r
                    WHERE r.product_id = p.id
                ) as ingredients_count
            FROM products p
            WHERE p.is_active = 1
            ORDER BY p.category ASC, p.name ASC
        `);

        // Calcular costo por unidad producida y margen de ganancia
        const enriched = products.map(p => {
            const yieldQty = p.yield_quantity > 0 ? parseFloat(p.yield_quantity) : 1;
            const unitCost = p.total_recipe_cost / yieldQty;
            const grossProfit = p.sale_price - unitCost;
            const profitMarginPct = p.sale_price > 0 ? ((grossProfit / p.sale_price) * 100) : 0;
            const rawWeight = parseFloat(p.raw_weight) || 0;
            const totalRawWeight = Math.round(rawWeight * yieldQty * 100) / 100;
            const batchGrossProfit = (p.sale_price * yieldQty) - p.total_recipe_cost;

            return {
                ...p,
                raw_weight: rawWeight,
                raw_weight_unit: p.raw_weight_unit || 'g',
                total_raw_weight: totalRawWeight,
                unit_cost: Math.round(unitCost * 100) / 100,
                gross_profit: Math.round(grossProfit * 100) / 100,
                batch_gross_profit: Math.round(batchGrossProfit * 100) / 100,
                profit_margin_pct: Math.round(profitMarginPct * 10) / 10
            };
        });

        res.json(enriched);
    } catch (err) {
        console.error('Error obteniendo productos:', err);
        res.status(500).json({ error: 'Error al consultar catálogo de productos' });
    }
});

// Detalle de un producto con su receta desglosada
router.get('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const product = get('SELECT * FROM products WHERE id = ?', [id]);
        if (!product) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }

        const yieldQty = product.yield_quantity > 0 ? parseFloat(product.yield_quantity) : 1;
        const { items, totalCost } = getProductCostAndRecipe(id, yieldQty);
        const unitCost = totalCost / yieldQty;
        const grossProfit = product.sale_price - unitCost;
        const profitMarginPct = product.sale_price > 0 ? ((grossProfit / product.sale_price) * 100) : 0;
        const rawWeight = parseFloat(product.raw_weight) || 0;
        const totalRawWeight = Math.round(rawWeight * yieldQty * 100) / 100;
        const batchGrossProfit = (product.sale_price * yieldQty) - totalCost;

        res.json({
            ...product,
            raw_weight: rawWeight,
            raw_weight_unit: product.raw_weight_unit || 'g',
            total_raw_weight: totalRawWeight,
            recipe: items,
            total_recipe_cost: Math.round(totalCost * 100) / 100,
            unit_cost: Math.round(unitCost * 100) / 100,
            gross_profit: Math.round(grossProfit * 100) / 100,
            batch_gross_profit: Math.round(batchGrossProfit * 100) / 100,
            profit_margin_pct: Math.round(profitMarginPct * 10) / 10
        });
    } catch (err) {
        console.error('Error obteniendo producto:', err);
        res.status(500).json({ error: 'Error al consultar producto' });
    }
});

// Crear nuevo producto (con opción de incluir receta inicial)
router.post('/', (req, res) => {
    try {
        const { name, category, description, sale_price, yield_quantity, yield_unit, raw_weight, raw_weight_unit, recipe } = req.body;
        if (!name || !category) {
            return res.status(400).json({ error: 'Nombre y categoría son requeridos' });
        }

        let newProductId;
        transaction(() => {
            const result = run(`
                INSERT INTO products (name, category, description, sale_price, yield_quantity, yield_unit, raw_weight, raw_weight_unit)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                name.trim(),
                category.trim(),
                description ? description.trim() : '',
                parseFloat(sale_price) || 0,
                parseFloat(yield_quantity) || 1,
                yield_unit ? yield_unit.trim() : 'unidad',
                parseFloat(raw_weight) || 0,
                raw_weight_unit ? raw_weight_unit.trim() : 'g'
            ]);
            newProductId = result.lastInsertRowid;

            if (Array.isArray(recipe) && recipe.length > 0) {
                for (const item of recipe) {
                    if (item.ingredient_id && parseFloat(item.quantity) > 0) {
                        run(`
                            INSERT INTO recipes (product_id, ingredient_id, quantity, notes)
                            VALUES (?, ?, ?, ?)
                        `, [newProductId, item.ingredient_id, parseFloat(item.quantity), item.notes || '']);
                    }
                }
            }
        });

        const created = get('SELECT * FROM products WHERE id = ?', [newProductId]);
        res.status(201).json(created);
    } catch (err) {
        console.error('Error creando producto:', err);
        res.status(500).json({ error: 'Error al registrar producto' });
    }
});

// Actualizar producto
router.put('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { name, category, description, sale_price, yield_quantity, yield_unit, raw_weight, raw_weight_unit, is_active } = req.body;

        const current = get('SELECT * FROM products WHERE id = ?', [id]);
        if (!current) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }

        run(`
            UPDATE products
            SET name = ?, category = ?, description = ?, sale_price = ?, yield_quantity = ?, yield_unit = ?, raw_weight = ?, raw_weight_unit = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [
            name ? name.trim() : current.name,
            category ? category.trim() : current.category,
            description !== undefined ? description.trim() : current.description,
            sale_price !== undefined ? parseFloat(sale_price) : current.sale_price,
            yield_quantity !== undefined ? parseFloat(yield_quantity) : current.yield_quantity,
            yield_unit ? yield_unit.trim() : current.yield_unit,
            raw_weight !== undefined ? parseFloat(raw_weight) : (current.raw_weight || 0),
            raw_weight_unit ? raw_weight_unit.trim() : (current.raw_weight_unit || 'g'),
            is_active !== undefined ? parseInt(is_active) : current.is_active,
            id
        ]);

        const updated = get('SELECT * FROM products WHERE id = ?', [id]);
        res.json(updated);
    } catch (err) {
        console.error('Error actualizando producto:', err);
        res.status(500).json({ error: 'Error al actualizar producto' });
    }
});

// Guardar o reemplazar receta completa de un producto
router.post('/:id/recipe', (req, res) => {
    try {
        const { id } = req.params;
        const { items } = req.body; // Array de { ingredient_id, quantity, notes }

        const product = get('SELECT * FROM products WHERE id = ?', [id]);
        if (!product) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }

        if (!Array.isArray(items)) {
            return res.status(400).json({ error: 'Se esperaba un arreglo de ingredientes' });
        }

        transaction(() => {
            // Eliminar receta previa
            run('DELETE FROM recipes WHERE product_id = ?', [id]);

            // Insertar nuevos ingredientes
            for (const item of items) {
                const ingId = parseInt(item.ingredient_id);
                const qty = parseFloat(item.quantity);
                if (ingId && qty > 0) {
                    run(`
                        INSERT INTO recipes (product_id, ingredient_id, quantity, notes)
                        VALUES (?, ?, ?, ?)
                    `, [id, ingId, qty, item.notes ? item.notes.trim() : '']);
                }
            }
        });

        const yieldQty = product.yield_quantity > 0 ? parseFloat(product.yield_quantity) : 1;
        const { items: newItems, totalCost } = getProductCostAndRecipe(id, yieldQty);
        const unitCost = totalCost / yieldQty;
        const grossProfit = product.sale_price - unitCost;
        const profitMarginPct = product.sale_price > 0 ? ((grossProfit / product.sale_price) * 100) : 0;
        const batchGrossProfit = (product.sale_price * yieldQty) - totalCost;

        res.json({
            message: 'Receta actualizada con éxito',
            recipe: newItems,
            total_recipe_cost: Math.round(totalCost * 100) / 100,
            unit_cost: Math.round(unitCost * 100) / 100,
            gross_profit: Math.round(grossProfit * 100) / 100,
            batch_gross_profit: Math.round(batchGrossProfit * 100) / 100,
            profit_margin_pct: Math.round(profitMarginPct * 10) / 10
        });
    } catch (err) {
        console.error('Error actualizando receta:', err);
        res.status(500).json({ error: 'Error al actualizar receta del producto' });
    }
});


// Eliminar únicamente la receta de un producto
router.delete('/:id/recipe', (req, res) => {
    try {
        const { id } = req.params;
        const product = get('SELECT * FROM products WHERE id = ?', [id]);
        if (!product) return res.status(404).json({ error: 'Producto no encontrado' });

        run('DELETE FROM recipes WHERE product_id = ?', [id]);
        res.json({ message: `Receta del producto '${product.name}' eliminada con éxito` });
    } catch (err) {
        console.error('Error eliminando receta:', err);
        res.status(500).json({ error: 'Error al eliminar receta' });
    }
});

// Eliminar producto por completo
router.delete('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const force = req.query.force === 'true';

        const product = get('SELECT * FROM products WHERE id = ?', [id]);
        if (!product) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }

        const hasOrders = get('SELECT COUNT(*) as count FROM order_items WHERE product_id = ?', [id]);
        if (hasOrders && hasOrders.count > 0 && !force) {
            return res.status(400).json({ 
                error: `El producto '${product.name}' tiene ${hasOrders.count} pedidos asociados en el historial. ¿Deseas eliminarlo de forma definitiva junto con sus registros asociados?`,
                has_orders: true,
                orders_count: hasOrders.count
            });
        }

        transaction(() => {
            if (force && hasOrders && hasOrders.count > 0) {
                run('DELETE FROM order_items WHERE product_id = ?', [id]);
            }
            run('DELETE FROM productions WHERE product_id = ?', [id]);
            run('DELETE FROM recipes WHERE product_id = ?', [id]);
            run('DELETE FROM products WHERE id = ?', [id]);
        });

        res.json({ message: `Producto '${product.name}' y su receta eliminados con éxito` });
    } catch (err) {
        console.error('Error eliminando producto:', err);
        res.status(500).json({ error: 'Error al eliminar producto' });
    }
});

module.exports = router;
