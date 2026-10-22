const { getDb, initSchema, query, run, transaction } = require('./db');

function seedDatabase() {
    console.log('🥖 Inicializando y sembrando datos de prueba para Dulce Menta...');
    initSchema();

    // 1. Configuraciones
    const settings = [
        ['bakery_name', 'Dulce Menta — Panadería & Repostería Artesanal'],
        ['currency_symbol', '₡'],
        ['phone', '+506 8888-1234'],
        ['whatsapp', '50688881234'],
        ['address', 'Barrio Escalante, 100m Este del Parque, San José, Costa Rica'],
        ['low_stock_alerts_enabled', 'true']
    ];

    for (const [key, val] of settings) {
        run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, val]);
    }

    // Verificar si ya hay ingredientes cargados
    const existingIng = query('SELECT COUNT(*) as count FROM ingredients');
    if (existingIng[0].count > 0) {
        console.log('✅ La base de datos ya contiene información. Omitiendo sembrado de datos duplicados.');
        return;
    }

    transaction(() => {
        // 2. Ingredientes iniciales
        // Categorías: 'Harinas y Granos', 'Lácteos y Huevos', 'Grasas y Aceites', 'Azúcares y Chocolates', 'Especias y Frutas', 'Empaques'
        const ingredients = [
            // Nombre, Categoría, Unidad, Costo Unitario, Stock Actual, Stock Mínimo
            ['Harina de Fuerza Especial', 'Harinas y Granos', 'kg', 1100, 45, 15],
            ['Harina de Trigo Suave (Pastelería)', 'Harinas y Granos', 'kg', 950, 30, 10],
            ['Mantequilla Sin Sal 82% Grasa', 'Grasas y Aceites', 'kg', 5400, 18, 8],
            ['Azúcar Refinada', 'Azúcares y Chocolates', 'kg', 780, 25, 10],
            ['Azúcar Glass / En Polvo', 'Azúcares y Chocolates', 'kg', 1250, 12, 5],
            ['Huevos de Pastoreo', 'Lácteos y Huevos', 'unidad', 120, 180, 60],
            ['Leche Entera Cremosa', 'Lácteos y Huevos', 'L', 980, 22, 10],
            ['Crema de Leche / Crema Dulce 35%', 'Lácteos y Huevos', 'L', 2900, 9, 5],
            ['Queso Crema Tipo Filadelfia', 'Lácteos y Huevos', 'kg', 5900, 8, 4],
            ['Chocolate Amargo Belga 70%', 'Azúcares y Chocolates', 'kg', 9800, 6, 3],
            ['Cacao Puro en Polvo Alcalino', 'Azúcares y Chocolates', 'kg', 8200, 4, 2],
            ['Levadura Seca Instantánea', 'Harinas y Granos', 'g', 5.5, 450, 200],
            ['Polvo para Hornear', 'Harinas y Granos', 'g', 6.0, 600, 250],
            ['Esencia Pura de Vainilla Bourbon', 'Especias y Frutas', 'ml', 25.0, 350, 150],
            ['Zanahorias Dulces Frescas', 'Especias y Frutas', 'kg', 1200, 10, 4],
            ['Nueces Pecanas Seleccionadas', 'Especias y Frutas', 'g', 16.0, 950, 500],
            ['Frutos Rojos Silvestres (Moras/Frambuesas)', 'Especias y Frutas', 'kg', 6500, 3, 4], // ALERTA: Stock bajo (3 < 4)
            ['Sal Marina Fina', 'Especias y Frutas', 'g', 1.2, 2000, 500],
            ['Caja Artesanal para Queque Grande', 'Empaques', 'unidad', 850, 15, 20], // ALERTA: Stock bajo (15 < 20)
            ['Caja Individual con Visor', 'Empaques', 'unidad', 350, 65, 30],
            ['Bolsa de Papel Kraft Ecológica', 'Empaques', 'unidad', 180, 120, 50]
        ];

        const ingMap = {};
        for (const ing of ingredients) {
            const res = run(`
                INSERT INTO ingredients (name, category, unit, cost_per_unit, current_stock, min_stock)
                VALUES (?, ?, ?, ?, ?, ?)
            `, ing);
            ingMap[ing[0]] = res.lastInsertRowid;

            // Movimiento inicial de inventario
            run(`
                INSERT INTO inventory_movements (ingredient_id, type, quantity, unit_cost, reference, notes)
                VALUES (?, 'ENTRADA', ?, ?, 'Inventario Inicial', 'Carga inicial de apertura de la panadería')
            `, [res.lastInsertRowid, ing[4], ing[3]]);
        }

        // 3. Productos y Recetas
        // Producto 1: Queque Artesanal de Zanahoria & Nuez con Frosting (1 Queque de 10 porciones)
        const p1 = run(`
            INSERT INTO products (name, category, description, sale_price, yield_quantity, yield_unit)
            VALUES ('Queque de Zanahoria & Nuez con Frosting', 'Queques y Tartas', 'Bizcocho especiado con canela, nueces tostadas y cobertura suave de queso crema', 16500, 1, 'queque')
        `);
        const p1Id = p1.lastInsertRowid;
        const p1Recipe = [
            ['Harina de Trigo Suave (Pastelería)', 0.35], // 350g (0.35 kg)
            ['Azúcar Refinada', 0.28], // 280g
            ['Huevos de Pastoreo', 4], // 4 unidades
            ['Mantequilla Sin Sal 82% Grasa', 0.18], // 180g
            ['Zanahorias Dulces Frescas', 0.30], // 300g
            ['Nueces Pecanas Seleccionadas', 100], // 100g
            ['Polvo para Hornear', 12], // 12g
            ['Esencia Pura de Vainilla Bourbon', 10], // 10ml
            ['Queso Crema Tipo Filadelfia', 0.25], // 250g para el frosting
            ['Azúcar Glass / En Polvo', 0.15], // 150g para el frosting
            ['Caja Artesanal para Queque Grande', 1] // 1 empaque
        ];
        for (const [name, qty] of p1Recipe) {
            run('INSERT INTO recipes (product_id, ingredient_id, quantity) VALUES (?, ?, ?)', [p1Id, ingMap[name], qty]);
        }

        // Producto 2: Hogaza de Pan Rústico de Masa Madre (1 Hogaza de 750g)
        const p2 = run(`
            INSERT INTO products (name, category, description, sale_price, yield_quantity, yield_unit)
            VALUES ('Hogaza Rústica de Masa Madre', 'Panadería Artesanal', 'Fermentación lenta de 24 horas, corteza crujiente y miga abierta alveolada', 3800, 1, 'hogaza')
        `);
        const p2Id = p2.lastInsertRowid;
        const p2Recipe = [
            ['Harina de Fuerza Especial', 0.50], // 500g
            ['Sal Marina Fina', 10], // 10g
            ['Levadura Seca Instantánea', 2], // 2g
            ['Bolsa de Papel Kraft Ecológica', 1]
        ];
        for (const [name, qty] of p2Recipe) {
            run('INSERT INTO recipes (product_id, ingredient_id, quantity) VALUES (?, ?, ?)', [p2Id, ingMap[name], qty]);
        }

        // Producto 3: Galletas Chunky Chispas de Chocolate (Docena de 12 unidades)
        const p3 = run(`
            INSERT INTO products (name, category, description, sale_price, yield_quantity, yield_unit)
            VALUES ('Galletas Chunky con Doble Chocolate (Docena)', 'Galletas', 'Galletas estilo Nueva York, suaves por dentro y doradas por fuera con trozos de chocolate belga', 8500, 12, 'galletas')
        `);
        const p3Id = p3.lastInsertRowid;
        const p3Recipe = [
            ['Harina de Trigo Suave (Pastelería)', 0.32], // 320g
            ['Mantequilla Sin Sal 82% Grasa', 0.18], // 180g
            ['Azúcar Refinada', 0.20], // 200g
            ['Huevos de Pastoreo', 2], // 2 unidades
            ['Chocolate Amargo Belga 70%', 0.22], // 220g de chispas
            ['Polvo para Hornear', 6], // 6g
            ['Esencia Pura de Vainilla Bourbon', 8], // 8ml
            ['Caja Individual con Visor', 1] // empaque docena
        ];
        for (const [name, qty] of p3Recipe) {
            run('INSERT INTO recipes (product_id, ingredient_id, quantity) VALUES (?, ?, ?)', [p3Id, ingMap[name], qty]);
        }

        // Producto 4: Tarta Clásica de Frutos Rojos y Crema Pastelera
        const p4 = run(`
            INSERT INTO products (name, category, description, sale_price, yield_quantity, yield_unit)
            VALUES ('Tarta Sablé de Frutos Rojos', 'Queques y Tartas', 'Base crocante de mantequilla rellena de suave crema pastelera a la vainilla y cubierta de berries frescos', 14500, 1, 'tarta')
        `);
        const p4Id = p4.lastInsertRowid;
        const p4Recipe = [
            ['Harina de Trigo Suave (Pastelería)', 0.25],
            ['Mantequilla Sin Sal 82% Grasa', 0.15],
            ['Azúcar Glass / En Polvo', 0.10],
            ['Huevos de Pastoreo', 3],
            ['Leche Entera Cremosa', 0.35],
            ['Frutos Rojos Silvestres (Moras/Frambuesas)', 0.30],
            ['Esencia Pura de Vainilla Bourbon', 10],
            ['Caja Artesanal para Queque Grande', 1]
        ];
        for (const [name, qty] of p4Recipe) {
            run('INSERT INTO recipes (product_id, ingredient_id, quantity) VALUES (?, ?, ?)', [p4Id, ingMap[name], qty]);
        }

        // Producto 5: Croissant de Mantequilla Francesa (Pack x 4)
        const p5 = run(`
            INSERT INTO products (name, category, description, sale_price, yield_quantity, yield_unit)
            VALUES ('Croissants Artesanales de Mantequilla (Pack x 4)', 'Repostería Fina', 'Hojaldrado artesanal de capas perfectas con mantequilla pura al 82%', 6000, 4, 'croissants')
        `);
        const p5Id = p5.lastInsertRowid;
        const p5Recipe = [
            ['Harina de Fuerza Especial', 0.30],
            ['Mantequilla Sin Sal 82% Grasa', 0.16],
            ['Leche Entera Cremosa', 0.12],
            ['Azúcar Refinada', 0.04],
            ['Levadura Seca Instantánea', 5],
            ['Huevos de Pastoreo', 1],
            ['Bolsa de Papel Kraft Ecológica', 1]
        ];
        for (const [name, qty] of p5Recipe) {
            run('INSERT INTO recipes (product_id, ingredient_id, quantity) VALUES (?, ?, ?)', [p5Id, ingMap[name], qty]);
        }

        // 4. Clientes Iniciales
        const c1 = run(`
            INSERT INTO customers (name, phone, email, address, notes)
            VALUES ('Mariana Solano Gómez', '+506 8701-4455', 'mariana.solano@gmail.com', 'Condominio Roble Alto #24, Curridabat', 'Cliente habitual de fines de semana. Prefiere empaque extra seguro.')
        `);
        const c2 = run(`
            INSERT INTO customers (name, phone, email, address, notes)
            VALUES ('Cafetería El Tostador Gourmet', '+506 2234-9988', 'compras@eltostadorcr.com', 'Avenida Central, diagonal al Teatro Nacional', 'Pedido mayorista recurrente de pan de masa madre y croissants los martes y viernes.')
        `);
        const c3 = run(`
            INSERT INTO customers (name, phone, email, address, notes)
            VALUES ('Carlos Morales Vega', '+506 8333-2190', 'carlos.morales.v@outlook.com', 'San Pedro, 200m Sur de la Iglesia', 'Alergia severa al maní (no afecta a nueces, pero cuidar contaminación cruzada).')
        `);
        const c4 = run(`
            INSERT INTO customers (name, phone, email, address, notes)
            VALUES ('Sofía Ramírez Brenes', '+506 8912-7744', 'sofia.brenes@hotmail.com', 'Escazú Village, Torre B, Apto 502', 'Excelente pagadora por SINPE Móvil. Cumpleaños el 28 de cada mes.')
        `);

        // Fechas de hoy y próximos días
        const todayStr = new Date().toISOString().split('T')[0];
        const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
        const dayAfter = new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0];

        // 5. Pedidos de demostración
        // Pedido 1: Para HOY - En Preparación (Abonado al 50%)
        const o1 = run(`
            INSERT INTO orders (order_number, customer_id, delivery_date, delivery_time, delivery_type, delivery_address, status, payment_status, total_amount, total_cost, total_paid, inventory_deducted, notes)
            VALUES ('PED-2026-0001', ?, ?, '15:30', 'RETIRO', '', 'EN_PREPARACION', 'ABONO_PARCIAL', 16500, 4850, 10000, 1, 'Dedicatoria en chocolate blanco: "Feliz Cumple Mamá"')
        `, [c1.lastInsertRowid, todayStr]);
        const o1Id = o1.lastInsertRowid;
        run(`INSERT INTO order_items (order_id, product_id, quantity, unit_price, unit_cost, subtotal, notes) VALUES (?, ?, 1, 16500, 4850, 16500, 'Queque decorado')`, [o1Id, p1Id]);
        run(`INSERT INTO payments (order_id, customer_id, amount, payment_method, reference, notes) VALUES (?, ?, 10000, 'SINPE_TRANSFERENCIA', 'SINPE-98721', 'Adelanto 50% confirmado vía WhatsApp')`, [o1Id, c1.lastInsertRowid]);

        // Pedido 2: Para HOY - Listo para Entregar (Pagado 100%)
        const o2 = run(`
            INSERT INTO orders (order_number, customer_id, delivery_date, delivery_time, delivery_type, delivery_address, status, payment_status, total_amount, total_cost, total_paid, inventory_deducted, notes)
            VALUES ('PED-2026-0002', ?, ?, '17:00', 'DOMICILIO', 'Condominio Roble Alto #24, Curridabat', 'LISTO', 'PAGADO', 17000, 5200, 17000, 1, 'Enviar con repartidor en moto con cuidado')
        `, [c1.lastInsertRowid, todayStr]);
        const o2Id = o2.lastInsertRowid;
        run(`INSERT INTO order_items (order_id, product_id, quantity, unit_price, unit_cost, subtotal, notes) VALUES (?, ?, 2, 8500, 2600, 17000, '2 docenas de galletas chunky')`, [o2Id, p3Id]);
        run(`INSERT INTO payments (order_id, customer_id, amount, payment_method, reference, notes) VALUES (?, ?, 17000, 'TARJETA', 'AUTH-438901', 'Pago completo con datáfono')`, [o2Id, c1.lastInsertRowid]);

        // Pedido 3: Para MAÑANA - Pendiente (Pendiente de pago)
        const o3 = run(`
            INSERT INTO orders (order_number, customer_id, delivery_date, delivery_time, delivery_type, delivery_address, status, payment_status, total_amount, total_cost, total_paid, inventory_deducted, notes)
            VALUES ('PED-2026-0003', ?, ?, '09:00', 'DOMICILIO', 'Avenida Central, diagonal al Teatro Nacional', 'PENDIENTE', 'PENDIENTE', 31000, 8900, 0, 0, 'Entrega matutina para apertura de cafetería')
        `, [c2.lastInsertRowid, tomorrow]);
        const o3Id = o3.lastInsertRowid;
        run(`INSERT INTO order_items (order_id, product_id, quantity, unit_price, unit_cost, subtotal, notes) VALUES (?, ?, 5, 3800, 950, 19000, 'Panes de masa madre recién horneados')`, [o3Id, p2Id]);
        run(`INSERT INTO order_items (order_id, product_id, quantity, unit_price, unit_cost, subtotal, notes) VALUES (?, ?, 2, 6000, 1500, 12000, '2 packs de croissants')`, [o3Id, p5Id]);

        // Pedido 4: Pasado - Completado y Entregado
        const o4 = run(`
            INSERT INTO orders (order_number, customer_id, delivery_date, delivery_time, delivery_type, delivery_address, status, payment_status, total_amount, total_cost, total_paid, inventory_deducted, notes)
            VALUES ('PED-2026-0000', ?, ?, '11:00', 'RETIRO', '', 'ENTREGADO', 'PAGADO', 14500, 3900, 14500, 1, 'Tarta para evento familiar')
        `, [c4.lastInsertRowid, todayStr]);
        const o4Id = o4.lastInsertRowid;
        run(`INSERT INTO order_items (order_id, product_id, quantity, unit_price, unit_cost, subtotal, notes) VALUES (?, ?, 1, 14500, 3900, 14500, 'Tarta de Frutos Rojos')`, [o4Id, p4Id]);
        run(`INSERT INTO payments (order_id, customer_id, amount, payment_method, reference, notes) VALUES (?, ?, 14500, 'EFECTIVO', 'REC-0012', 'Pago en mostrador')`, [o4Id, c4.lastInsertRowid]);

        // 6. Registro de una producción reciente
        run(`
            INSERT INTO productions (product_id, quantity, total_cost, expected_revenue, notes)
            VALUES (?, 10, 9500, 38000, 'Horneada matutina de 10 hogazas de masa madre')
        `, [p2Id]);
    });

    console.log('✅ Base de datos sembrada con éxito con catálogo, recetas, inventario y pedidos de ejemplo.');
}

if (require.main === module) {
    seedDatabase();
}

module.exports = { seedDatabase };
