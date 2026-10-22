require('dotenv').config();
const http = require('http');
const os = require('os');
const app = require('./app');
const { initSchema } = require('./database/db');
const { seedDatabase } = require('./database/seed');

const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || '0.0.0.0';

// Obtener IPs locales de la red Wi-Fi / LAN para acceso móvil
function getNetworkAddresses() {
    const interfaces = os.networkInterfaces();
    const addresses = [];
    for (const name of Object.keys(interfaces)) {
        for (const net of interfaces[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                addresses.push(net.address);
            }
        }
    }
    return addresses;
}

// Inicializar base de datos
try {
    initSchema();
    seedDatabase();
} catch (err) {
    console.error('Error al inicializar la base de datos:', err);
}

const server = http.createServer(app);

server.listen(PORT, HOST, () => {
    const localIps = getNetworkAddresses();
    console.log('\n=========================================================');
    console.log('🥐 DULCE MENTA — SISTEMA DE GESTIÓN PARA REPOSTERÍA & PAN');
    console.log('=========================================================');
    console.log(`💻 Acceso Local (esta PC):   http://localhost:${PORT}`);
    if (localIps.length > 0) {
        localIps.forEach(ip => {
            console.log(`📱 Acceso Móvil (Celulares):  http://${ip}:${PORT}`);
        });
    }
    console.log('✨ Servidor listo y escuchando peticiones.');
    console.log('=========================================================\n');
});
