const express = require('express');
const router = express.Router();
const { query, get, run, transaction } = require('../database/db');

// Listar clientes con resumen financiero (pedidos, facturado, adeudado)
router.get('/', (req, res) => {
    try {
        const customers = query(`
            SELECT 
                c.id,
                c.name,
                c.phone,
                c.email,
                c.address,
                c.notes,
                c.created_at,
                COUNT(o.id) as total_orders,
                COALESCE(SUM(CASE WHEN o.status != 'CANCELADO' THEN o.total_amount ELSE 0 END), 0) as total_purchases,
                COALESCE(SUM(CASE WHEN o.status != 'CANCELADO' THEN o.total_paid ELSE 0 END), 0) as total_paid,
                COALESCE(SUM(CASE WHEN o.status != 'CANCELADO' THEN (o.total_amount - o.total_paid) ELSE 0 END), 0) as pending_balance
            FROM customers c
            LEFT JOIN orders o ON c.id = o.customer_id
            GROUP BY c.id
            ORDER BY pending_balance DESC, c.name ASC
        `);
        res.json(customers);
    } catch (err) {
        console.error('Error listando clientes:', err);
        res.status(500).json({ error: 'Error al consultar directorio de clientes' });
    }
});

// Detalle de cliente con historial de pedidos y pagos
router.get('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const customer = get('SELECT * FROM customers WHERE id = ?', [id]);
        if (!customer) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        const orders = query(`
            SELECT 
                id,
                order_number,
                delivery_date,
                delivery_time,
                delivery_type,
                status,
                payment_status,
                total_amount,
                total_paid,
                (total_amount - total_paid) as balance,
                created_at
            FROM orders
            WHERE customer_id = ?
            ORDER BY created_at DESC
        `, [id]);

        const payments = query(`
            SELECT 
                p.id,
                p.order_id,
                p.amount,
                p.payment_method,
                p.reference,
                p.notes,
                p.payment_date,
                o.order_number
            FROM payments p
            JOIN orders o ON p.order_id = o.id
            WHERE p.customer_id = ?
            ORDER BY p.payment_date DESC
        `, [id]);

        const stats = {
            total_orders: orders.length,
            total_purchases: orders.filter(o => o.status !== 'CANCELADO').reduce((acc, o) => acc + o.total_amount, 0),
            total_paid: orders.filter(o => o.status !== 'CANCELADO').reduce((acc, o) => acc + o.total_paid, 0),
            pending_balance: orders.filter(o => o.status !== 'CANCELADO').reduce((acc, o) => acc + o.balance, 0)
        };

        res.json({
            ...customer,
            stats,
            orders,
            payments
        });
    } catch (err) {
        console.error('Error consultando cliente:', err);
        res.status(500).json({ error: 'Error al consultar cliente' });
    }
});

// Crear cliente
router.post('/', (req, res) => {
    try {
        const { name, phone, email, address, notes } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'El nombre del cliente es obligatorio' });
        }

        const result = run(`
            INSERT INTO customers (name, phone, email, address, notes)
            VALUES (?, ?, ?, ?, ?)
        `, [
            name.trim(),
            phone ? phone.trim() : '',
            email ? email.trim() : '',
            address ? address.trim() : '',
            notes ? notes.trim() : ''
        ]);

        const created = get('SELECT * FROM customers WHERE id = ?', [result.lastInsertRowid]);
        res.status(201).json(created);
    } catch (err) {
        console.error('Error creando cliente:', err);
        res.status(500).json({ error: 'Error al guardar cliente' });
    }
});

// Actualizar cliente
router.put('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { name, phone, email, address, notes } = req.body;

        const current = get('SELECT * FROM customers WHERE id = ?', [id]);
        if (!current) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        run(`
            UPDATE customers
            SET name = ?, phone = ?, email = ?, address = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [
            name ? name.trim() : current.name,
            phone !== undefined ? phone.trim() : current.phone,
            email !== undefined ? email.trim() : current.email,
            address !== undefined ? address.trim() : current.address,
            notes !== undefined ? notes.trim() : current.notes,
            id
        ]);

        const updated = get('SELECT * FROM customers WHERE id = ?', [id]);
        res.json(updated);
    } catch (err) {
        console.error('Error actualizando cliente:', err);
        res.status(500).json({ error: 'Error al actualizar cliente' });
    }
});


// Eliminar cliente (con soporte para borrado forzado de pedidos y pagos)
router.delete('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const force = req.query.force === 'true';

        const customer = get('SELECT * FROM customers WHERE id = ?', [id]);
        if (!customer) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        const hasOrders = get('SELECT COUNT(*) as count FROM orders WHERE customer_id = ?', [id]);
        if (hasOrders && hasOrders.count > 0 && !force) {
            return res.status(400).json({ 
                error: `El cliente '${customer.name}' tiene ${hasOrders.count} pedido(s) registrados. ¿Deseas forzar la eliminación de este cliente y todo su historial de pedidos y pagos?`,
                has_orders: true,
                orders_count: hasOrders.count
            });
        }

        transaction(() => {
            if (force && hasOrders && hasOrders.count > 0) {
                // Obtener pedidos del cliente
                const clientOrders = query('SELECT id FROM orders WHERE customer_id = ?', [id]);
                for (const o of clientOrders) {
                    run('DELETE FROM payments WHERE order_id = ?', [o.id]);
                    run('DELETE FROM order_items WHERE order_id = ?', [o.id]);
                }
                run('DELETE FROM payments WHERE customer_id = ?', [id]);
                run('DELETE FROM orders WHERE customer_id = ?', [id]);
            }

            run('DELETE FROM customers WHERE id = ?', [id]);
        });

        res.json({ message: `Cliente '${customer.name}' eliminado con éxito` });
    } catch (err) {
        console.error('Error eliminando cliente:', err);
        res.status(500).json({ error: 'Error al eliminar cliente' });
    }
});

module.exports = router;
