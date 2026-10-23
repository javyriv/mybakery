// =====================================================================
//  API LOCAL — Dulce Menta Bakery System (GitHub Pages / Modo Estático)
//  Reemplaza las llamadas REST a Express+SQLite con almacenamiento en
//  localStorage del navegador. Misma interfaz que el api.js original.
// =====================================================================

// ─── Utilidades de localStorage ──────────────────────────────────────
const DB = {
  _prefix: 'dulcementa_',

  get(table) {
    try {
      return JSON.parse(localStorage.getItem(this._prefix + table) || 'null');
    } catch { return null; }
  },

  set(table, data) {
    localStorage.setItem(this._prefix + table, JSON.stringify(data));
  },

  nextId(table) {
    const rows = this.get(table) || [];
    return rows.length > 0 ? Math.max(...rows.map(r => r.id || 0)) + 1 : 1;
  },

  now() {
    return new Date().toISOString();
  },

  today() {
    return new Date().toISOString().split('T')[0];
  },

  dayOffset(n) {
    return new Date(Date.now() + 86400000 * n).toISOString().split('T')[0];
  }
};

// ─── Semilla de datos iniciales ───────────────────────────────────────
function seedInitialData() {
  if (DB.get('_seeded')) return;

  // Settings
  DB.set('settings', {
    bakery_name: 'Dulce Menta — Panadería & Repostería Artesanal',
    currency_symbol: '₡',
    phone: '+506 8888-1234',
    whatsapp: '50688881234',
    address: 'Barrio Escalante, 100m Este del Parque, San José, Costa Rica',
    low_stock_alerts_enabled: 'true'
  });

  // Ingredientes
  const ingredients = [
    { id:1,  name:'Harina de Fuerza Especial',               category:'Harinas y Granos',         unit:'kg',     cost_per_unit:1100,  current_stock:45,   min_stock:15,  notes:'' },
    { id:2,  name:'Harina de Trigo Suave (Pastelería)',       category:'Harinas y Granos',         unit:'kg',     cost_per_unit:950,   current_stock:30,   min_stock:10,  notes:'' },
    { id:3,  name:'Mantequilla Sin Sal 82% Grasa',            category:'Grasas y Aceites',         unit:'kg',     cost_per_unit:5400,  current_stock:18,   min_stock:8,   notes:'' },
    { id:4,  name:'Azúcar Refinada',                          category:'Azúcares y Chocolates',    unit:'kg',     cost_per_unit:780,   current_stock:25,   min_stock:10,  notes:'' },
    { id:5,  name:'Azúcar Glass / En Polvo',                  category:'Azúcares y Chocolates',    unit:'kg',     cost_per_unit:1250,  current_stock:12,   min_stock:5,   notes:'' },
    { id:6,  name:'Huevos de Pastoreo',                       category:'Lácteos y Huevos',         unit:'unidad', cost_per_unit:120,   current_stock:180,  min_stock:60,  notes:'' },
    { id:7,  name:'Leche Entera Cremosa',                     category:'Lácteos y Huevos',         unit:'L',      cost_per_unit:980,   current_stock:22,   min_stock:10,  notes:'' },
    { id:8,  name:'Crema de Leche / Crema Dulce 35%',         category:'Lácteos y Huevos',         unit:'L',      cost_per_unit:2900,  current_stock:9,    min_stock:5,   notes:'' },
    { id:9,  name:'Queso Crema Tipo Filadelfia',               category:'Lácteos y Huevos',         unit:'kg',     cost_per_unit:5900,  current_stock:8,    min_stock:4,   notes:'' },
    { id:10, name:'Chocolate Amargo Belga 70%',                category:'Azúcares y Chocolates',    unit:'kg',     cost_per_unit:9800,  current_stock:6,    min_stock:3,   notes:'' },
    { id:11, name:'Cacao Puro en Polvo Alcalino',              category:'Azúcares y Chocolates',    unit:'kg',     cost_per_unit:8200,  current_stock:4,    min_stock:2,   notes:'' },
    { id:12, name:'Levadura Seca Instantánea',                 category:'Harinas y Granos',         unit:'g',      cost_per_unit:5.5,   current_stock:450,  min_stock:200, notes:'' },
    { id:13, name:'Polvo para Hornear',                        category:'Harinas y Granos',         unit:'g',      cost_per_unit:6.0,   current_stock:600,  min_stock:250, notes:'' },
    { id:14, name:'Esencia Pura de Vainilla Bourbon',          category:'Especias y Frutas',        unit:'ml',     cost_per_unit:25.0,  current_stock:350,  min_stock:150, notes:'' },
    { id:15, name:'Zanahorias Dulces Frescas',                 category:'Especias y Frutas',        unit:'kg',     cost_per_unit:1200,  current_stock:10,   min_stock:4,   notes:'' },
    { id:16, name:'Nueces Pecanas Seleccionadas',              category:'Especias y Frutas',        unit:'g',      cost_per_unit:16.0,  current_stock:950,  min_stock:500, notes:'' },
    { id:17, name:'Frutos Rojos Silvestres (Moras/Frambuesas)',category:'Especias y Frutas',        unit:'kg',     cost_per_unit:6500,  current_stock:3,    min_stock:4,   notes:'' },
    { id:18, name:'Sal Marina Fina',                           category:'Especias y Frutas',        unit:'g',      cost_per_unit:1.2,   current_stock:2000, min_stock:500, notes:'' },
    { id:19, name:'Caja Artesanal para Queque Grande',         category:'Empaques',                 unit:'unidad', cost_per_unit:850,   current_stock:15,   min_stock:20,  notes:'' },
    { id:20, name:'Caja Individual con Visor',                 category:'Empaques',                 unit:'unidad', cost_per_unit:350,   current_stock:65,   min_stock:30,  notes:'' },
    { id:21, name:'Bolsa de Papel Kraft Ecológica',            category:'Empaques',                 unit:'unidad', cost_per_unit:180,   current_stock:120,  min_stock:50,  notes:'' }
  ].map(i => ({ ...i, created_at: DB.now(), updated_at: DB.now() }));
  DB.set('ingredients', ingredients);

  // Movimientos de inventario iniciales
  const movements = ingredients.map((ing, idx) => ({
    id: idx + 1,
    ingredient_id: ing.id,
    type: 'ENTRADA',
    quantity: ing.current_stock,
    unit_cost: ing.cost_per_unit,
    reference: 'Inventario Inicial',
    notes: 'Carga inicial de apertura de la panadería',
    created_at: DB.now()
  }));
  DB.set('inventory_movements', movements);

  // Productos y recetas
  const products = [
    { id:1, name:'Queque de Zanahoria & Nuez con Frosting',      category:'Queques y Tartas',       description:'Bizcocho especiado con canela, nueces tostadas y cobertura suave de queso crema', sale_price:16500, yield_quantity:1,  yield_unit:'queque',     is_active:1 },
    { id:2, name:'Hogaza Rústica de Masa Madre',                  category:'Panadería Artesanal',    description:'Fermentación lenta de 24 horas, corteza crujiente y miga abierta alveolada',      sale_price:3800,  yield_quantity:1,  yield_unit:'hogaza',     is_active:1 },
    { id:3, name:'Galletas Chunky con Doble Chocolate (Docena)',  category:'Galletas',               description:'Galletas estilo Nueva York, suaves por dentro y doradas por fuera con trozos de chocolate belga', sale_price:8500, yield_quantity:12, yield_unit:'galletas',   is_active:1 },
    { id:4, name:'Tarta Sablé de Frutos Rojos',                   category:'Queques y Tartas',       description:'Base crocante de mantequilla rellena de suave crema pastelera a la vainilla y cubierta de berries frescos', sale_price:14500, yield_quantity:1, yield_unit:'tarta', is_active:1 },
    { id:5, name:'Croissants Artesanales de Mantequilla (Pack x 4)', category:'Repostería Fina',    description:'Hojaldrado artesanal de capas perfectas con mantequilla pura al 82%',              sale_price:6000,  yield_quantity:4,  yield_unit:'croissants', is_active:1 }
  ].map(p => ({ ...p, created_at: DB.now(), updated_at: DB.now() }));
  DB.set('products', products);

  // Recetas [product_id, ingredient_id, quantity]
  const recipeData = [
    // P1: Queque Zanahoria
    [1,2,0.35],[1,4,0.28],[1,6,4],[1,3,0.18],[1,15,0.30],[1,16,100],[1,13,12],[1,14,10],[1,9,0.25],[1,5,0.15],[1,19,1],
    // P2: Hogaza Masa Madre
    [2,1,0.50],[2,18,10],[2,12,2],[2,21,1],
    // P3: Galletas
    [3,2,0.32],[3,3,0.18],[3,4,0.20],[3,6,2],[3,10,0.22],[3,13,6],[3,14,8],[3,20,1],
    // P4: Tarta Frutos Rojos
    [4,2,0.25],[4,3,0.15],[4,5,0.10],[4,6,3],[4,7,0.35],[4,17,0.30],[4,14,10],[4,19,1],
    // P5: Croissants
    [5,1,0.30],[5,3,0.16],[5,7,0.12],[5,4,0.04],[5,12,5],[5,6,1],[5,21,1]
  ];
  const recipes = recipeData.map((r, idx) => ({
    id: idx + 1, product_id: r[0], ingredient_id: r[1], quantity: r[2], notes: ''
  }));
  DB.set('recipes', recipes);

  // Clientes
  const today = DB.today();
  const customers = [
    { id:1, name:'Mariana Solano Gómez',         phone:'+506 8701-4455', email:'mariana.solano@gmail.com',     address:'Condominio Roble Alto #24, Curridabat',           notes:'Cliente habitual de fines de semana. Prefiere empaque extra seguro.' },
    { id:2, name:'Cafetería El Tostador Gourmet', phone:'+506 2234-9988', email:'compras@eltostadorcr.com',     address:'Avenida Central, diagonal al Teatro Nacional',    notes:'Pedido mayorista recurrente de pan de masa madre y croissants los martes y viernes.' },
    { id:3, name:'Carlos Morales Vega',           phone:'+506 8333-2190', email:'carlos.morales.v@outlook.com', address:'San Pedro, 200m Sur de la Iglesia',               notes:'Alergia severa al maní (no afecta a nueces, pero cuidar contaminación cruzada).' },
    { id:4, name:'Sofía Ramírez Brenes',          phone:'+506 8912-7744', email:'sofia.brenes@hotmail.com',     address:'Escazú Village, Torre B, Apto 502',              notes:'Excelente pagadora por SINPE Móvil. Cumpleaños el 28 de cada mes.' }
  ].map(c => ({ ...c, created_at: DB.now(), updated_at: DB.now() }));
  DB.set('customers', customers);

  // Pedidos
  const tomorrow = DB.dayOffset(1);
  const orders = [
    { id:1, order_number:'PED-2026-0001', customer_id:1, delivery_date:today,    delivery_time:'15:30', delivery_type:'RETIRO',   delivery_address:'',                                         status:'EN_PREPARACION', payment_status:'ABONO_PARCIAL', total_amount:16500, total_cost:4850,  total_paid:10000, inventory_deducted:1, notes:'Dedicatoria en chocolate blanco: "Feliz Cumple Mamá"' },
    { id:2, order_number:'PED-2026-0002', customer_id:1, delivery_date:today,    delivery_time:'17:00', delivery_type:'DOMICILIO', delivery_address:'Condominio Roble Alto #24, Curridabat',  status:'LISTO',          payment_status:'PAGADO',        total_amount:17000, total_cost:5200,  total_paid:17000, inventory_deducted:1, notes:'Enviar con repartidor en moto con cuidado' },
    { id:3, order_number:'PED-2026-0003', customer_id:2, delivery_date:tomorrow, delivery_time:'09:00', delivery_type:'DOMICILIO', delivery_address:'Avenida Central, diagonal al Teatro Nacional', status:'PENDIENTE', payment_status:'PENDIENTE',    total_amount:31000, total_cost:8900,  total_paid:0,     inventory_deducted:0, notes:'Entrega matutina para apertura de cafetería' },
    { id:4, order_number:'PED-2026-0000', customer_id:4, delivery_date:today,    delivery_time:'11:00', delivery_type:'RETIRO',   delivery_address:'',                                         status:'ENTREGADO',      payment_status:'PAGADO',        total_amount:14500, total_cost:3900,  total_paid:14500, inventory_deducted:1, notes:'Tarta para evento familiar' }
  ].map(o => ({ ...o, created_at: DB.now(), updated_at: DB.now() }));
  DB.set('orders', orders);

  // Items de pedidos
  const orderItems = [
    { id:1, order_id:1, product_id:1, quantity:1,  unit_price:16500, unit_cost:4850, subtotal:16500, notes:'Queque decorado' },
    { id:2, order_id:2, product_id:3, quantity:2,  unit_price:8500,  unit_cost:2600, subtotal:17000, notes:'2 docenas de galletas chunky' },
    { id:3, order_id:3, product_id:2, quantity:5,  unit_price:3800,  unit_cost:950,  subtotal:19000, notes:'Panes de masa madre recién horneados' },
    { id:4, order_id:3, product_id:5, quantity:2,  unit_price:6000,  unit_cost:1500, subtotal:12000, notes:'2 packs de croissants' },
    { id:5, order_id:4, product_id:4, quantity:1,  unit_price:14500, unit_cost:3900, subtotal:14500, notes:'Tarta de Frutos Rojos' }
  ];
  DB.set('order_items', orderItems);

  // Pagos
  const payments = [
    { id:1, order_id:1, customer_id:1, amount:10000, payment_method:'SINPE_TRANSFERENCIA', reference:'SINPE-98721',  notes:'Adelanto 50% confirmado vía WhatsApp',     payment_date: DB.now() },
    { id:2, order_id:2, customer_id:1, amount:17000, payment_method:'TARJETA',             reference:'AUTH-438901',  notes:'Pago completo con datáfono',               payment_date: DB.now() },
    { id:3, order_id:4, customer_id:4, amount:14500, payment_method:'EFECTIVO',            reference:'REC-0012',     notes:'Pago en mostrador',                        payment_date: DB.now() }
  ];
  DB.set('payments', payments);

  // Producciones
  const productions = [
    { id:1, product_id:2, quantity:10, total_cost:9500, expected_revenue:38000, notes:'Horneada matutina de 10 hogazas de masa madre', production_date: DB.now() }
  ];
  DB.set('productions', productions);

  DB.set('_seeded', true);
}

