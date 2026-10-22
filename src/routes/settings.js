const express = require('express');
const router = express.Router();
const { query, run, transaction } = require('../database/db');

// Obtener todas las configuraciones
router.get('/', (req, res) => {
    try {
        const rows = query('SELECT key, value FROM settings');
        const settings = {};
        for (const row of rows) {
            settings[row.key] = row.value;
        }
        res.json(settings);
    } catch (err) {
        console.error('Error obteniendo configuraciones:', err);
        res.status(500).json({ error: 'Error al consultar configuraciones' });
    }
});

// Guardar configuraciones
router.post('/', (req, res) => {
    try {
        const settings = req.body;
        transaction(() => {
            for (const [key, value] of Object.entries(settings)) {
                run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, String(value)]);
            }
        });
        res.json({ message: 'Configuraciones guardadas con éxito' });
    } catch (err) {
        console.error('Error guardando configuraciones:', err);
        res.status(500).json({ error: 'Error al guardar configuraciones' });
    }
});

module.exports = router;
