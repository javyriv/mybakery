const express = require('express');
const router = express.Router();
const { query, get, run, transaction } = require('../database/db');

// Listar todos los insumos con cálculo de alerta de stock bajo
router.get('/', (req, res) => {
    try {
        const ingredients = query(`
            SELECT 
                id, 
                name, 
                category, 
                unit, 
                cost_per_unit, 
                current_stock, 
                min_stock, 
                notes,
                CASE 
                    WHEN current_stock <= 0 THEN 'AGOTADO'
                    WHEN current_stock <= min_stock THEN 'BAJO'
                    ELSE 'OPTIMO'
                END as stock_status,
                (current_stock * cost_per_unit) as total_value
            FROM ingredients
            ORDER BY 
                CASE 
                    WHEN current_stock <= 0 THEN 1
                    WHEN current_stock <= min_stock THEN 2
                    ELSE 3
                END,
                category ASC,
                name ASC
        `);
        res.json(ingredients);
    } catch (err) {
        console.error('Error obteniendo inventario:', err);
        res.status(500).json({ error: 'Error al consultar inventario' });
    }
});

// Listar únicamente insumos en alerta (Stock bajo o agotado)
router.get('/alerts', (req, res) => {
    try {
        const alerts = query(`
            SELECT 
                id, 
                name, 
                category, 
                unit, 
                cost_per_unit, 
                current_stock, 
                min_stock,
                (min_stock - current_stock) as deficit,
                CASE 
                    WHEN current_stock <= 0 THEN 'AGOTADO'
                    ELSE 'BAJO'
                END as alert_level
            FROM ingredients
            WHERE current_stock <= min_stock
            ORDER BY current_stock ASC
        `);
        res.json(alerts);
    } catch (err) {
        console.error('Error obteniendo alertas:', err);
        res.status(500).json({ error: 'Error al consultar alertas' });
    }
});

// Historial de movimientos de inventario
router.get('/movements', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const movements = query(`
            SELECT 
                m.id,
                m.type,
                m.quantity,
                m.unit_cost,
                m.reference,
                m.notes,
                m.created_at,
                i.name as ingredient_name,
                i.unit as ingredient_unit
            FROM inventory_movements m
            JOIN ingredients i ON m.ingredient_id = i.id
            ORDER BY m.created_at DESC
            LIMIT ?
        `, [limit]);
        res.json(movements);
    } catch (err) {
        console.error('Error obteniendo movimientos:', err);
        res.status(500).json({ error: 'Error al consultar movimientos' });
    }
});