// ─── Helpers internos ────────────────────────────────────────────────
function getIngredients()    { return DB.get('ingredients') || []; }
function getProducts()       { return DB.get('products') || []; }
function getRecipes()        { return DB.get('recipes') || []; }
function getCustomers()      { return DB.get('customers') || []; }
function getOrders()         { return DB.get('orders') || []; }
function getOrderItems()     { return DB.get('order_items') || []; }
function getPayments()       { return DB.get('payments') || []; }
function getProductions()    { return DB.get('productions') || []; }
function getSettings()       { return DB.get('settings') || {}; }
function getMovements()      { return DB.get('inventory_movements') || []; }

function getIngredient(id)   { return getIngredients().find(i => i.id == id) || null; }
function getProduct(id)      { return getProducts().find(p => p.id == id) || null; }
function getCustomer(id)     { return getCustomers().find(c => c.id == id) || null; }
function getOrder(id)        { return getOrders().find(o => o.id == id) || null; }

function stockStatus(ing) {
  if (ing.current_stock <= 0) return 'AGOTADO';
  if (ing.current_stock <= ing.min_stock) return 'BAJO';
  return 'OPTIMO';
}

function calcRecipeCost(productId) {
  const ings = getIngredients();
  return getRecipes()
    .filter(r => r.product_id == productId)
    .reduce((sum, r) => {
      const ing = ings.find(i => i.id === r.ingredient_id);
      return sum + (ing ? r.quantity * ing.cost_per_unit : 0);
    }, 0);
}

