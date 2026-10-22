const path = require('path');
const fs = require('fs');
require('dotenv').config();

const dbPath = process.env.DB_PATH || path.join(__dirname, '../../data/bakery.db');
const resolvedDbPath = path.resolve(process.cwd(), dbPath);

// Asegurar que la carpeta 'data' exista
const dbDir = path.dirname(resolvedDbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

let dbInstance = null;

function getDb() {
    if (dbInstance) return dbInstance;

    try {
        // Intentar usar el módulo nativo de Node.js 22+ (sin dependencias externas C++)
        const { DatabaseSync } = require('node:sqlite');
        const db = new DatabaseSync(resolvedDbPath);
        
        // Habilitar Foreign Keys y modo WAL para alta concurrencia
        db.exec('PRAGMA foreign_keys = ON;');
        db.exec('PRAGMA journal_mode = WAL;');

        dbInstance = {
            native: db,
            type: 'node:sqlite',
            query(sql, params = []) {
                const stmt = db.prepare(sql);
                return stmt.all(...params);
            },
            get(sql, params = []) {
                const stmt = db.prepare(sql);
                return stmt.get(...params) || null;
            },
            run(sql, params = []) {
                const stmt = db.prepare(sql);
                return stmt.run(...params);
            },
            exec(sql) {
                return db.exec(sql);
            },
            transaction(callback) {
                db.exec('BEGIN TRANSACTION;');
                try {
                    const result = callback(this);
                    db.exec('COMMIT;');
                    return result;
                } catch (err) {
                    db.exec('ROLLBACK;');
                    throw err;
                }
            }
        };
    } catch (err) {
        console.error('Error inicializando SQLite:', err);
        throw err;
    }

    return dbInstance;
}

// Inicializar tablas según schema.sql
function initSchema() {
    const db = getDb();
    const schemaFile = path.join(__dirname, 'schema.sql');
    if (fs.existsSync(schemaFile)) {
        const sql = fs.readFileSync(schemaFile, 'utf8');
        db.exec(sql);
    }
}

module.exports = {
    getDb,
    initSchema,
    query: (sql, params) => getDb().query(sql, params),
    get: (sql, params) => getDb().get(sql, params),
    run: (sql, params) => getDb().run(sql, params),
    exec: (sql) => getDb().exec(sql),
    transaction: (cb) => getDb().transaction(cb)
};
