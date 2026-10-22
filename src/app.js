const express = require('express');
const cors = require('cors');
const path = require('path');

const inventoryRoutes = require('./routes/inventory');
const productsRoutes = require('./routes/products');
const productionRoutes = require('./routes/production');
const customersRoutes = require('./routes/customers');
const ordersRoutes = require('./routes/orders');
const paymentsRoutes = require('./routes/payments');
const metricsRoutes = require('./routes/metrics');
const settingsRoutes = require('./routes/settings');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, '../public')));

// Enrutamiento de la API REST
app.use('/api/inventory', inventoryRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/production', productionRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/metrics', metricsRoutes);
app.use('/api/settings', settingsRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        system: 'Dulce Menta Bakery System',
        timestamp: new Date().toISOString()
    });
});

// Fallback SPA
app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api/')) {
        return res.sendFile(path.join(__dirname, '../public/index.html'));
    }
    next();
});

module.exports = app;