function enrichProduct(p) {
  const recipeCost = calcRecipeCost(p.id);
  const recipeCount = getRecipes().filter(r => r.product_id === p.id).length;
  const unitCost = p.yield_quantity > 0 ? recipeCost / p.yield_quantity : recipeCost;
  const grossProfit = p.sale_price - recipeCost;
  const pct = p.sale_price > 0 ? (grossProfit / p.sale_price) * 100 : 0;
  return {
    ...p,
    total_recipe_cost: Math.round(recipeCost * 100) / 100,
    unit_cost: Math.round(unitCost * 100) / 100,
    gross_profit: Math.round(grossProfit * 100) / 100,
    profit_margin_pct: Math.round(pct * 10) / 10,
    ingredients_count: recipeCount
  };
}

function enrichOrder(o) {
  const customer = getCustomer(o.customer_id);
  const items = getOrderItems().filter(i => i.order_id === o.id);
  return {
    ...o,
    pending_balance: o.total_amount - o.total_paid,
    customer_name: customer ? customer.name : '—',
    customer_phone: customer ? customer.phone : '',
    items_count: items.length
  };
}

function addMovement(ingredient_id, type, quantity, unit_cost, reference, notes) {
  const movs = getMovements();
  const newId = movs.length > 0 ? Math.max(...movs.map(m => m.id)) + 1 : 1;
  movs.push({ id: newId, ingredient_id, type, quantity, unit_cost, reference, notes, created_at: DB.now() });
  DB.set('inventory_movements', movs);
}

function deductOrderInventory(orderId, orderNumber) {
  const order = getOrder(orderId);
  if (!order) return;
  const items = getOrderItems().filter(i => i.order_id == orderId);
  const allIngs = getIngredients();

  for (const item of items) {
    const product = getProduct(item.product_id);
    if (!product) continue;
    const recipeItems = getRecipes().filter(r => r.product_id == item.product_id);
    const yieldQty = product.yield_quantity > 0 ? product.yield_quantity : 1;
    const scaleFactor = item.quantity / yieldQty;

    for (const rItem of recipeItems) {
      const required = Math.round(rItem.quantity * scaleFactor * 1000) / 1000;
      const ing = allIngs.find(i => i.id === rItem.ingredient_id);
      if (!ing) continue;
      ing.current_stock = Math.round((ing.current_stock - required) * 1000) / 1000;
      ing.updated_at = DB.now();
      addMovement(rItem.ingredient_id, 'SALIDA_PEDIDO', required, ing.cost_per_unit,
        `Pedido ${orderNumber}`, `Insumos descontados para ${item.quantity} ${product.name}`);
    }
  }
  DB.set('ingredients', allIngs);
  const orders = getOrders();
  const o = orders.find(x => x.id == orderId);
  if (o) { o.inventory_deducted = 1; DB.set('orders', orders); }
}

