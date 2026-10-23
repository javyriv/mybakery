// =====================================================================
//  API FIREBASE — Dulce Menta Bakery System
//  Utiliza Firebase Realtime Database para sincronización en tiempo real
//  entre todos los dispositivos. Misma interfaz que el api.js original.
// =====================================================================

// ─── Configuración de Firebase ────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyBv5tL8c8EwRr-O7t9-1CpjuCrrRvd5bZU",
  authDomain:        "dulce-menta-bakery.firebaseapp.com",
  databaseURL:       "https://dulce-menta-bakery-default-rtdb.firebaseio.com",
  projectId:         "dulce-menta-bakery",
  storageBucket:     "dulce-menta-bakery.firebasestorage.app",
  messagingSenderId: "441399504837",
  appId:             "1:441399504837:web:5abeb9543536c4c34925ac"
};

firebase.initializeApp(firebaseConfig);
const _fireDb = firebase.database();
const ROOT    = 'dulcementa';

// ─── Control de inicialización de datos en Firebase ─────────────────
let _seedPromise = null;
function ensureDatabaseReady() {
  if (!_seedPromise) {
    _seedPromise = seedInitialData().catch(err => {
      console.error('Error al inicializar datos en Firebase:', err);
    });
  }
  return _seedPromise;
}

// ─── Capa de acceso a Firebase ───────────────────────────────────────
const DB = {
  // Leer colección → retorna array (Firebase guarda objetos indexados por id)
  async getList(collection) {
    await ensureDatabaseReady();
    const snap = await _fireDb.ref(`${ROOT}/${collection}`).get();
    if (!snap.exists()) return [];
    const val = snap.val();
    if (!val) return [];
    if (Array.isArray(val)) return val.filter(Boolean);
    return Object.values(val).filter(Boolean);
  },

  // Leer valor escalar (boolean, string, number)
  async getScalar(path) {
    if (path !== '_seeded') await ensureDatabaseReady();
    const snap = await _fireDb.ref(`${ROOT}/${path}`).get();
    return snap.exists() ? snap.val() : null;
  },

  // Escribir colección (convierte array → objeto keyed por id)
  async setList(collection, array) {
    const obj = {};
    (array || []).forEach(item => {
      if (item && item.id !== undefined) obj[String(item.id)] = item;
    });
    await _fireDb.ref(`${ROOT}/${collection}`).set(obj);
  },

  // Escribir un valor en una ruta (settings, flags, etc.)
  async setDoc(path, data) {
    await _fireDb.ref(`${ROOT}/${path}`).set(data);
  },

  // Helpers de fecha
  now()        { return new Date().toISOString(); },
  today()      { return new Date().toISOString().split('T')[0]; },
  dayOffset(n) { return new Date(Date.now() + 86400000 * n).toISOString().split('T')[0]; }
};

// ─── Helpers de cálculo (síncronos, sin I/O) ─────────────────────────
function stockStatus(ing) {
  if (ing.current_stock <= 0)              return 'AGOTADO';
  if (ing.current_stock <= ing.min_stock)  return 'BAJO';
  return 'OPTIMO';
}

function calcRecipeCostSync(recipes, ingredients, productId) {
  return recipes
    .filter(r => r.product_id == productId)
    .reduce((sum, r) => {
      const ing = ingredients.find(i => i.id == r.ingredient_id);
      return sum + (ing ? r.quantity * ing.cost_per_unit : 0);
    }, 0);
}

function enrichProductSync(p, recipes, ingredients) {
  const cost       = calcRecipeCostSync(recipes, ingredients, p.id);
  const unitCost   = p.yield_quantity > 0 ? cost / p.yield_quantity : cost;
  const profit     = p.sale_price - cost;
  const pct        = p.sale_price > 0 ? (profit / p.sale_price) * 100 : 0;
  return {
    ...p,
    total_recipe_cost: Math.round(cost * 100) / 100,
    unit_cost:         Math.round(unitCost * 100) / 100,
    gross_profit:      Math.round(profit * 100) / 100,
    profit_margin_pct: Math.round(pct * 10) / 10,
    ingredients_count: recipes.filter(r => r.product_id == p.id).length
  };
}

function enrichOrderSync(o, customers) {
  const c = customers.find(x => x.id == o.customer_id);
  return { ...o, pending_balance: o.total_amount - o.total_paid, customer_name: c ? c.name : '—', customer_phone: c ? c.phone : '' };
}

function nextId(arr) {
  if (!arr || arr.length === 0) return 1;
  return Math.max(...arr.map(r => r.id || 0)) + 1;
}

// ─── Movimientos de inventario ────────────────────────────────────────
async function _addMovement(ingredient_id, type, quantity, unit_cost, reference, notes) {
  const movs  = await DB.getList('inventory_movements');
  const newId = nextId(movs);
  movs.push({ id: newId, ingredient_id, type, quantity, unit_cost, reference, notes, created_at: DB.now() });
  await DB.setList('inventory_movements', movs);
}

// Descuenta insumos del inventario para un pedido.
// Recibe los arrays ya leídos para evitar lecturas duplicadas.
async function _deductOrderInventory(orderId, orderNumber, orderItems, allProducts, allRecipes, ingredients) {
  const items    = orderItems.filter(i => i.order_id == orderId);
  const updated  = [...ingredients];

  for (const item of items) {
    const product = allProducts.find(p => p.id == item.product_id);
    if (!product) continue;
    const recipeItems = allRecipes.filter(r => r.product_id == item.product_id);
    const yieldQty    = product.yield_quantity > 0 ? product.yield_quantity : 1;
    const scaleFactor = item.quantity / yieldQty;

    for (const rItem of recipeItems) {
      const required = Math.round(rItem.quantity * scaleFactor * 1000) / 1000;
      const ingIdx   = updated.findIndex(i => i.id == rItem.ingredient_id);
      if (ingIdx < 0) continue;
      const ing = updated[ingIdx];
      updated[ingIdx] = { ...ing, current_stock: Math.round((ing.current_stock - required) * 1000) / 1000, updated_at: DB.now() };
      await _addMovement(rItem.ingredient_id, 'SALIDA_PEDIDO', required, ing.cost_per_unit, `Pedido ${orderNumber}`, `Insumos descontados para ${item.quantity} ${product.name}`);
    }
  }
  return updated;
}