// Crear nuevo insumo
router.post('/', (req, res) => {
    try {
        const { name, category, unit, cost_per_unit, current_stock, min_stock, notes } = req.body;
        if (!name || !category || !unit) {
            return res.status(400).json({ error: 'Nombre, categoría y unidad son obligatorios' });
        }

        const cost = parseFloat(cost_per_unit) || 0;
        const stock = parseFloat(current_stock) || 0;
        const min = parseFloat(min_stock) || 0;

        let newId;
        transaction(() => {
            const result = run(`
                INSERT INTO ingredients (name, category, unit, cost_per_unit, current_stock, min_stock, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [name.trim(), category.trim(), unit.trim(), cost, stock, min, notes ? notes.trim() : '']);
            newId = result.lastInsertRowid;

            if (stock > 0) {
                run(`
                    INSERT INTO inventory_movements (ingredient_id, type, quantity, unit_cost, reference, notes)
                    VALUES (?, 'ENTRADA', ?, ?, 'Stock Inicial', 'Registro inicial del insumo')
                `, [newId, stock, cost]);
            }
        });

        const created = get('SELECT * FROM ingredients WHERE id = ?', [newId]);
        res.status(201).json(created);
    } catch (err) {
        console.error('Error creando insumo:', err);
        res.status(500).json({ error: 'Error al guardar insumo' });
    }
});

// Actualizar insumo
router.put('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { name, category, unit, cost_per_unit, min_stock, notes } = req.body;

        const current = get('SELECT * FROM ingredients WHERE id = ?', [id]);
        if (!current) {
            return res.status(404).json({ error: 'Insumo no encontrado' });
        }

        run(`
            UPDATE ingredients
            SET name = ?, category = ?, unit = ?, cost_per_unit = ?, min_stock = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [
            name ? name.trim() : current.name,
            category ? category.trim() : current.category,
            unit ? unit.trim() : current.unit,
            cost_per_unit !== undefined ? parseFloat(cost_per_unit) : current.cost_per_unit,
            min_stock !== undefined ? parseFloat(min_stock) : current.min_stock,
            notes !== undefined ? notes.trim() : current.notes,
            id
        ]);

        const updated = get('SELECT * FROM ingredients WHERE id = ?', [id]);
        res.json(updated);
    } catch (err) {
        console.error('Error actualizando insumo:', err);
        res.status(500).json({ error: 'Error al actualizar insumo' });
    }
});

// Ajuste rápido de stock (Compra, Merma, Ajuste Manual)
router.post('/:id/adjust', (req, res) => {
    try {
        const { id } = req.params;
        const { type, quantity, unit_cost, notes, reference } = req.body;

        const current = get('SELECT * FROM ingredients WHERE id = ?', [id]);
        if (!current) {
            return res.status(404).json({ error: 'Insumo no encontrado' });
        }

        const qty = parseFloat(quantity);
        if (isNaN(qty) || qty <= 0) {
            return res.status(400).json({ error: 'La cantidad debe ser un número positivo' });
        }

        let newStock = current.current_stock;
        const newCost = unit_cost !== undefined && unit_cost !== '' ? parseFloat(unit_cost) : current.cost_per_unit;

        if (type === 'ENTRADA') {
            newStock += qty;
        } else if (type === 'MERMA' || type === 'AJUSTE_RESTA') {
            newStock = Math.max(0, newStock - qty);
        } else if (type === 'AJUSTE_EXACTO') {
            newStock = qty;
        } else {
            return res.status(400).json({ error: 'Tipo de movimiento inválido (ENTRADA, MERMA, AJUSTE_EXACTO)' });
        }

        transaction(() => {
            run(`
                UPDATE ingredients
                SET current_stock = ?, cost_per_unit = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [newStock, newCost, id]);

            run(`
                INSERT INTO inventory_movements (ingredient_id, type, quantity, unit_cost, reference, notes)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [
                id, 
                type, 
                qty, 
                newCost, 
                reference || (type === 'ENTRADA' ? 'Compra / Reabastecimiento' : 'Ajuste de inventario'), 
                notes || ''
            ]);
        });

        const updated = get('SELECT * FROM ingredients WHERE id = ?', [id]);
        res.json({ message: 'Stock actualizado con éxito', ingredient: updated });
    } catch (err) {
        console.error('Error ajustando stock:', err);
        res.status(500).json({ error: 'Error al ajustar stock' });
    }
});


// Eliminar insumo (con opción de forzar remoción de recetas asociadas)
router.delete('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const force = req.query.force === 'true';

        const ingredient = get('SELECT * FROM ingredients WHERE id = ?', [id]);
        if (!ingredient) {
            return res.status(404).json({ error: 'Insumo no encontrado' });
        }

        const inRecipes = get('SELECT COUNT(*) as count FROM recipes WHERE ingredient_id = ?', [id]);
        if (inRecipes && inRecipes.count > 0 && !force) {
            return res.status(400).json({ 
                error: `El insumo '${ingredient.name}' está siendo utilizado en ${inRecipes.count} receta(s). ¿Deseas forzar la eliminación y retirarlo de todas las recetas?`,
                in_recipes: true,
                recipes_count: inRecipes.count
            });
        }

        transaction(() => {
            if (force && inRecipes && inRecipes.count > 0) {
                run('DELETE FROM recipes WHERE ingredient_id = ?', [id]);
            }
            run('DELETE FROM inventory_movements WHERE ingredient_id = ?', [id]);
            run('DELETE FROM ingredients WHERE id = ?', [id]);
        });

        res.json({ message: `Insumo '${ingredient.name}' eliminado con éxito` });
    } catch (err) {
        console.error('Error eliminando insumo:', err);
        res.status(500).json({ error: 'Error al eliminar insumo' });
    }
});

module.exports = router;