function restoreOrderInventory(orderId, orderNumber) {
  const items = getOrderItems().filter(i => i.order_id == orderId);
  const allIngs = getIngredients();

  for (const item of items) {
    const product = getProduct(item.product_id);
    if (!product) continue;
    const recipeItems = getRecipes().filter(r => r.product_id == item.product_id);
    const yieldQty = product.yield_quantity > 0 ? product.yield_quantity : 1;
    const scaleFactor = item.quantity / yieldQty;

    for (const rItem of recipeItems) {
      const returned = Math.round(rItem.quantity * scaleFactor * 1000) / 1000;
      const ing = allIngs.find(i => i.id === rItem.ingredient_id);
      if (!ing) continue;
      ing.current_stock = Math.round((ing.current_stock + returned) * 1000) / 1000;
      ing.updated_at = DB.now();
      addMovement(rItem.ingredient_id, 'ENTRADA', returned, ing.cost_per_unit,
        `Cancelación ${orderNumber}`, 'Reingreso de insumos por pedido cancelado');
    }
  }
  DB.set('ingredients', allIngs);
  const orders = getOrders();
  const o = orders.find(x => x.id == orderId);
  if (o) { o.inventory_deducted = 0; DB.set('orders', orders); }
}

// ─── Simular respuesta async (igual que fetch) ────────────────────────
function ok(data)    { return Promise.resolve(data); }
function err(msg)    { return Promise.reject(new Error(msg)); }