// Repone insumos al inventario cuando un pedido se cancela o elimina.
async function _restoreOrderInventory(orderId, orderNumber, orderItems, allProducts, allRecipes, ingredients) {
  const items   = orderItems.filter(i => i.order_id == orderId);
  const updated = [...ingredients];

  for (const item of items) {
    const product = allProducts.find(p => p.id == item.product_id);
    if (!product) continue;
    const recipeItems = allRecipes.filter(r => r.product_id == item.product_id);
    const yieldQty    = product.yield_quantity > 0 ? product.yield_quantity : 1;
    const scaleFactor = item.quantity / yieldQty;

    for (const rItem of recipeItems) {
      const returned = Math.round(rItem.quantity * scaleFactor * 1000) / 1000;
      const ingIdx   = updated.findIndex(i => i.id == rItem.ingredient_id);
      if (ingIdx < 0) continue;
      const ing = updated[ingIdx];
      updated[ingIdx] = { ...ing, current_stock: Math.round((ing.current_stock + returned) * 1000) / 1000, updated_at: DB.now() };
      await _addMovement(rItem.ingredient_id, 'ENTRADA', returned, ing.cost_per_unit, `Cancelación ${orderNumber}`, 'Reingreso de insumos por pedido cancelado');
    }
  }
  return updated;
}

