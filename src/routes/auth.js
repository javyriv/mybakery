const express = require('express');
const router = express.Router();
const { get, query, run } = require('../database/db');

// Autenticación de Usuario (Login)
router.post('/login', (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Nombre de usuario y contraseña son requeridos' });
        }

        const cleanUsername = String(username).trim().toLowerCase();
        const user = get('SELECT * FROM users WHERE LOWER(username) = ?', [cleanUsername]);

        if (!user) {
            return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
        }

        if (user.status !== 'ACTIVO') {
            return res.status(403).json({ error: 'Este usuario se encuentra inactivo. Contacte al administrador.' });
        }

        // Validación de contraseña (para admin permite None123. o None123 por compatibilidad)
        const trimmedPass = String(password).trim();
        const isPasswordValid = (user.password === trimmedPass) || 
                                (cleanUsername === 'admin' && (trimmedPass === 'None123.' || trimmedPass === 'None123'));

        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
        }

        // Retornar datos de sesión sin la contraseña
        const sessionUser = {
            id: user.id,
            name: user.name,
            username: user.username,
            role: user.role,
            status: user.status
        };

        res.json({
            message: `¡Bienvenido(a) a Dulce Menta, ${user.name}!`,
            user: sessionUser
        });
    } catch (err) {
        console.error('Error en autenticación:', err);
        res.status(500).json({ error: 'Error interno en el servidor de autenticación' });
    }
});

module.exports = router;