// ─── Objeto API público ───────────────────────────────────────────────
const API = {

  // ── Settings ──────────────────────────────────────────────────────
  getSettings() {
    return ok(getSettings());
  },

  // ── Inventario ────────────────────────────────────────────────────
  getInventory() {
    const ings = getIngredients().map(i => ({
      ...i,
      stock_status: stockStatus(i),
      total_value: Math.round(i.current_stock * i.cost_per_unit * 100) / 100
    }));
    // Ordenar: AGOTADO > BAJO > OPTIMO, luego categoría, luego nombre
    ings.sort((a, b) => {
      const order = { AGOTADO: 1, BAJO: 2, OPTIMO: 3 };
      if (order[a.stock_status] !== order[b.stock_status]) return order[a.stock_status] - order[b.stock_status];
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      return a.name.localeCompare(b.name);
    });
    return ok(ings);
  },

  getInventoryAlerts() {
    const alerts = getIngredients()
      .filter(i => i.current_stock <= i.min_stock)
      .map(i => ({
        ...i,
        deficit: Math.round((i.min_stock - i.current_stock) * 1000) / 1000,
        alert_level: i.current_stock <= 0 ? 'AGOTADO' : 'BAJO'
      }))
      .sort((a, b) => a.current_stock - b.current_stock);
    return ok(alerts);
  },

  createIngredient(data) {
    const ings = getIngredients();
    const newId = ings.length > 0 ? Math.max(...ings.map(i => i.id)) + 1 : 1;
    const newIng = {
      id: newId,
      name: data.name.trim(),
      category: data.category.trim(),
      unit: data.unit.trim(),
      cost_per_unit: parseFloat(data.cost_per_unit) || 0,
      current_stock: parseFloat(data.current_stock) || 0,
      min_stock: parseFloat(data.min_stock) || 0,
      notes: data.notes ? data.notes.trim() : '',
      created_at: DB.now(),
      updated_at: DB.now()
    };
    ings.push(newIng);
    DB.set('ingredients', ings);
    if (newIng.current_stock > 0) {
      addMovement(newId, 'ENTRADA', newIng.current_stock, newIng.cost_per_unit, 'Stock Inicial', 'Registro inicial del insumo');
    }
    return ok(newIng);
  },

  updateIngredient(id, data) {
    const ings = getIngredients();
    const idx = ings.findIndex(i => i.id == id);
    if (idx < 0) return err('Insumo no encontrado');
    const cur = ings[idx];
    ings[idx] = {
      ...cur,
      name: data.name !== undefined ? data.name.trim() : cur.name,
      category: data.category !== undefined ? data.category.trim() : cur.category,
      unit: data.unit !== undefined ? data.unit.trim() : cur.unit,
      cost_per_unit: data.cost_per_unit !== undefined ? parseFloat(data.cost_per_unit) : cur.cost_per_unit,
      min_stock: data.min_stock !== undefined ? parseFloat(data.min_stock) : cur.min_stock,
      notes: data.notes !== undefined ? String(data.notes) : cur.notes,
      updated_at: DB.now()
    };
    DB.set('ingredients', ings);
    return ok(ings[idx]);
  },

  adjustStock(id, data) {
    const ings = getIngredients();
    const ing = ings.find(i => i.id == id);
    if (!ing) return err('Insumo no encontrado');

    const qty = parseFloat(data.quantity) || 0;
    const type = data.type || 'AJUSTE';

    if (type === 'AJUSTE_EXACTO') {
      // Ajustar a valor exacto
      ing.current_stock = qty;
    } else if (type === 'ENTRADA') {
      ing.current_stock = Math.round((ing.current_stock + qty) * 1000) / 1000;
    } else if (type === 'SALIDA') {
      ing.current_stock = Math.round((ing.current_stock - qty) * 1000) / 1000;
    } else {
      // AJUSTE u otros: diferencia
      ing.current_stock = Math.round((ing.current_stock + qty) * 1000) / 1000;
    }
    ing.updated_at = DB.now();
    DB.set('ingredients', ings);
    addMovement(id, type, qty, data.unit_cost || ing.cost_per_unit, data.reference || 'Ajuste manual', data.notes || '');
    return ok(ing);
  },

  deleteIngredient(id, force = false) {
    // Verificar si se usa en recetas
    const usedInRecipe = getRecipes().some(r => r.ingredient_id == id);
    if (usedInRecipe && !force) {
      return err('Este insumo está siendo utilizado en una o más recetas. Use force=true para eliminar igualmente.');
    }
    let ings = getIngredients();
    const ing = ings.find(i => i.id == id);
    if (!ing) return err('Insumo no encontrado');
    ings = ings.filter(i => i.id != id);
    DB.set('ingredients', ings);
    // Limpiar movimientos relacionados
    DB.set('inventory_movements', getMovements().filter(m => m.ingredient_id != id));
    return ok({ message: `Insumo '${ing.name}' eliminado` });
  },

  // ── Productos ────────────────────────────────────────────────────
  getProducts() {
    return ok(getProducts().filter(p => p.is_active).map(enrichProduct));
  },

  getProduct(id) {
    const p = getProduct(id);
    if (!p) return err('Producto no encontrado');
    const recipeIngIds = getRecipes().filter(r => r.product_id == id);
    const allIngs = getIngredients();
    const items = recipeIngIds.map(r => {
      const ing = allIngs.find(i => i.id === r.ingredient_id);
      return {
        recipe_item_id: r.id,
        ingredient_id: r.ingredient_id,
        recipe_quantity: r.quantity,
        recipe_notes: r.notes,
        ingredient_name: ing ? ing.name : '—',
        ingredient_category: ing ? ing.category : '',
        ingredient_unit: ing ? ing.unit : '',
        cost_per_unit: ing ? ing.cost_per_unit : 0,
        current_stock: ing ? ing.current_stock : 0,
        ingredient_total_cost: ing ? r.quantity * ing.cost_per_unit : 0
      };
    });
    const totalCost = items.reduce((s, i) => s + i.ingredient_total_cost, 0);
    const grossProfit = p.sale_price - totalCost;
    const pct = p.sale_price > 0 ? (grossProfit / p.sale_price) * 100 : 0;
    return ok({
      ...p,
      recipe: items,
      total_recipe_cost: Math.round(totalCost * 100) / 100,
      unit_cost: p.yield_quantity > 0 ? Math.round((totalCost / p.yield_quantity) * 100) / 100 : totalCost,
      gross_profit: Math.round(grossProfit * 100) / 100,
      profit_margin_pct: Math.round(pct * 10) / 10
    });
  },

  createProduct(data) {
    const prods = getProducts();
    const newId = prods.length > 0 ? Math.max(...prods.map(p => p.id)) + 1 : 1;
    const newProd = {
      id: newId,
      name: data.name.trim(),
      category: data.category.trim(),
      description: data.description || '',
      sale_price: parseFloat(data.sale_price) || 0,
      yield_quantity: parseFloat(data.yield_quantity) || 1,
      yield_unit: data.yield_unit || 'unidad',
      is_active: 1,
      created_at: DB.now(),
      updated_at: DB.now()
    };
    prods.push(newProd);
    DB.set('products', prods);

    // Guardar receta si viene
    if (data.recipe && Array.isArray(data.recipe)) {
      const allRecipes = getRecipes();
      // Eliminar receta anterior si existe
      const filtered = allRecipes.filter(r => r.product_id !== newId);
      let nextRecipeId = filtered.length > 0 ? Math.max(...filtered.map(r => r.id)) + 1 : 1;
      for (const item of data.recipe) {
        filtered.push({ id: nextRecipeId++, product_id: newId, ingredient_id: item.ingredient_id, quantity: item.quantity, notes: '' });
      }
      DB.set('recipes', filtered);
    }

    return ok(enrichProduct(newProd));
  },

  updateProduct(id, data) {
    const prods = getProducts();
    const idx = prods.findIndex(p => p.id == id);
    if (idx < 0) return err('Producto no encontrado');
    const cur = prods[idx];
    prods[idx] = {
      ...cur,
      name: data.name !== undefined ? data.name.trim() : cur.name,
      category: data.category !== undefined ? data.category.trim() : cur.category,
      description: data.description !== undefined ? data.description : cur.description,
      sale_price: data.sale_price !== undefined ? parseFloat(data.sale_price) : cur.sale_price,
      yield_quantity: data.yield_quantity !== undefined ? parseFloat(data.yield_quantity) : cur.yield_quantity,
      yield_unit: data.yield_unit !== undefined ? data.yield_unit : cur.yield_unit,
      updated_at: DB.now()
    };
    DB.set('products', prods);
    return ok(enrichProduct(prods[idx]));
  },

  saveRecipe(productId, items) {
    const allRecipes = getRecipes().filter(r => r.product_id != productId);
    let nextId = allRecipes.length > 0 ? Math.max(...allRecipes.map(r => r.id)) + 1 : 1;
    for (const item of items) {
      allRecipes.push({ id: nextId++, product_id: Number(productId), ingredient_id: item.ingredient_id, quantity: item.quantity, notes: '' });
    }
    DB.set('recipes', allRecipes);
    return ok({ message: 'Receta guardada con éxito' });
  },

  deleteRecipe(productId) {
    DB.set('recipes', getRecipes().filter(r => r.product_id != productId));
    return ok({ message: 'Receta eliminada' });
  },

  deleteProduct(id, force = false) {
    const usedInOrder = getOrderItems().some(i => i.product_id == id);
    if (usedInOrder && !force) {
      return err('Este producto está asociado a pedidos existentes. Use force=true para eliminar.');
    }
    const prods = getProducts();
    const prod = prods.find(p => p.id == id);
    if (!prod) return err('Producto no encontrado');
    // Soft delete
    prod.is_active = 0;
    DB.set('products', prods);
    return ok({ message: `Producto '${prod.name}' eliminado` });
  },

  // ── Proyección de producción ───────────────────────────────────────
  projectProduction(productId, quantity) {
    const product = getProduct(productId);
    if (!product) return err('Producto no encontrado');
    const qty = parseFloat(quantity);
    if (!qty || qty <= 0) return err('Cantidad inválida');

    const recipeItems = getRecipes().filter(r => r.product_id == productId);
    if (recipeItems.length === 0) return err('Este producto no tiene una receta configurada todavía. Vaya a Catálogo & Recetas para agregar los ingredientes.');

    const yieldQty = product.yield_quantity > 0 ? product.yield_quantity : 1;
    const scaleFactor = qty / yieldQty;

    let totalCost = 0;
    let hasShortage = false;

    const calculatedIngredients = recipeItems.map(r => {
      const ing = getIngredient(r.ingredient_id);
      if (!ing) return null;
      const requiredQty = Math.round(r.quantity * scaleFactor * 1000) / 1000;
      const itemCost = Math.round(requiredQty * ing.cost_per_unit * 100) / 100;
      totalCost += itemCost;
      const isEnough = ing.current_stock >= requiredQty;
      if (!isEnough) hasShortage = true;
      return {
        ingredient_id: r.ingredient_id,
        name: ing.name,
        category: ing.category,
        unit: ing.unit,
        unit_cost: ing.cost_per_unit,
        base_quantity: r.quantity,
        required_quantity: requiredQty,
        current_stock: ing.current_stock,
        is_enough: isEnough,
        shortage: isEnough ? 0 : Math.round((requiredQty - ing.current_stock) * 1000) / 1000,
        total_cost: itemCost
      };
    }).filter(Boolean);

    const expectedRevenue = Math.round((qty / yieldQty) * product.sale_price * 100) / 100;
    const expectedProfit = Math.round((expectedRevenue - totalCost) * 100) / 100;
    const profitPct = expectedRevenue > 0 ? Math.round((expectedProfit / expectedRevenue * 100) * 10) / 10 : 0;

    return ok({
      product: { id: product.id, name: product.name, category: product.category, sale_price: product.sale_price, yield_quantity: product.yield_quantity, yield_unit: product.yield_unit },
      production_plan: {
        quantity_to_produce: qty,
        scale_factor: Math.round(scaleFactor * 1000) / 1000,
        batches: Math.round(scaleFactor * 10) / 10,
        ingredients: calculatedIngredients,
        has_shortage: hasShortage,
        total_cost: totalCost,
        expected_revenue: expectedRevenue,
        expected_profit: expectedProfit,
        profit_margin_pct: profitPct
      }
    });
  },

  executeProduction(productId, quantity, notes, allowNegative = false) {
    const product = getProduct(productId);
    if (!product) return err('Producto no encontrado');
    const qty = parseFloat(quantity);
    if (!qty || qty <= 0) return err('Cantidad inválida');

    const recipeItems = getRecipes().filter(r => r.product_id == productId);
    if (recipeItems.length === 0) return err('El producto no tiene receta definida');

    const yieldQty = product.yield_quantity > 0 ? product.yield_quantity : 1;
    const scaleFactor = qty / yieldQty;
    const allIngs = getIngredients();

    if (!allowNegative) {
      for (const r of recipeItems) {
        const ing = allIngs.find(i => i.id === r.ingredient_id);
        if (!ing) continue;
        const required = r.quantity * scaleFactor;
        if (ing.current_stock < required) {
          return err(`Stock insuficiente para '${ing.name}'. Requerido: ${Math.round(required * 100) / 100} ${ing.unit}, Disponible: ${ing.current_stock} ${ing.unit}.`);
        }
      }
    }

    let totalCost = 0;
    for (const r of recipeItems) {
      const ing = allIngs.find(i => i.id === r.ingredient_id);
      if (!ing) continue;
      const required = Math.round(r.quantity * scaleFactor * 1000) / 1000;
      const cost = Math.round(required * ing.cost_per_unit * 100) / 100;
      totalCost += cost;
      ing.current_stock = Math.round((ing.current_stock - required) * 1000) / 1000;
      ing.updated_at = DB.now();
      addMovement(r.ingredient_id, 'SALIDA_PRODUCCION', required, ing.cost_per_unit,
        `Producción: ${qty} ${product.name}`, notes || 'Consumo automático de insumos por producción');
    }
    DB.set('ingredients', allIngs);

    const prods = getProductions();
    const newId = prods.length > 0 ? Math.max(...prods.map(p => p.id)) + 1 : 1;
    const revenue = (qty / yieldQty) * product.sale_price;
    prods.push({ id: newId, product_id: Number(productId), quantity: qty, total_cost: totalCost, expected_revenue: revenue, notes: notes || `Elaboración de ${qty} ${product.name}`, production_date: DB.now() });
    DB.set('productions', prods);

    return ok({ message: '¡Producción ejecutada con éxito! Insumos descontados del inventario.', production_id: newId, product_name: product.name, quantity_produced: qty, total_cost_consumed: totalCost });
  },

  // ── Clientes ────────────────────────────────────────────────────
  getCustomers() {
    return ok(getCustomers());
  },

  getCustomer(id) {
    const c = getCustomer(id);
    if (!c) return err('Cliente no encontrado');
    return ok(c);
  },

  createCustomer(data) {
    const all = getCustomers();
    const newId = all.length > 0 ? Math.max(...all.map(c => c.id)) + 1 : 1;
    const newC = { id: newId, name: data.name.trim(), phone: data.phone || '', email: data.email || '', address: data.address || '', notes: data.notes || '', created_at: DB.now(), updated_at: DB.now() };
    all.push(newC);
    DB.set('customers', all);
    return ok(newC);
  },

  updateCustomer(id, data) {
    const all = getCustomers();
    const idx = all.findIndex(c => c.id == id);
    if (idx < 0) return err('Cliente no encontrado');
    const cur = all[idx];
    all[idx] = { ...cur, name: data.name !== undefined ? data.name.trim() : cur.name, phone: data.phone !== undefined ? data.phone : cur.phone, email: data.email !== undefined ? data.email : cur.email, address: data.address !== undefined ? data.address : cur.address, notes: data.notes !== undefined ? data.notes : cur.notes, updated_at: DB.now() };
    DB.set('customers', all);
    return ok(all[idx]);
  },

  deleteCustomer(id, force = false) {
    const usedInOrder = getOrders().some(o => o.customer_id == id);
    if (usedInOrder && !force) return err('Este cliente tiene pedidos asociados. Use force=true para eliminar.');
    let all = getCustomers();
    const c = all.find(x => x.id == id);
    if (!c) return err('Cliente no encontrado');
    DB.set('customers', all.filter(x => x.id != id));
    return ok({ message: `Cliente '${c.name}' eliminado` });
  },

  // ── Pedidos ──────────────────────────────────────────────────────
  getOrders(params = {}) {
    const today = DB.today();
    let orders = getOrders().map(enrichOrder);

    if (params.status) orders = orders.filter(o => o.status === params.status);
    if (params.payment_status) orders = orders.filter(o => o.payment_status === params.payment_status);

    if (params.date) {
      orders = orders.filter(o => o.delivery_date === params.date);
    } else if (params.period === 'today') {
      orders = orders.filter(o => o.delivery_date === today);
    } else if (params.period === 'tomorrow') {
      const tomorrow = DB.dayOffset(1);
      orders = orders.filter(o => o.delivery_date === tomorrow);
    } else if (params.period === 'week') {
      const nextWeek = DB.dayOffset(7);
      orders = orders.filter(o => o.delivery_date >= today && o.delivery_date <= nextWeek);
    }

    orders.sort((a, b) => {
      if (a.delivery_date !== b.delivery_date) return a.delivery_date.localeCompare(b.delivery_date);
      if (a.delivery_time !== b.delivery_time) return (a.delivery_time || '').localeCompare(b.delivery_time || '');
      return b.id - a.id;
    });
    return ok(orders);
  },

  getOrder(id) {
    const o = getOrder(id);
    if (!o) return err('Pedido no encontrado');
    const customer = getCustomer(o.customer_id);
    const items = getOrderItems().filter(i => i.order_id == id).map(item => {
      const prod = getProduct(item.product_id);
      return { ...item, product_name: prod ? prod.name : '—', product_category: prod ? prod.category : '', yield_unit: prod ? prod.yield_unit : '' };
    });
    const payments = getPayments().filter(p => p.order_id == id).sort((a, b) => a.payment_date.localeCompare(b.payment_date));
    return ok({
      ...o,
      pending_balance: o.total_amount - o.total_paid,
      customer_name: customer ? customer.name : '—',
      customer_phone: customer ? customer.phone : '',
      customer_email: customer ? customer.email : '',
      customer_default_address: customer ? customer.address : '',
      items,
      payments
    });
  },

  createOrder(data) {
    const { customer_id, delivery_date, delivery_time, delivery_type, delivery_address, notes, items, initial_payment, deduct_inventory_now } = data;

    if (!customer_id || !delivery_date || !items || items.length === 0) {
      return err('Cliente, fecha de entrega y al menos un producto son obligatorios');
    }

    const year = new Date().getFullYear();
    const allOrders = getOrders();
    const nextNum = (allOrders.length + 1).toString().padStart(4, '0');
    const orderNumber = `PED-${year}-${nextNum}`;

    let totalAmount = 0;
    let totalCost = 0;
    const processedItems = [];

    for (const it of items) {
      const product = getProduct(it.product_id);
      if (!product) continue;
      const qty = parseFloat(it.quantity) || 1;
      const price = it.unit_price !== undefined ? parseFloat(it.unit_price) : product.sale_price;
      const subtotal = qty * price;
      totalAmount += subtotal;

      const yieldQty = product.yield_quantity > 0 ? product.yield_quantity : 1;
      const recipeCost = calcRecipeCost(it.product_id);
      const unitCost = recipeCost / yieldQty;
      totalCost += unitCost * qty;

      processedItems.push({ product_id: it.product_id, quantity: qty, unit_price: price, unit_cost: unitCost, subtotal, notes: it.notes || '' });
    }

    const newOrderId = allOrders.length > 0 ? Math.max(...allOrders.map(o => o.id)) + 1 : 1;
    const initialAmount = (initial_payment && parseFloat(initial_payment.amount)) || 0;
    let paymentStatus = 'PENDIENTE';
    if (initialAmount >= totalAmount) paymentStatus = 'PAGADO';
    else if (initialAmount > 0) paymentStatus = 'ABONO_PARCIAL';

    const newOrder = {
      id: newOrderId,
      order_number: orderNumber,
      customer_id,
      delivery_date,
      delivery_time: delivery_time || '12:00',
      delivery_type: delivery_type || 'RETIRO',
      delivery_address: delivery_address || '',
      status: 'PENDIENTE',
      payment_status: paymentStatus,
      total_amount: Math.round(totalAmount * 100) / 100,
      total_cost: Math.round(totalCost * 100) / 100,
      total_paid: initialAmount,
      inventory_deducted: 0,
      notes: notes || '',
      created_at: DB.now(),
      updated_at: DB.now()
    };
    allOrders.push(newOrder);
    DB.set('orders', allOrders);

    // Items
    const allItems = getOrderItems();
    let nextItemId = allItems.length > 0 ? Math.max(...allItems.map(i => i.id)) + 1 : 1;
    for (const item of processedItems) {
      allItems.push({ id: nextItemId++, order_id: newOrderId, ...item });
    }
    DB.set('order_items', allItems);

    // Abono inicial
    if (initialAmount > 0 && initial_payment) {
      const pays = getPayments();
      const nextPayId = pays.length > 0 ? Math.max(...pays.map(p => p.id)) + 1 : 1;
      pays.push({ id: nextPayId, order_id: newOrderId, customer_id, amount: initialAmount, payment_method: initial_payment.payment_method || 'EFECTIVO', reference: initial_payment.reference || '', notes: 'Abono inicial registrado con la creación del pedido', payment_date: DB.now() });
      DB.set('payments', pays);
    }

    if (deduct_inventory_now) {
      deductOrderInventory(newOrderId, orderNumber);
    }

    return ok(newOrder);
  },

  updateOrderStatus(id, status) {
    const validStatuses = ['PENDIENTE', 'EN_PREPARACION', 'LISTO', 'ENTREGADO', 'CANCELADO'];
    if (!validStatuses.includes(status)) return err('Estado no válido');

    const orders = getOrders();
    const o = orders.find(x => x.id == id);
    if (!o) return err('Pedido no encontrado');

    if (['EN_PREPARACION', 'LISTO', 'ENTREGADO'].includes(status) && o.inventory_deducted === 0) {
      deductOrderInventory(id, o.order_number);
    }
    if (status === 'CANCELADO' && o.inventory_deducted === 1) {
      restoreOrderInventory(id, o.order_number);
    }

    // Recargar tras posibles modificaciones por deductOrderInventory
    const freshOrders = getOrders();
    const fo = freshOrders.find(x => x.id == id);
    if (fo) { fo.status = status; fo.updated_at = DB.now(); }
    DB.set('orders', freshOrders);
    return ok({ message: `Estado actualizado a ${status}`, order: fo });
  },

  updateOrder(id, data) {
    const orders = getOrders();
    const o = orders.find(x => x.id == id);
    if (!o) return err('Pedido no encontrado');
    if (data.delivery_date !== undefined)   o.delivery_date   = data.delivery_date;
    if (data.delivery_time !== undefined)   o.delivery_time   = data.delivery_time;
    if (data.delivery_type !== undefined)   o.delivery_type   = data.delivery_type;
    if (data.delivery_address !== undefined) o.delivery_address = data.delivery_address;
    if (data.notes !== undefined)           o.notes           = data.notes;
    o.updated_at = DB.now();
    DB.set('orders', orders);
    return ok(o);
  },

  deleteOrder(id) {
    const orders = getOrders();
    const o = orders.find(x => x.id == id);
    if (!o) return err('Pedido no encontrado');
    if (o.inventory_deducted === 1) restoreOrderInventory(id, o.order_number);
    DB.set('orders', orders.filter(x => x.id != id));
    DB.set('order_items', getOrderItems().filter(i => i.order_id != id));
    DB.set('payments', getPayments().filter(p => p.order_id != id));
    return ok({ message: `Pedido #${o.order_number} eliminado con éxito` });
  },

  // ── Pagos ────────────────────────────────────────────────────────
  addPayment(data) {
    const { order_id, amount, payment_method, reference, notes } = data;
    const payAmount = parseFloat(amount);
    if (!order_id || !payAmount || payAmount <= 0) return err('Pedido válido y monto mayor a cero son obligatorios');

    const orders = getOrders();
    const o = orders.find(x => x.id == order_id);
    if (!o) return err('Pedido no encontrado');

    const pays = getPayments();
    const newId = pays.length > 0 ? Math.max(...pays.map(p => p.id)) + 1 : 1;
    const newPay = { id: newId, order_id, customer_id: o.customer_id, amount: payAmount, payment_method: payment_method || 'EFECTIVO', reference: reference ? reference.trim() : '', notes: notes ? notes.trim() : '', payment_date: DB.now() };
    pays.push(newPay);
    DB.set('payments', pays);

    // Recalcular total pagado
    const newTotalPaid = pays.filter(p => p.order_id == order_id).reduce((s, p) => s + p.amount, 0);
    let newPaymentStatus = 'PENDIENTE';
    if (newTotalPaid >= o.total_amount) newPaymentStatus = 'PAGADO';
    else if (newTotalPaid > 0) newPaymentStatus = 'ABONO_PARCIAL';
    o.total_paid = newTotalPaid;
    o.payment_status = newPaymentStatus;
    o.updated_at = DB.now();
    DB.set('orders', orders);

    const customer = getCustomer(o.customer_id);
    return ok({
      message: 'Abono registrado con éxito',
      payment_id: newId,
      order: { ...o, pending_balance: o.total_amount - o.total_paid, customer_name: customer ? customer.name : '—' }
    });
  },

  // ── Métricas financieras ─────────────────────────────────────────
  getMetrics(period = 'month') {
    const today = DB.today();
    let ordersFiltered = getOrders().filter(o => o.status !== 'CANCELADO');

    if (period === 'today') {
      ordersFiltered = ordersFiltered.filter(o => o.delivery_date === today);
    } else if (period === 'week') {
      const weekAgo = DB.dayOffset(-7);
      ordersFiltered = ordersFiltered.filter(o => o.delivery_date >= weekAgo);
    } else if (period === 'month') {
      const monthStart = today.slice(0, 7) + '-01';
      ordersFiltered = ordersFiltered.filter(o => o.delivery_date >= monthStart);
    }

    const totalRevenue  = ordersFiltered.reduce((s, o) => s + o.total_amount, 0);
    const totalCost     = ordersFiltered.reduce((s, o) => s + o.total_cost,   0);
    const totalCollected= ordersFiltered.reduce((s, o) => s + o.total_paid,   0);
    const netProfit     = totalRevenue - totalCost;
    const profitPct     = totalRevenue > 0 ? Math.round((netProfit / totalRevenue * 100) * 10) / 10 : 0;
    const periodReceiv  = ordersFiltered.reduce((s, o) => s + (o.total_amount - o.total_paid), 0);

    // Cuentas globales por cobrar (todos los pedidos no cancelados sin pagar)
    const globalReceiv = getOrders().filter(o => o.status !== 'CANCELADO' && o.payment_status !== 'PAGADO')
      .reduce((s, o) => s + (o.total_amount - o.total_paid), 0);

    // Desglose por estado
    const statusMap = {};
    getOrders().forEach(o => {
      if (!statusMap[o.status]) statusMap[o.status] = { status: o.status, count: 0, total_amount: 0 };
      statusMap[o.status].count++;
      statusMap[o.status].total_amount += o.total_amount;
    });
    const statusBreakdown = Object.values(statusMap);

    // Top productos
    const productRevMap = {};
    getOrderItems().forEach(item => {
      const order = getOrder(item.order_id);
      if (!order || order.status === 'CANCELADO') return;
      const prod = getProduct(item.product_id);
      if (!prod) return;
      if (!productRevMap[item.product_id]) productRevMap[item.product_id] = { id: prod.id, name: prod.name, category: prod.category, units_sold: 0, total_revenue: 0, total_cost: 0, profit: 0 };
      productRevMap[item.product_id].units_sold   += item.quantity;
      productRevMap[item.product_id].total_revenue += item.subtotal;
      productRevMap[item.product_id].total_cost   += item.unit_cost * item.quantity;
      productRevMap[item.product_id].profit       += item.subtotal - item.unit_cost * item.quantity;
    });
    const topProducts = Object.values(productRevMap).sort((a, b) => b.units_sold - a.units_sold).slice(0, 5);

    // Gráfico diario (últimos 7 días)
    const dailyChart = [];
    for (let i = 6; i >= 0; i--) {
      const d = DB.dayOffset(-i);
      const dayOrders = getOrders().filter(o => o.delivery_date === d && o.status !== 'CANCELADO');
      dailyChart.push({
        date: d,
        revenue: dayOrders.reduce((s, o) => s + o.total_amount, 0),
        cost: dayOrders.reduce((s, o) => s + o.total_cost, 0),
        profit: dayOrders.reduce((s, o) => s + (o.total_amount - o.total_cost), 0)
      });
    }

    // Resumen de inventario
    const allIngs = getIngredients();
    const inventorySummary = {
      total_ingredients: allIngs.length,
      low_stock_count: allIngs.filter(i => i.current_stock <= i.min_stock).length,
      total_inventory_value: Math.round(allIngs.reduce((s, i) => s + i.current_stock * i.cost_per_unit, 0) * 100) / 100
    };

    return ok({
      period: period || 'month',
      summary: {
        total_orders: ordersFiltered.length,
        total_revenue: Math.round(totalRevenue * 100) / 100,
        total_cost: Math.round(totalCost * 100) / 100,
        net_profit: Math.round(netProfit * 100) / 100,
        profit_margin_pct: profitPct,
        total_collected: Math.round(totalCollected * 100) / 100,
        period_receivables: Math.round(periodReceiv * 100) / 100,
        global_receivables: Math.round(globalReceiv * 100) / 100
      },
      inventory: inventorySummary,
      status_breakdown: statusBreakdown,
      top_products: topProducts,
      daily_chart: dailyChart
    });
  }
};

// ─── Inicializar datos al cargar el script ────────────────────────────
seedInitialData();