// ─── Semilla de datos iniciales (solo se ejecuta una vez en Firebase) ─
async function seedInitialData() {
  const seeded = await DB.getScalar('_seeded');
  if (seeded) return;
  console.log('🥖 Inicializando datos de ejemplo en Firebase...');

  const ts = DB.now();

  await DB.setDoc('settings', {
    bakery_name: 'Dulce Menta — Panadería & Repostería Artesanal',
    currency_symbol: '₡', phone: '+506 8888-1234', whatsapp: '50688881234',
    address: 'Barrio Escalante, 100m Este del Parque, San José, Costa Rica',
    low_stock_alerts_enabled: 'true'
  });

  const ingredients = [
    { id:1,  name:'Harina de Fuerza Especial',                category:'Harinas y Granos',      unit:'kg',     cost_per_unit:1100,  current_stock:45,   min_stock:15,  notes:'' },
    { id:2,  name:'Harina de Trigo Suave (Pastelería)',        category:'Harinas y Granos',      unit:'kg',     cost_per_unit:950,   current_stock:30,   min_stock:10,  notes:'' },
    { id:3,  name:'Mantequilla Sin Sal 82% Grasa',             category:'Grasas y Aceites',      unit:'kg',     cost_per_unit:5400,  current_stock:18,   min_stock:8,   notes:'' },
    { id:4,  name:'Azúcar Refinada',                           category:'Azúcares y Chocolates', unit:'kg',     cost_per_unit:780,   current_stock:25,   min_stock:10,  notes:'' },
    { id:5,  name:'Azúcar Glass / En Polvo',                   category:'Azúcares y Chocolates', unit:'kg',     cost_per_unit:1250,  current_stock:12,   min_stock:5,   notes:'' },
    { id:6,  name:'Huevos de Pastoreo',                        category:'Lácteos y Huevos',      unit:'unidad', cost_per_unit:120,   current_stock:180,  min_stock:60,  notes:'' },
    { id:7,  name:'Leche Entera Cremosa',                      category:'Lácteos y Huevos',      unit:'L',      cost_per_unit:980,   current_stock:22,   min_stock:10,  notes:'' },
    { id:8,  name:'Crema de Leche / Crema Dulce 35%',          category:'Lácteos y Huevos',      unit:'L',      cost_per_unit:2900,  current_stock:9,    min_stock:5,   notes:'' },
    { id:9,  name:'Queso Crema Tipo Filadelfia',                category:'Lácteos y Huevos',      unit:'kg',     cost_per_unit:5900,  current_stock:8,    min_stock:4,   notes:'' },
    { id:10, name:'Chocolate Amargo Belga 70%',                 category:'Azúcares y Chocolates', unit:'kg',     cost_per_unit:9800,  current_stock:6,    min_stock:3,   notes:'' },
    { id:11, name:'Cacao Puro en Polvo Alcalino',               category:'Azúcares y Chocolates', unit:'kg',     cost_per_unit:8200,  current_stock:4,    min_stock:2,   notes:'' },
    { id:12, name:'Levadura Seca Instantánea',                  category:'Harinas y Granos',      unit:'g',      cost_per_unit:5.5,   current_stock:450,  min_stock:200, notes:'' },
    { id:13, name:'Polvo para Hornear',                         category:'Harinas y Granos',      unit:'g',      cost_per_unit:6.0,   current_stock:600,  min_stock:250, notes:'' },
    { id:14, name:'Esencia Pura de Vainilla Bourbon',           category:'Especias y Frutas',     unit:'ml',     cost_per_unit:25.0,  current_stock:350,  min_stock:150, notes:'' },
    { id:15, name:'Zanahorias Dulces Frescas',                  category:'Especias y Frutas',     unit:'kg',     cost_per_unit:1200,  current_stock:10,   min_stock:4,   notes:'' },
    { id:16, name:'Nueces Pecanas Seleccionadas',               category:'Especias y Frutas',     unit:'g',      cost_per_unit:16.0,  current_stock:950,  min_stock:500, notes:'' },
    { id:17, name:'Frutos Rojos Silvestres (Moras/Frambuesas)', category:'Especias y Frutas',     unit:'kg',     cost_per_unit:6500,  current_stock:3,    min_stock:4,   notes:'' },
    { id:18, name:'Sal Marina Fina',                            category:'Especias y Frutas',     unit:'g',      cost_per_unit:1.2,   current_stock:2000, min_stock:500, notes:'' },
    { id:19, name:'Caja Artesanal para Queque Grande',          category:'Empaques',              unit:'unidad', cost_per_unit:850,   current_stock:15,   min_stock:20,  notes:'' },
    { id:20, name:'Caja Individual con Visor',                  category:'Empaques',              unit:'unidad', cost_per_unit:350,   current_stock:65,   min_stock:30,  notes:'' },
    { id:21, name:'Bolsa de Papel Kraft Ecológica',             category:'Empaques',              unit:'unidad', cost_per_unit:180,   current_stock:120,  min_stock:50,  notes:'' }
  ].map(i => ({ ...i, created_at: ts, updated_at: ts }));
  await DB.setList('ingredients', ingredients);

  const movements = ingredients.map((ing, idx) => ({
    id: idx + 1, ingredient_id: ing.id, type: 'ENTRADA',
    quantity: ing.current_stock, unit_cost: ing.cost_per_unit,
    reference: 'Inventario Inicial', notes: 'Carga inicial de apertura', created_at: ts
  }));
  await DB.setList('inventory_movements', movements);

  const products = [
    { id:1, name:'Queque de Zanahoria & Nuez con Frosting',         category:'Queques y Tartas',    description:'Bizcocho especiado con canela, nueces tostadas y cobertura suave de queso crema',               sale_price:16500, yield_quantity:1,  yield_unit:'queque',     is_active:1 },
    { id:2, name:'Hogaza Rústica de Masa Madre',                     category:'Panadería Artesanal', description:'Fermentación lenta de 24 horas, corteza crujiente y miga abierta alveolada',                    sale_price:3800,  yield_quantity:1,  yield_unit:'hogaza',     is_active:1 },
    { id:3, name:'Galletas Chunky con Doble Chocolate (Docena)',     category:'Galletas',            description:'Galletas estilo Nueva York, suaves por dentro y doradas por fuera con trozos de chocolate belga', sale_price:8500,  yield_quantity:12, yield_unit:'galletas',   is_active:1 },
    { id:4, name:'Tarta Sablé de Frutos Rojos',                      category:'Queques y Tartas',    description:'Base crocante de mantequilla rellena de suave crema pastelera a la vainilla y cubierta de berries frescos', sale_price:14500, yield_quantity:1, yield_unit:'tarta', is_active:1 },
    { id:5, name:'Croissants Artesanales de Mantequilla (Pack x 4)', category:'Repostería Fina',     description:'Hojaldrado artesanal de capas perfectas con mantequilla pura al 82%',                            sale_price:6000,  yield_quantity:4,  yield_unit:'croissants', is_active:1 }
  ].map(p => ({ ...p, created_at: ts, updated_at: ts }));
  await DB.setList('products', products);

  const recipeData = [
    [1,2,0.35],[1,4,0.28],[1,6,4],[1,3,0.18],[1,15,0.30],[1,16,100],[1,13,12],[1,14,10],[1,9,0.25],[1,5,0.15],[1,19,1],
    [2,1,0.50],[2,18,10],[2,12,2],[2,21,1],
    [3,2,0.32],[3,3,0.18],[3,4,0.20],[3,6,2],[3,10,0.22],[3,13,6],[3,14,8],[3,20,1],
    [4,2,0.25],[4,3,0.15],[4,5,0.10],[4,6,3],[4,7,0.35],[4,17,0.30],[4,14,10],[4,19,1],
    [5,1,0.30],[5,3,0.16],[5,7,0.12],[5,4,0.04],[5,12,5],[5,6,1],[5,21,1]
  ];
  await DB.setList('recipes', recipeData.map((r, idx) => ({ id: idx + 1, product_id: r[0], ingredient_id: r[1], quantity: r[2], notes: '' })));

  const customers = [
    { id:1, name:'Mariana Solano Gómez',          phone:'+506 8701-4455', email:'mariana.solano@gmail.com',      address:'Condominio Roble Alto #24, Curridabat',        notes:'Cliente habitual de fines de semana. Prefiere empaque extra seguro.' },
    { id:2, name:'Cafetería El Tostador Gourmet',  phone:'+506 2234-9988', email:'compras@eltostadorcr.com',      address:'Avenida Central, diagonal al Teatro Nacional', notes:'Pedido mayorista recurrente de pan de masa madre y croissants los martes y viernes.' },
    { id:3, name:'Carlos Morales Vega',            phone:'+506 8333-2190', email:'carlos.morales.v@outlook.com', address:'San Pedro, 200m Sur de la Iglesia',            notes:'Alergia severa al maní (no afecta nueces, pero cuidar contaminación cruzada).' },
    { id:4, name:'Sofía Ramírez Brenes',           phone:'+506 8912-7744', email:'sofia.brenes@hotmail.com',      address:'Escazú Village, Torre B, Apto 502',           notes:'Excelente pagadora por SINPE Móvil. Cumpleaños el 28 de cada mes.' }
  ].map(c => ({ ...c, created_at: ts, updated_at: ts }));
  await DB.setList('customers', customers);

  const today = DB.today(), tomorrow = DB.dayOffset(1);
  const orders = [
    { id:1, order_number:'PED-2026-0001', customer_id:1, delivery_date:today,    delivery_time:'15:30', delivery_type:'RETIRO',   delivery_address:'',                                             status:'EN_PREPARACION', payment_status:'ABONO_PARCIAL', total_amount:16500, total_cost:4850, total_paid:10000, inventory_deducted:1, notes:'Dedicatoria en chocolate blanco: "Feliz Cumple Mamá"' },
    { id:2, order_number:'PED-2026-0002', customer_id:1, delivery_date:today,    delivery_time:'17:00', delivery_type:'DOMICILIO', delivery_address:'Condominio Roble Alto #24, Curridabat',      status:'LISTO',          payment_status:'PAGADO',        total_amount:17000, total_cost:5200, total_paid:17000, inventory_deducted:1, notes:'Enviar con repartidor en moto con cuidado' },
    { id:3, order_number:'PED-2026-0003', customer_id:2, delivery_date:tomorrow, delivery_time:'09:00', delivery_type:'DOMICILIO', delivery_address:'Avenida Central, diagonal al Teatro Nacional', status:'PENDIENTE',    payment_status:'PENDIENTE',     total_amount:31000, total_cost:8900, total_paid:0,     inventory_deducted:0, notes:'Entrega matutina para apertura de cafetería' },
    { id:4, order_number:'PED-2026-0000', customer_id:4, delivery_date:today,    delivery_time:'11:00', delivery_type:'RETIRO',   delivery_address:'',                                             status:'ENTREGADO',      payment_status:'PAGADO',        total_amount:14500, total_cost:3900, total_paid:14500, inventory_deducted:1, notes:'Tarta para evento familiar' }
  ].map(o => ({ ...o, created_at: ts, updated_at: ts }));
  await DB.setList('orders', orders);

  await DB.setList('order_items', [
    { id:1, order_id:1, product_id:1, quantity:1, unit_price:16500, unit_cost:4850, subtotal:16500, notes:'Queque decorado' },
    { id:2, order_id:2, product_id:3, quantity:2, unit_price:8500,  unit_cost:2600, subtotal:17000, notes:'2 docenas de galletas chunky' },
    { id:3, order_id:3, product_id:2, quantity:5, unit_price:3800,  unit_cost:950,  subtotal:19000, notes:'Panes de masa madre recién horneados' },
    { id:4, order_id:3, product_id:5, quantity:2, unit_price:6000,  unit_cost:1500, subtotal:12000, notes:'2 packs de croissants' },
    { id:5, order_id:4, product_id:4, quantity:1, unit_price:14500, unit_cost:3900, subtotal:14500, notes:'Tarta de Frutos Rojos' }
  ]);

  await DB.setList('payments', [
    { id:1, order_id:1, customer_id:1, amount:10000, payment_method:'SINPE_TRANSFERENCIA', reference:'SINPE-98721',  notes:'Adelanto 50% confirmado vía WhatsApp', payment_date:ts },
    { id:2, order_id:2, customer_id:1, amount:17000, payment_method:'TARJETA',             reference:'AUTH-438901',  notes:'Pago completo con datáfono',          payment_date:ts },
    { id:3, order_id:4, customer_id:4, amount:14500, payment_method:'EFECTIVO',            reference:'REC-0012',     notes:'Pago en mostrador',                   payment_date:ts }
  ]);

  await DB.setList('productions', [
    { id:1, product_id:2, quantity:10, total_cost:9500, expected_revenue:38000, notes:'Horneada matutina de 10 hogazas de masa madre', production_date:ts }
  ]);

  await DB.setDoc('_seeded', true);
  console.log('✅ Datos de ejemplo cargados en Firebase con éxito.');
}

