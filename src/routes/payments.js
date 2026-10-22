const express = require('express');
const router = express.Router();
const { query, get, run, transaction } = require('../database/db');

// Listar pagos recientes
router.get('/', (req, res) => {
    try {
        const payments = query(`
            SELECT 
                p.id,
                p.order_id,
                p.customer_id,
                p.amount,
                p.payment_method,
                p.reference,
                p.notes,
                p.payment_date,
                o.order_number,
                o.total_amount,
                c.name as customer_name
            FROM payments p
            JOIN orders o ON p.order_id = o.id
            JOIN customers c ON p.customer_id = c.id
            ORDER BY p.payment_date DESC
            LIMIT 50
        `);
        res.json(payments);
    } catch (err) {
        console.error('Error obteniendo pagos:', err);
        res.status(500).json({ error: 'Error al consultar pagos' });
    }
});

// Registrar un abono o pago completo a un pedido
router.post('/', (req, res) => {
    try {
        const { order_id, amount, payment_method, reference, notes } = req.body;
        const payAmount = parseFloat(amount);

        if (!order_id || isNaN(payAmount) || payAmount <= 0) {
            return res.status(400).json({ error: 'Debe indicar un pedido válido y un monto de pago mayor a cero' });
        }

        const order = get('SELECT * FROM orders WHERE id = ?', [order_id]);
        if (!order) {
            return res.status(404).json({ error: 'Pedido no encontrado' });
        }

        let paymentId;
        let updatedOrder;

        transaction(() => {
            const payRes = run(`
                INSERT INTO payments (order_id, customer_id, amount, payment_method, reference, notes)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [
                order_id,
                order.customer_id,
                payAmount,
                payment_method || 'EFECTIVO',
                reference ? reference.trim() : '',
                notes ? notes.trim() : ''
            ]);
            paymentId = payRes.lastInsertRowid;

            // Recalcular total pagado del pedido sumando todos los pagos reales
            const totalPaidRow = get('SELECT COALESCE(SUM(amount), 0) as paid FROM payments WHERE order_id = ?', [order_id]);
            const newTotalPaid = totalPaidRow.paid;

            let newPaymentStatus = 'PENDIENTE';
            if (newTotalPaid >= order.total_amount) {
                newPaymentStatus = 'PAGADO';
            } else if (newTotalPaid > 0) {
                newPaymentStatus = 'ABONO_PARCIAL';
            }

            run(`
                UPDATE orders
                SET total_paid = ?, payment_status = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [newTotalPaid, newPaymentStatus, order_id]);

            updatedOrder = get(`
                SELECT 
                    o.*,
                    (o.total_amount - o.total_paid) as pending_balance,
                    c.name as customer_name
                FROM orders o
                JOIN customers c ON o.customer_id = c.id
                WHERE o.id = ?
            `, [order_id]);
        });

        res.status(201).json({
            message: 'Abono registrado con éxito',
            payment_id: paymentId,
            order: updatedOrder
        });
    } catch (err) {
        console.error('Error registrando pago:', err);
        res.status(500).json({ error: 'Error al registrar el abono' });
    }
});

module.exports = router;
