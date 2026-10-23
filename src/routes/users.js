const express = require('express');
const router = express.Router();
const { query, get, run } = require('../database/db');

// Listar todos los usuarios
router.get('/', (req, res) => {
    try {
        const users = query(`
            SELECT id, name, username, role, status, created_at, updated_at
            FROM users
            ORDER BY id ASC
        `);
        res.json(users);
    } catch (err) {
        console.error('Error obteniendo usuarios:', err);
        res.status(500).json({ error: 'Error al consultar lista de usuarios' });
    }
});

// Obtener un usuario por ID
router.get('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const user = get('SELECT id, name, username, role, status, created_at, updated_at FROM users WHERE id = ?', [id]);
        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        res.json(user);
    } catch (err) {
        console.error('Error obteniendo usuario:', err);
        res.status(500).json({ error: 'Error al consultar usuario' });
    }
});

// Crear nuevo usuario
router.post('/', (req, res) => {
    try {
        const { name, username, password, role, status } = req.body;
        if (!name || !username || !password) {
            return res.status(400).json({ error: 'Nombre, nombre de usuario y contraseña son obligatorios' });
        }

        const cleanUsername = String(username).trim().toLowerCase();
        const existing = get('SELECT id FROM users WHERE LOWER(username) = ?', [cleanUsername]);
        if (existing) {
            return res.status(400).json({ error: `El nombre de usuario '${cleanUsername}' ya está registrado` });
        }

        const validRoles = ['ADMIN', 'PASTELERO', 'VENTAS'];
        const userRole = validRoles.includes(role) ? role : 'PASTELERO';
        const userStatus = status === 'INACTIVO' ? 'INACTIVO' : 'ACTIVO';

        const result = run(`
            INSERT INTO users (name, username, password, role, status)
            VALUES (?, ?, ?, ?, ?)
        `, [name.trim(), cleanUsername, String(password).trim(), userRole, userStatus]);

        const newUser = get('SELECT id, name, username, role, status, created_at FROM users WHERE id = ?', [result.lastInsertRowid]);
        res.status(201).json(newUser);
    } catch (err) {
        console.error('Error creando usuario:', err);
        res.status(500).json({ error: 'Error al crear usuario' });
    }
});

// Actualizar usuario existente
router.put('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { name, username, password, role, status } = req.body;

        const current = get('SELECT * FROM users WHERE id = ?', [id]);
        if (!current) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        // Si se cambia el nombre de usuario, verificar que no esté ocupado
        let newUsername = current.username;
        if (username) {
            newUsername = String(username).trim().toLowerCase();
            const existing = get('SELECT id FROM users WHERE LOWER(username) = ? AND id != ?', [newUsername, id]);
            if (existing) {
                return res.status(400).json({ error: `El nombre de usuario '${newUsername}' ya pertenece a otra persona` });
            }
        }

        // Prevenir que el usuario 'admin' principal quede inactivo o pierda rol ADMIN
        let newRole = role !== undefined ? role : current.role;
        let newStatus = status !== undefined ? status : current.status;
        if (current.username === 'admin') {
            newRole = 'ADMIN';
            newStatus = 'ACTIVO';
        }

        const newName = name !== undefined ? name.trim() : current.name;
        const newPassword = (password && String(password).trim()) ? String(password).trim() : current.password;

        run(`
            UPDATE users
            SET name = ?, username = ?, password = ?, role = ?, status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [newName, newUsername, newPassword, newRole, newStatus, id]);

        const updated = get('SELECT id, name, username, role, status, updated_at FROM users WHERE id = ?', [id]);
        res.json(updated);
    } catch (err) {
        console.error('Error actualizando usuario:', err);
        res.status(500).json({ error: 'Error al actualizar usuario' });
    }
});

// Eliminar usuario
router.delete('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const user = get('SELECT * FROM users WHERE id = ?', [id]);
        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        if (user.username === 'admin') {
            return res.status(403).json({ error: 'No es posible eliminar el usuario administrador principal (admin).' });
        }

        run('DELETE FROM users WHERE id = ?', [id]);
        res.json({ message: `Usuario '${user.name}' eliminado con éxito` });
    } catch (err) {
        console.error('Error eliminando usuario:', err);
        res.status(500).json({ error: 'Error al eliminar usuario' });
    }
});

module.exports = router;