// ═══════════════════════════════════════════════════════════════════════
//  API — Interfaz pública (idéntica al api.js original)
// ═══════════════════════════════════════════════════════════════════════
const API = {

  // ── Settings ──────────────────────────────────────────────────────
  async getSettings() {
    await ensureDatabaseReady();
    const snap = await _fireDb.ref(`${ROOT}/settings`).get();
    return snap.exists() ? snap.val() : {};
  },

  // ── Inventario ────────────────────────────────────────────────────
  async getInventory() {
    const ings = await DB.getList('ingredients');
    return ings.map(i => ({ ...i, stock_status: stockStatus(i), total_value: Math.round(i.current_stock * i.cost_per_unit * 100) / 100 }))
      .sort((a, b) => {
        const ord = { AGOTADO:1, BAJO:2, OPTIMO:3 };
        if (ord[a.stock_status] !== ord[b.stock_status]) return ord[a.stock_status] - ord[b.stock_status];
        if (a.category !== b.category) return a.category.localeCompare(b.category);
        return a.name.localeCompare(b.name);
      });
  },

  async getInventoryAlerts() {
    const ings = await DB.getList('ingredients');
    return ings.filter(i => i.current_stock <= i.min_stock)
      .map(i => ({ ...i, deficit: Math.round((i.min_stock - i.current_stock) * 1000) / 1000, alert_level: i.current_stock <= 0 ? 'AGOTADO' : 'BAJO' }))
      .sort((a, b) => a.current_stock - b.current_stock);
  },

  async createIngredient(data) {
    const ings  = await DB.getList('ingredients');
    const newId = nextId(ings);
    const newIng = {
      id: newId, name: data.name.trim(), category: data.category.trim(), unit: data.unit.trim(),
      cost_per_unit: parseFloat(data.cost_per_unit) || 0,
      current_stock: parseFloat(data.current_stock) || 0,
      min_stock:     parseFloat(data.min_stock) || 0,
      notes: data.notes ? data.notes.trim() : '',
      created_at: DB.now(), updated_at: DB.now()
    };
    ings.push(newIng);
    await DB.setList('ingredients', ings);
    if (newIng.current_stock > 0) await _addMovement(newId, 'ENTRADA', newIng.current_stock, newIng.cost_per_unit, 'Stock Inicial', 'Registro inicial del insumo');
    return newIng;
  },

  async updateIngredient(id, data) {
    const ings = await DB.getList('ingredients');
    const idx  = ings.findIndex(i => i.id == id);
    if (idx < 0) throw new Error('Insumo no encontrado');
    const cur = ings[idx];
    ings[idx] = {
      ...cur,
      name:          data.name          !== undefined ? data.name.trim()               : cur.name,
      category:      data.category      !== undefined ? data.category.trim()           : cur.category,
      unit:          data.unit          !== undefined ? data.unit.trim()               : cur.unit,
      cost_per_unit: data.cost_per_unit !== undefined ? parseFloat(data.cost_per_unit) : cur.cost_per_unit,
      min_stock:     data.min_stock     !== undefined ? parseFloat(data.min_stock)     : cur.min_stock,
      notes:         data.notes         !== undefined ? String(data.notes)             : cur.notes,
      updated_at: DB.now()
    };
    await DB.setList('ingredients', ings);
    return ings[idx];
  },

  async adjustStock(id, data) {
    const ings = await DB.getList('ingredients');
    const idx  = ings.findIndex(i => i.id == id);
    if (idx < 0) throw new Error('Insumo no encontrado');
    const ing  = { ...ings[idx] };
    const qty  = parseFloat(data.quantity) || 0;
    const type = data.type || 'AJUSTE';
    if      (type === 'AJUSTE_EXACTO') ing.current_stock = qty;
    else if (type === 'ENTRADA')       ing.current_stock = Math.round((ing.current_stock + qty) * 1000) / 1000;
    else if (type === 'SALIDA')        ing.current_stock = Math.round((ing.current_stock - qty) * 1000) / 1000;
    else                               ing.current_stock = Math.round((ing.current_stock + qty) * 1000) / 1000;
    ing.updated_at = DB.now();
    ings[idx] = ing;
    await DB.setList('ingredients', ings);
    await _addMovement(id, type, qty, data.unit_cost || ing.cost_per_unit, data.reference || 'Ajuste manual', data.notes || '');
    return ing;
  },

  async deleteIngredient(id, force = false) {
    const [ings, recipes] = await Promise.all([DB.getList('ingredients'), DB.getList('recipes')]);
    if (recipes.some(r => r.ingredient_id == id) && !force) throw new Error('Este insumo está siendo utilizado en una o más recetas. Use force=true para eliminar igualmente.');
    const ing = ings.find(i => i.id == id);
    if (!ing) throw new Error('Insumo no encontrado');
    const movs = await DB.getList('inventory_movements');
    await Promise.all([
      DB.setList('ingredients', ings.filter(i => i.id != id)),
      DB.setList('inventory_movements', movs.filter(m => m.ingredient_id != id))
    ]);
    return { message: `Insumo '${ing.name}' eliminado` };
  },

  // ── Productos ────────────────────────────────────────────────────
  async getProducts() {
    const [products, recipes, ingredients] = await Promise.all([DB.getList('products'), DB.getList('recipes'), DB.getList('ingredients')]);
    return products.filter(p => p.is_active).map(p => enrichProductSync(p, recipes, ingredients));
  },

  async getProduct(id) {
    const [products, recipes, ingredients] = await Promise.all([DB.getList('products'), DB.getList('recipes'), DB.getList('ingredients')]);
    const p = products.find(x => x.id == id);
    if (!p) throw new Error('Producto no encontrado');
    const recipeItems = recipes.filter(r => r.product_id == id).map(r => {
      const ing = ingredients.find(i => i.id === r.ingredient_id);
      return { recipe_item_id: r.id, ingredient_id: r.ingredient_id, recipe_quantity: r.quantity, recipe_notes: r.notes, ingredient_name: ing ? ing.name : '—', ingredient_category: ing ? ing.category : '', ingredient_unit: ing ? ing.unit : '', cost_per_unit: ing ? ing.cost_per_unit : 0, current_stock: ing ? ing.current_stock : 0, ingredient_total_cost: ing ? r.quantity * ing.cost_per_unit : 0 };
    });
    const totalCost = recipeItems.reduce((s, i) => s + i.ingredient_total_cost, 0);
    const profit    = p.sale_price - totalCost;
    const pct       = p.sale_price > 0 ? (profit / p.sale_price) * 100 : 0;
    return { ...p, recipe: recipeItems, total_recipe_cost: Math.round(totalCost * 100) / 100, unit_cost: p.yield_quantity > 0 ? Math.round((totalCost / p.yield_quantity) * 100) / 100 : totalCost, gross_profit: Math.round(profit * 100) / 100, profit_margin_pct: Math.round(pct * 10) / 10 };
  },

  async createProduct(data) {
    const [products, allRecipes] = await Promise.all([DB.getList('products'), DB.getList('recipes')]);
    const newId  = nextId(products);
    const newProd = { id: newId, name: data.name.trim(), category: data.category.trim(), description: data.description || '', sale_price: parseFloat(data.sale_price) || 0, yield_quantity: parseFloat(data.yield_quantity) || 1, yield_unit: data.yield_unit || 'unidad', is_active: 1, created_at: DB.now(), updated_at: DB.now() };
    products.push(newProd);
    await DB.setList('products', products);
    if (data.recipe && Array.isArray(data.recipe)) {
      const filtered = allRecipes.filter(r => r.product_id !== newId);
      let nrId = nextId(filtered);
      for (const item of data.recipe) filtered.push({ id: nrId++, product_id: newId, ingredient_id: item.ingredient_id, quantity: item.quantity, notes: '' });
      await DB.setList('recipes', filtered);
    }
    const [recipes, ingredients] = await Promise.all([DB.getList('recipes'), DB.getList('ingredients')]);
    return enrichProductSync(newProd, recipes, ingredients);
  },

  async updateProduct(id, data) {
    const products = await DB.getList('products');
    const idx = products.findIndex(p => p.id == id);
    if (idx < 0) throw new Error('Producto no encontrado');
    const cur = products[idx];
    products[idx] = { ...cur, name: data.name !== undefined ? data.name.trim() : cur.name, category: data.category !== undefined ? data.category.trim() : cur.category, description: data.description !== undefined ? data.description : cur.description, sale_price: data.sale_price !== undefined ? parseFloat(data.sale_price) : cur.sale_price, yield_quantity: data.yield_quantity !== undefined ? parseFloat(data.yield_quantity) : cur.yield_quantity, yield_unit: data.yield_unit !== undefined ? data.yield_unit : cur.yield_unit, updated_at: DB.now() };
    await DB.setList('products', products);
    const [recipes, ingredients] = await Promise.all([DB.getList('recipes'), DB.getList('ingredients')]);
    return enrichProductSync(products[idx], recipes, ingredients);
  },

  async saveRecipe(productId, items) {
    const all = await DB.getList('recipes');
    const filtered = all.filter(r => r.product_id != productId);
    let nrId = nextId(filtered);
    for (const item of items) filtered.push({ id: nrId++, product_id: Number(productId), ingredient_id: item.ingredient_id, quantity: item.quantity, notes: '' });
    await DB.setList('recipes', filtered);
    return { message: 'Receta guardada con éxito' };
  },

  async deleteRecipe(productId) {
    const recipes = await DB.getList('recipes');
    await DB.setList('recipes', recipes.filter(r => r.product_id != productId));
    return { message: 'Receta eliminada' };
  },

  async deleteProduct(id, force = false) {
    const [products, orderItems] = await Promise.all([DB.getList('products'), DB.getList('order_items')]);
    if (orderItems.some(i => i.product_id == id) && !force) throw new Error('Este producto está asociado a pedidos existentes. Use force=true para eliminar.');
    const prod = products.find(p => p.id == id);
    if (!prod) throw new Error('Producto no encontrado');
    prod.is_active = 0;
    await DB.setList('products', products);
    return { message: `Producto '${prod.name}' eliminado` };
  },

  // ── Proyección y ejecución de producción ─────────────────────────
  async projectProduction(productId, quantity) {
    const [products, recipes, ingredients] = await Promise.all([DB.getList('products'), DB.getList('recipes'), DB.getList('ingredients')]);
    const product = products.find(p => p.id == productId);
    if (!product) throw new Error('Producto no encontrado');
    const qty = parseFloat(quantity);
    if (!qty || qty <= 0) throw new Error('Cantidad inválida');
    const recipeItems = recipes.filter(r => r.product_id == productId);
    if (recipeItems.length === 0) throw new Error('Este producto no tiene una receta configurada todavía. Vaya a Catálogo & Recetas para agregar los ingredientes.');

    const yieldQty = product.yield_quantity > 0 ? product.yield_quantity : 1;
    const scale    = qty / yieldQty;
    let totalCost = 0, hasShortage = false;
    const calculatedIngredients = recipeItems.map(r => {
      const ing = ingredients.find(i => i.id === r.ingredient_id);
      if (!ing) return null;
      const reqQty   = Math.round(r.quantity * scale * 1000) / 1000;
      const itemCost = Math.round(reqQty * ing.cost_per_unit * 100) / 100;
      totalCost += itemCost;
      const isEnough = ing.current_stock >= reqQty;
      if (!isEnough) hasShortage = true;
      return { ingredient_id: r.ingredient_id, name: ing.name, category: ing.category, unit: ing.unit, unit_cost: ing.cost_per_unit, base_quantity: r.quantity, required_quantity: reqQty, current_stock: ing.current_stock, is_enough: isEnough, shortage: isEnough ? 0 : Math.round((reqQty - ing.current_stock) * 1000) / 1000, total_cost: itemCost };
    }).filter(Boolean);
    const expectedRevenue = Math.round((qty / yieldQty) * product.sale_price * 100) / 100;
    const expectedProfit  = Math.round((expectedRevenue - totalCost) * 100) / 100;
    return { product: { id: product.id, name: product.name, category: product.category, sale_price: product.sale_price, yield_quantity: product.yield_quantity, yield_unit: product.yield_unit }, production_plan: { quantity_to_produce: qty, scale_factor: Math.round(scale * 1000) / 1000, batches: Math.round(scale * 10) / 10, ingredients: calculatedIngredients, has_shortage: hasShortage, total_cost: totalCost, expected_revenue: expectedRevenue, expected_profit: expectedProfit, profit_margin_pct: expectedRevenue > 0 ? Math.round((expectedProfit / expectedRevenue * 100) * 10) / 10 : 0 } };
  },

  async executeProduction(productId, quantity, notes, allowNegative = false) {
    const [products, recipes, ingredients] = await Promise.all([DB.getList('products'), DB.getList('recipes'), DB.getList('ingredients')]);
    const product = products.find(p => p.id == productId);
    if (!product) throw new Error('Producto no encontrado');
    const qty = parseFloat(quantity);
    if (!qty || qty <= 0) throw new Error('Cantidad inválida');
    const recipeItems = recipes.filter(r => r.product_id == productId);
    if (recipeItems.length === 0) throw new Error('El producto no tiene receta definida');

    const yieldQty = product.yield_quantity > 0 ? product.yield_quantity : 1;
    const scale    = qty / yieldQty;
    if (!allowNegative) {
      for (const r of recipeItems) {
        const ing = ingredients.find(i => i.id === r.ingredient_id);
        if (!ing) continue;
        const required = r.quantity * scale;
        if (ing.current_stock < required) throw new Error(`Stock insuficiente para '${ing.name}'. Requerido: ${Math.round(required * 100) / 100} ${ing.unit}, Disponible: ${ing.current_stock} ${ing.unit}.`);
      }
    }
    let totalCost = 0;
    const updatedIngs = [...ingredients];
    for (const r of recipeItems) {
      const ingIdx  = updatedIngs.findIndex(i => i.id === r.ingredient_id);
      if (ingIdx < 0) continue;
      const ing     = updatedIngs[ingIdx];
      const required = Math.round(r.quantity * scale * 1000) / 1000;
      const cost     = Math.round(required * ing.cost_per_unit * 100) / 100;
      totalCost += cost;
      updatedIngs[ingIdx] = { ...ing, current_stock: Math.round((ing.current_stock - required) * 1000) / 1000, updated_at: DB.now() };
      await _addMovement(r.ingredient_id, 'SALIDA_PRODUCCION', required, ing.cost_per_unit, `Producción: ${qty} ${product.name}`, notes || 'Consumo automático de insumos por producción');
    }
    await DB.setList('ingredients', updatedIngs);
    const prods  = await DB.getList('productions');
    const newId  = nextId(prods);
    prods.push({ id: newId, product_id: Number(productId), quantity: qty, total_cost: totalCost, expected_revenue: (qty / yieldQty) * product.sale_price, notes: notes || `Elaboración de ${qty} ${product.name}`, production_date: DB.now() });
    await DB.setList('productions', prods);
    return { message: '¡Producción ejecutada con éxito! Insumos descontados del inventario.', production_id: newId, product_name: product.name, quantity_produced: qty, total_cost_consumed: totalCost };
  },

  // ── Clientes ─────────────────────────────────────────────────────
  async getCustomers()       { return DB.getList('customers'); },
  async getCustomer(id) {
    const all = await DB.getList('customers');
    const c = all.find(x => x.id == id);
    if (!c) throw new Error('Cliente no encontrado');
    return c;
  },
  async createCustomer(data) {
    const all = await DB.getList('customers');
    const newId = nextId(all);
    const newC = { id: newId, name: data.name.trim(), phone: data.phone || '', email: data.email || '', address: data.address || '', notes: data.notes || '', created_at: DB.now(), updated_at: DB.now() };
    all.push(newC);
    await DB.setList('customers', all);
    return newC;
  },
  async updateCustomer(id, data) {
    const all = await DB.getList('customers');
    const idx = all.findIndex(c => c.id == id);
    if (idx < 0) throw new Error('Cliente no encontrado');
    const cur = all[idx];
    all[idx] = { ...cur, name: data.name !== undefined ? data.name.trim() : cur.name, phone: data.phone !== undefined ? data.phone : cur.phone, email: data.email !== undefined ? data.email : cur.email, address: data.address !== undefined ? data.address : cur.address, notes: data.notes !== undefined ? data.notes : cur.notes, updated_at: DB.now() };
    await DB.setList('customers', all);
    return all[idx];
  },
  async deleteCustomer(id, force = false) {
    const [all, orders] = await Promise.all([DB.getList('customers'), DB.getList('orders')]);
    if (orders.some(o => o.customer_id == id) && !force) throw new Error('Este cliente tiene pedidos asociados. Use force=true para eliminar.');
    const c = all.find(x => x.id == id);
    if (!c) throw new Error('Cliente no encontrado');
    await DB.setList('customers', all.filter(x => x.id != id));
    return { message: `Cliente '${c.name}' eliminado` };
  },

  // ── Pedidos ──────────────────────────────────────────────────────
  async getOrders(params = {}) {
    const [orders, customers] = await Promise.all([DB.getList('orders'), DB.getList('customers')]);
    const today = DB.today();
    let result = orders.map(o => enrichOrderSync(o, customers));
    if (params.status)         result = result.filter(o => o.status === params.status);
    if (params.payment_status) result = result.filter(o => o.payment_status === params.payment_status);
    if (params.date)                      result = result.filter(o => o.delivery_date === params.date);
    else if (params.period === 'today')   result = result.filter(o => o.delivery_date === today);
    else if (params.period === 'tomorrow')result = result.filter(o => o.delivery_date === DB.dayOffset(1));
    else if (params.period === 'week')    result = result.filter(o => o.delivery_date >= today && o.delivery_date <= DB.dayOffset(7));
    result.sort((a, b) => {
      if (a.delivery_date !== b.delivery_date) return a.delivery_date.localeCompare(b.delivery_date);
      if ((a.delivery_time || '') !== (b.delivery_time || '')) return (a.delivery_time || '').localeCompare(b.delivery_time || '');
      return b.id - a.id;
    });
    return result;
  },

  async getOrder(id) {
    const [orders, customers, allItems, allProducts, payments] = await Promise.all([DB.getList('orders'), DB.getList('customers'), DB.getList('order_items'), DB.getList('products'), DB.getList('payments')]);
    const o = orders.find(x => x.id == id);
    if (!o) throw new Error('Pedido no encontrado');
    const c = customers.find(x => x.id == o.customer_id);
    const items = allItems.filter(i => i.order_id == id).map(item => {
      const prod = allProducts.find(p => p.id === item.product_id);
      return { ...item, product_name: prod ? prod.name : '—', product_category: prod ? prod.category : '', yield_unit: prod ? prod.yield_unit : '' };
    });
    return { ...o, pending_balance: o.total_amount - o.total_paid, customer_name: c ? c.name : '—', customer_phone: c ? c.phone : '', customer_email: c ? c.email : '', customer_default_address: c ? c.address : '', items, payments: payments.filter(p => p.order_id == id).sort((a, b) => a.payment_date.localeCompare(b.payment_date)) };
  },

  async createOrder(data) {
    const { customer_id, delivery_date, delivery_time, delivery_type, delivery_address, notes, items, initial_payment, deduct_inventory_now } = data;
    if (!customer_id || !delivery_date || !items || items.length === 0) throw new Error('Cliente, fecha de entrega y al menos un producto son obligatorios');

    const [allOrders, allProducts, allRecipes, allIngredients] = await Promise.all([DB.getList('orders'), DB.getList('products'), DB.getList('recipes'), DB.getList('ingredients')]);
    const year       = new Date().getFullYear();
    const nextNum    = (allOrders.length + 1).toString().padStart(4, '0');
    const orderNum   = `PED-${year}-${nextNum}`;
    let totalAmount  = 0, totalCost = 0;
    const processed  = [];

    for (const it of items) {
      const product = allProducts.find(p => p.id == it.product_id);
      if (!product) continue;
      const qty = parseFloat(it.quantity) || 1, price = it.unit_price !== undefined ? parseFloat(it.unit_price) : product.sale_price;
      const subtotal = qty * price;
      totalAmount += subtotal;
      const yieldQty = product.yield_quantity > 0 ? product.yield_quantity : 1;
      const unitCost = calcRecipeCostSync(allRecipes, allIngredients, it.product_id) / yieldQty;
      totalCost += unitCost * qty;
      processed.push({ product_id: it.product_id, quantity: qty, unit_price: price, unit_cost: unitCost, subtotal, notes: it.notes || '' });
    }

    const newOrderId = nextId(allOrders);
    const initAmt    = (initial_payment && parseFloat(initial_payment.amount)) || 0;
    let payStatus    = 'PENDIENTE';
    if (initAmt >= totalAmount) payStatus = 'PAGADO';
    else if (initAmt > 0)      payStatus = 'ABONO_PARCIAL';

    const newOrder = { id: newOrderId, order_number: orderNum, customer_id, delivery_date, delivery_time: delivery_time || '12:00', delivery_type: delivery_type || 'RETIRO', delivery_address: delivery_address || '', status: 'PENDIENTE', payment_status: payStatus, total_amount: Math.round(totalAmount * 100) / 100, total_cost: Math.round(totalCost * 100) / 100, total_paid: initAmt, inventory_deducted: 0, notes: notes || '', created_at: DB.now(), updated_at: DB.now() };
    allOrders.push(newOrder);
    await DB.setList('orders', allOrders);

    const allItems = await DB.getList('order_items');
    let nextItemId = nextId(allItems);
    for (const item of processed) allItems.push({ id: nextItemId++, order_id: newOrderId, ...item });
    await DB.setList('order_items', allItems);

    if (initAmt > 0 && initial_payment) {
      const pays = await DB.getList('payments');
      pays.push({ id: nextId(pays), order_id: newOrderId, customer_id, amount: initAmt, payment_method: initial_payment.payment_method || 'EFECTIVO', reference: initial_payment.reference || '', notes: 'Abono inicial', payment_date: DB.now() });
      await DB.setList('payments', pays);
    }

    if (deduct_inventory_now) {
      const freshItems = await DB.getList('order_items');
      const updIngs    = await _deductOrderInventory(newOrderId, orderNum, freshItems, allProducts, allRecipes, allIngredients);
      await DB.setList('ingredients', updIngs);
      const freshOrders = await DB.getList('orders');
      const oIdx = freshOrders.findIndex(x => x.id == newOrderId);
      if (oIdx >= 0) { freshOrders[oIdx].inventory_deducted = 1; await DB.setList('orders', freshOrders); }
    }
    return newOrder;
  },

  async updateOrderStatus(id, status) {
    const valid = ['PENDIENTE', 'EN_PREPARACION', 'LISTO', 'ENTREGADO', 'CANCELADO'];
    if (!valid.includes(status)) throw new Error('Estado no válido');
    const [orders, items, products, recipes, ingredients] = await Promise.all([DB.getList('orders'), DB.getList('order_items'), DB.getList('products'), DB.getList('recipes'), DB.getList('ingredients')]);
    const oIdx = orders.findIndex(x => x.id == id);
    if (oIdx < 0) throw new Error('Pedido no encontrado');
    const o = orders[oIdx];
    let updIngs = ingredients;
    if (['EN_PREPARACION', 'LISTO', 'ENTREGADO'].includes(status) && o.inventory_deducted === 0) {
      updIngs = await _deductOrderInventory(id, o.order_number, items, products, recipes, ingredients);
      orders[oIdx].inventory_deducted = 1;
    }
    if (status === 'CANCELADO' && o.inventory_deducted === 1) {
      updIngs = await _restoreOrderInventory(id, o.order_number, items, products, recipes, ingredients);
      orders[oIdx].inventory_deducted = 0;
    }
    orders[oIdx].status = status;
    orders[oIdx].updated_at = DB.now();
    await Promise.all([DB.setList('orders', orders), DB.setList('ingredients', updIngs)]);
    return { message: `Estado actualizado a ${status}`, order: orders[oIdx] };
  },

  async updateOrder(id, data) {
    const orders = await DB.getList('orders');
    const oIdx = orders.findIndex(x => x.id == id);
    if (oIdx < 0) throw new Error('Pedido no encontrado');
    const o = orders[oIdx];
    if (data.delivery_date    !== undefined) o.delivery_date    = data.delivery_date;
    if (data.delivery_time    !== undefined) o.delivery_time    = data.delivery_time;
    if (data.delivery_type    !== undefined) o.delivery_type    = data.delivery_type;
    if (data.delivery_address !== undefined) o.delivery_address = data.delivery_address;
    if (data.notes            !== undefined) o.notes            = data.notes;
    o.updated_at = DB.now();
    await DB.setList('orders', orders);
    return o;
  },

  async deleteOrder(id) {
    const [orders, allItems, payments, allProducts, allRecipes, allIngredients] = await Promise.all([DB.getList('orders'), DB.getList('order_items'), DB.getList('payments'), DB.getList('products'), DB.getList('recipes'), DB.getList('ingredients')]);
    const o = orders.find(x => x.id == id);
    if (!o) throw new Error('Pedido no encontrado');
    let updIngs = allIngredients;
    if (o.inventory_deducted === 1) updIngs = await _restoreOrderInventory(id, o.order_number, allItems, allProducts, allRecipes, allIngredients);
    await Promise.all([
      DB.setList('orders',      orders.filter(x => x.id != id)),
      DB.setList('order_items', allItems.filter(i => i.order_id != id)),
      DB.setList('payments',    payments.filter(p => p.order_id != id)),
      DB.setList('ingredients', updIngs)
    ]);
    return { message: `Pedido #${o.order_number} eliminado con éxito` };
  },

  // ── Pagos ────────────────────────────────────────────────────────
  async addPayment(data) {
    const { order_id, amount, payment_method, reference, notes } = data;
    const payAmount = parseFloat(amount);
    if (!order_id || !payAmount || payAmount <= 0) throw new Error('Pedido válido y monto mayor a cero son obligatorios');
    const [orders, pays] = await Promise.all([DB.getList('orders'), DB.getList('payments')]);
    const oIdx = orders.findIndex(x => x.id == order_id);
    if (oIdx < 0) throw new Error('Pedido no encontrado');
    const o = orders[oIdx];
    const newId  = nextId(pays);
    pays.push({ id: newId, order_id, customer_id: o.customer_id, amount: payAmount, payment_method: payment_method || 'EFECTIVO', reference: reference ? reference.trim() : '', notes: notes ? notes.trim() : '', payment_date: DB.now() });
    const newTotal = pays.filter(p => p.order_id == order_id).reduce((s, p) => s + p.amount, 0);
    let newPayStatus = 'PENDIENTE';
    if (newTotal >= o.total_amount) newPayStatus = 'PAGADO';
    else if (newTotal > 0)          newPayStatus = 'ABONO_PARCIAL';
    orders[oIdx] = { ...o, total_paid: newTotal, payment_status: newPayStatus, updated_at: DB.now() };
    await Promise.all([DB.setList('payments', pays), DB.setList('orders', orders)]);
    const customers = await DB.getList('customers');
    const c = customers.find(x => x.id == o.customer_id);
    return { message: 'Abono registrado con éxito', payment_id: newId, order: { ...orders[oIdx], pending_balance: orders[oIdx].total_amount - orders[oIdx].total_paid, customer_name: c ? c.name : '—' } };
  },

  // ── Métricas ─────────────────────────────────────────────────────
  async getMetrics(period = 'month') {
    const today = DB.today();
    const [orders, orderItems, products, ingredients] = await Promise.all([DB.getList('orders'), DB.getList('order_items'), DB.getList('products'), DB.getList('ingredients')]);
    let filtered = orders.filter(o => o.status !== 'CANCELADO');
    if      (period === 'today') filtered = filtered.filter(o => o.delivery_date === today);
    else if (period === 'week')  filtered = filtered.filter(o => o.delivery_date >= DB.dayOffset(-7));
    else if (period === 'month') filtered = filtered.filter(o => o.delivery_date >= today.slice(0,7) + '-01');
    const totalRevenue   = filtered.reduce((s, o) => s + o.total_amount, 0);
    const totalCost      = filtered.reduce((s, o) => s + o.total_cost,   0);
    const totalCollected = filtered.reduce((s, o) => s + o.total_paid,   0);
    const netProfit      = totalRevenue - totalCost;
    const profitPct      = totalRevenue > 0 ? Math.round((netProfit / totalRevenue * 100) * 10) / 10 : 0;
    const periodReceiv   = filtered.reduce((s, o) => s + (o.total_amount - o.total_paid), 0);
    const globalReceiv   = orders.filter(o => o.status !== 'CANCELADO' && o.payment_status !== 'PAGADO').reduce((s, o) => s + (o.total_amount - o.total_paid), 0);
    const statusMap = {};
    orders.forEach(o => {
      if (!statusMap[o.status]) statusMap[o.status] = { status: o.status, count: 0, total_amount: 0 };
      statusMap[o.status].count++;
      statusMap[o.status].total_amount += o.total_amount;
    });
    const productRevMap = {};
    orderItems.forEach(item => {
      const ord = orders.find(o => o.id == item.order_id);
      if (!ord || ord.status === 'CANCELADO') return;
      const prod = products.find(p => p.id === item.product_id);
      if (!prod) return;
      if (!productRevMap[item.product_id]) productRevMap[item.product_id] = { id: prod.id, name: prod.name, category: prod.category, units_sold: 0, total_revenue: 0, total_cost: 0, profit: 0 };
      productRevMap[item.product_id].units_sold    += item.quantity;
      productRevMap[item.product_id].total_revenue += item.subtotal;
      productRevMap[item.product_id].total_cost    += item.unit_cost * item.quantity;
      productRevMap[item.product_id].profit        += item.subtotal - item.unit_cost * item.quantity;
    });
    const dailyChart = [];
    for (let i = 6; i >= 0; i--) {
      const d = DB.dayOffset(-i);
      const dayOrds = orders.filter(o => o.delivery_date === d && o.status !== 'CANCELADO');
      dailyChart.push({ date: d, revenue: dayOrds.reduce((s, o) => s + o.total_amount, 0), cost: dayOrds.reduce((s, o) => s + o.total_cost, 0), profit: dayOrds.reduce((s, o) => s + (o.total_amount - o.total_cost), 0) });
    }
    return {
      period: period || 'month',
      summary: { total_orders: filtered.length, total_revenue: Math.round(totalRevenue*100)/100, total_cost: Math.round(totalCost*100)/100, net_profit: Math.round(netProfit*100)/100, profit_margin_pct: profitPct, total_collected: Math.round(totalCollected*100)/100, period_receivables: Math.round(periodReceiv*100)/100, global_receivables: Math.round(globalReceiv*100)/100 },
      inventory: { total_ingredients: ingredients.length, low_stock_count: ingredients.filter(i => i.current_stock <= i.min_stock).length, total_inventory_value: Math.round(ingredients.reduce((s, i) => s + i.current_stock * i.cost_per_unit, 0)*100)/100 },
      status_breakdown: Object.values(statusMap),
      top_products: Object.values(productRevMap).sort((a, b) => b.units_sold - a.units_sold).slice(0, 5),
      daily_chart: dailyChart
    };
  }
};

// ─── Inicializar (sembrar datos si Firebase está vacío) ───────────────
ensureDatabaseReady();
