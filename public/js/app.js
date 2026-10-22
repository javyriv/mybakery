// Estado global de la aplicación
const AppState = {
  currentView: 'dashboard',
  products: [],
  ingredients: [],
  customers: [],
  orders: [],
  inventoryFilter: 'ALL',
  ordersPeriod: 'today',
  metricsPeriod: 'month',
  orderItemsBuilder: [],
  recipeItemsBuilder: [],
  chartInstance: null,
  activeTicketOrder: null
};

// Inicialización de la aplicación al cargar el DOM
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const settings = await API.getSettings();
    if (settings.currency_symbol) UI.currencySymbol = settings.currency_symbol;
    if (settings.bakery_name) {
      document.getElementById('header-bakery-name').textContent = settings.bakery_name.split('—')[0].trim();
    }
  } catch (e) {
    console.warn('Ajustes por defecto cargados.');
  }

  // Cargar datos iniciales
  await Promise.all([
    refreshInventoryState(),
    refreshProductsState(),
    refreshCustomersState()
  ]);

  switchView('dashboard');
});

// Navegación entre Vistas
function switchView(viewName, filterParam = null) {
  AppState.currentView = viewName;

  // Actualizar visibilidad de secciones
  document.querySelectorAll('.app-view').forEach(el => el.style.display = 'none');
  const targetView = document.getElementById(`view-${viewName}`);
  if (targetView) targetView.style.display = 'block';

  // Actualizar estados activos en la barra de navegación móvil
  document.querySelectorAll('.bottom-nav .nav-item').forEach(btn => btn.classList.remove('active'));
  const activeBnav = document.getElementById(`bnav-${viewName}`);
  if (activeBnav) activeBnav.classList.add('active');

  // Actualizar estados en desktop nav
  document.querySelectorAll('.desktop-nav .nav-item').forEach(btn => btn.classList.remove('active'));
  const activeDnav = document.getElementById(`dnav-${viewName}`);
  if (activeDnav) activeDnav.classList.add('active');

  // Ejecutar cargadores específicos por vista
  if (viewName === 'dashboard') loadDashboard();
  if (viewName === 'production') loadProductionView();
  if (viewName === 'inventory') {
    if (filterParam) filterInventoryCategory(filterParam);
    else renderInventoryList();
  }
  if (viewName === 'orders') {
    if (filterParam) filterOrdersPeriod(filterParam);
    else loadOrders();
  }
  if (viewName === 'customers') renderCustomersList();
  if (viewName === 'metrics') loadMetrics(AppState.metricsPeriod);

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Cargar y refrescar Dashboard
async function loadDashboard() {
  try {
    const [metrics, alerts, todayOrders] = await Promise.all([
      API.getMetrics('month'),
      API.getInventoryAlerts(),
      API.getOrders({ period: 'today' })
    ]);

    // Resumen en header y badge
    const alertCountBadge = document.getElementById('header-alert-count');
    if (alerts.length > 0) {
      alertCountBadge.textContent = alerts.length;
      alertCountBadge.style.display = 'flex';
      document.getElementById('dashboard-stock-alert').style.display = 'flex';
      document.getElementById('dashboard-stock-alert-text').textContent = 
        `Hay ${alerts.length} insumo(s) bajo el stock mínimo de seguridad (${alerts.map(a => a.name).slice(0, 3).join(', ')}...)`;
    } else {
      alertCountBadge.style.display = 'none';
      document.getElementById('dashboard-stock-alert').style.display = 'none';
    }

    // Estadísticas
    const pendingToday = todayOrders.filter(o => o.status !== 'ENTREGADO' && o.status !== 'CANCELADO');
    document.getElementById('stat-orders-today').textContent = todayOrders.length;
    document.getElementById('stat-orders-today-sub').textContent = `${pendingToday.length} pendientes de entrega`;
    document.getElementById('stat-receivables').textContent = UI.formatCurrency(metrics.summary.global_receivables);
    document.getElementById('stat-month-sales').textContent = UI.formatCurrency(metrics.summary.total_revenue);
    document.getElementById('stat-month-orders').textContent = `${metrics.summary.total_orders} pedidos`;
    document.getElementById('stat-low-stock-count').textContent = alerts.length;

    // Lista de entregas de hoy
    const listEl = document.getElementById('dashboard-today-orders-list');
    if (todayOrders.length === 0) {
      listEl.innerHTML = `
        <div style="text-align:center; padding:30px 10px; color:var(--cream-500);">
          <i class="ti ti-calendar-smile" style="font-size:36px; display:block; margin-bottom:8px; color:var(--primary-400);"></i>
          No hay entregas programadas para hoy todavía.
        </div>`;
    } else {
      listEl.innerHTML = todayOrders.map(order => renderOrderCardHtml(order, true)).join('');
    }
  } catch (err) {
    console.error('Error cargando dashboard:', err);
  }
}

// ==================== MÓDULO DE PROYECCIÓN Y COSTOS ====================
async function loadProductionView() {
  await refreshProductsState();
  const select = document.getElementById('proj-product-select');
  select.innerHTML = AppState.products.map(p => 
    `<option value="${p.id}">${p.name} (${UI.formatCurrency(p.sale_price)})`
  ).join('');

  if (AppState.products.length > 0) {
    runProductionProjection();
  } else {
    document.getElementById('projection-results-container').style.display = 'none';
  }
  renderProductsList();
}

async function runProductionProjection() {
  const select = document.getElementById('proj-product-select');
  const qtyInput = document.getElementById('proj-quantity-input');
  const resultsContainer = document.getElementById('projection-results-container');

  const productId = select.value;
  const quantity = parseFloat(qtyInput.value) || 1;

  if (!productId) {
    resultsContainer.style.display = 'none';
    return;
  }

  try {
    const data = await API.projectProduction(productId, quantity);
    const plan = data.production_plan;

    document.getElementById('proj-total-cost').textContent = UI.formatCurrency(plan.total_cost);
    const unitCost = quantity > 0 ? (plan.total_cost / quantity) : 0;
    document.getElementById('proj-unit-cost').textContent = `${UI.formatCurrency(unitCost)} c/u`;

    document.getElementById('proj-total-revenue').textContent = UI.formatCurrency(plan.expected_revenue);
    document.getElementById('proj-profit-margin').textContent = 
      `Ganancia: ${UI.formatCurrency(plan.expected_profit)} (${plan.profit_margin_pct}%)`;

    const badgeEl = document.getElementById('proj-stock-status-badge');
    const executeBtn = document.getElementById('btn-execute-production');

    if (plan.has_shortage) {
      badgeEl.className = 'badge badge-danger';
      badgeEl.innerHTML = '<i class="ti ti-alert-circle"></i> Insumos Insuficientes';
      executeBtn.innerHTML = '<i class="ti ti-alert-triangle"></i> Descontar Insumos (Faltan Materiales)';
      executeBtn.className = 'btn btn-danger btn-block';
    } else {
      badgeEl.className = 'badge badge-success';
      badgeEl.innerHTML = '<i class="ti ti-check"></i> Stock Disponible';
      executeBtn.innerHTML = '<i class="ti ti-flame"></i> Ejecutar Producción / Descontar Insumos';
      executeBtn.className = 'btn btn-primary btn-block';
    }

    const tableEl = document.getElementById('proj-ingredients-table');
    tableEl.innerHTML = plan.ingredients.map(ing => `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px dashed var(--cream-200); font-size:13px;">
        <div>
          <strong>${ing.name}</strong>
          <div style="font-size:11px; color:var(--cream-700);">
            Requerido: <strong>${ing.required_quantity} ${ing.unit}</strong> | Stock: ${ing.current_stock} ${ing.unit}
          </div>
        </div>
        <div>
          ${ing.is_enough 
            ? '<span class="badge badge-success">Suficiente</span>' 
            : `<span class="badge badge-danger">Faltan ${ing.shortage} ${ing.unit}</span>`}
        </div>
      </div>
    `).join('');

    resultsContainer.style.display = 'block';
  } catch (err) {
    resultsContainer.style.display = 'none';
    UI.showToast(err.message, 'error');
  }
}

async function executeProductionBatch() {
  const select = document.getElementById('proj-product-select');
  const qtyInput = document.getElementById('proj-quantity-input');
  const productId = select.value;
  const quantity = parseFloat(qtyInput.value) || 1;

  if (!confirm(`¿Confirmas la producción de ${quantity} unidades? Se descontará la materia prima de forma inmediata del inventario.`)) {
    return;
  }

  try {
    const res = await API.executeProduction(productId, quantity, 'Producción ejecutada desde el simulador', true);
    UI.showToast(res.message, 'success');
    await refreshInventoryState();
    runProductionProjection();
  } catch (err) {
    UI.showToast(err.message, 'error');
  }
}

function renderProductsList() {
  const container = document.getElementById('products-list-container');
  if (AppState.products.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--cream-500);">No hay productos registrados en el catálogo.</div>';
    return;
  }

  container.innerHTML = AppState.products.map(p => `
    <div class="item-card">
      <div class="item-card-top">
        <div>
          <div class="item-card-title">${p.name}</div>
          <div class="item-card-meta">${p.category} • Rendimiento base: ${p.yield_quantity} ${p.yield_unit}</div>
        </div>
        <span class="badge badge-mint">${UI.formatCurrency(p.sale_price)}</span>
      </div>
      <div class="item-card-details">
        <div class="detail-pill">Costo Insumos: <strong>${UI.formatCurrency(p.total_recipe_cost)}</strong></div>
        <div class="detail-pill">Ganancia: <strong>${UI.formatCurrency(p.gross_profit)}</strong></div>
        <div class="detail-pill">Margen: <strong>${p.profit_margin_pct}%</strong></div>
        <div class="detail-pill">Ingredientes: <strong>${p.ingredients_count}</strong></div>
      </div>
      <div class="item-card-actions">
        <button class="btn btn-secondary btn-sm" onclick="quickSelectProductForProjection(${p.id})">
          <i class="ti ti-calculator"></i> Proyectar
        </button>
        ${p.ingredients_count > 0 ? `
        <button class="btn btn-secondary btn-sm" title="Vaciar ingredientes de la receta" onclick="confirmDeleteRecipe(${p.id}, '${escapeQuotes(p.name)}')">
          <i class="ti ti-tools-kitchen-2-off"></i> Vaciar Receta
        </button>` : ''}
        <button class="btn btn-danger btn-sm" title="Eliminar Producto" onclick="confirmDeleteProduct(${p.id}, '${escapeQuotes(p.name)}')">
          <i class="ti ti-trash"></i> Eliminar
        </button>
      </div>
    </div>
  `).join('');
}

function quickSelectProductForProjection(productId) {
  document.getElementById('proj-product-select').value = productId;
  runProductionProjection();
  window.scrollTo({ top: 100, behavior: 'smooth' });
}

// Eliminar receta de un producto
async function confirmDeleteRecipe(productId, productName) {
  if (!confirm(`¿Deseas vaciar/eliminar la receta del producto '${productName}'? Los ingredientes asociados se desvincularán del producto.`)) {
    return;
  }

  try {
    const res = await API.deleteRecipe(productId);
    UI.showToast(res.message, 'success');
    await refreshProductsState();
    loadProductionView();
  } catch (err) {
    UI.showToast(err.message, 'error');
  }
}

// Eliminar producto por completo
async function confirmDeleteProduct(productId, productName) {
  if (!confirm(`¿Estás seguro de eliminar el producto '${productName}' y su receta del sistema?`)) {
    return;
  }

  try {
    const res = await API.deleteProduct(productId, false);
    UI.showToast(res.message, 'success');
    await refreshProductsState();
    loadProductionView();
  } catch (err) {
    if (err.data && err.data.has_orders) {
      if (confirm(`${err.data.error}\n\nPresiona 'Aceptar' para forzar la eliminación definitiva.`)) {
        try {
          const resForce = await API.deleteProduct(productId, true);
          UI.showToast(resForce.message, 'success');
          await refreshProductsState();
          loadProductionView();
        } catch (forceErr) {
          UI.showToast(forceErr.message, 'error');
        }
      }
    } else {
      UI.showToast(err.message, 'error');
    }
  }
}

function escapeQuotes(str) {
  return (str || '').replace(/'/g, "\\'");
}

// ==================== MÓDULO DE INVENTARIO ====================
async function refreshInventoryState() {
  AppState.ingredients = await API.getInventory();
}

async function refreshProductsState() {
  AppState.products = await API.getProducts();
}

async function refreshCustomersState() {
  AppState.customers = await API.getCustomers();
}

function filterInventoryCategory(category) {
  AppState.inventoryFilter = category;
  document.querySelectorAll('#inventory-filter-tabs .tab-chip').forEach(chip => {
    chip.classList.toggle('active', chip.textContent.includes(category) || (category === 'ALL' && chip.textContent === 'Todos'));
  });
  renderInventoryList();
}

function renderInventoryList() {
  const container = document.getElementById('inventory-list-container');
  const search = (document.getElementById('inventory-search-input').value || '').toLowerCase();

  let list = AppState.ingredients;
  if (AppState.inventoryFilter === 'ALERTS') {
    list = list.filter(i => i.current_stock <= i.min_stock);
  } else if (AppState.inventoryFilter !== 'ALL') {
    list = list.filter(i => i.category === AppState.inventoryFilter);
  }

  if (search) {
    list = list.filter(i => i.name.toLowerCase().includes(search) || i.category.toLowerCase().includes(search));
  }

  if (list.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:30px; color:var(--cream-500);">No se encontraron insumos.</div>';
    return;
  }

  container.innerHTML = list.map(item => {
    let statusBadge = '<span class="badge badge-success">Óptimo</span>';
    if (item.current_stock <= 0) {
      statusBadge = '<span class="badge badge-danger">Agotado</span>';
    } else if (item.current_stock <= item.min_stock) {
      statusBadge = '<span class="badge badge-warning">Stock Bajo</span>';
    }

    return `
      <div class="item-card ${item.current_stock <= item.min_stock ? 'alert-border' : ''}">
        <div class="item-card-top">
          <div>
            <div class="item-card-title">${item.name}</div>
            <div class="item-card-meta">${item.category} • Costo: ${UI.formatCurrency(item.cost_per_unit)} / ${item.unit}</div>
          </div>
          ${statusBadge}
        </div>
        <div class="item-card-details">
          <div class="detail-pill">Stock Actual: <strong style="font-size:15px; color:var(--primary-800);">${item.current_stock} ${item.unit}</strong></div>
          <div class="detail-pill">Mínimo Alerta: <strong>${item.min_stock} ${item.unit}</strong></div>
          <div class="detail-pill">Valor Almacén: <strong>${UI.formatCurrency(item.total_value)}</strong></div>
        </div>
        <div class="item-card-actions">
          <button class="btn btn-secondary btn-sm" onclick="openStockAdjustmentModal(${item.id})">
            <i class="ti ti-plus"></i> Ingresar / Ajustar
          </button>
          <button class="btn btn-danger btn-sm btn-icon" title="Eliminar Insumo" onclick="confirmDeleteIngredient(${item.id}, '${escapeQuotes(item.name)}')">
            <i class="ti ti-trash"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// Eliminar insumo del inventario
async function confirmDeleteIngredient(ingredientId, name) {
  if (!confirm(`¿Estás seguro de eliminar el insumo '${name}' del inventario?`)) {
    return;
  }

  try {
    const res = await API.deleteIngredient(ingredientId, false);
    UI.showToast(res.message, 'success');
    await refreshInventoryState();
    renderInventoryList();
    if (AppState.currentView === 'dashboard') loadDashboard();
  } catch (err) {
    if (err.data && err.data.in_recipes) {
      if (confirm(`${err.data.error}\n\nPresiona 'Aceptar' para retirarlo de todas las recetas y eliminar el insumo.`)) {
        try {
          const resForce = await API.deleteIngredient(ingredientId, true);
          UI.showToast(resForce.message, 'success');
          await Promise.all([refreshInventoryState(), refreshProductsState()]);
          renderInventoryList();
          if (AppState.currentView === 'dashboard') loadDashboard();
        } catch (forceErr) {
          UI.showToast(forceErr.message, 'error');
        }
      }
    } else {
      UI.showToast(err.message, 'error');
    }
  }
}

// ==================== MÓDULO DE PEDIDOS & AGENDA ====================
async function loadOrders() {
  const statusFilter = document.getElementById('orders-status-filter').value;
  const paymentFilter = document.getElementById('orders-payment-filter').value;

  const params = {};
  if (statusFilter) params.status = statusFilter;
  if (paymentFilter) params.payment_status = paymentFilter;
  if (AppState.ordersPeriod !== 'all') params.period = AppState.ordersPeriod;

  try {
    AppState.orders = await API.getOrders(params);
    renderOrdersList();
  } catch (err) {
    UI.showToast(err.message, 'error');
  }
}

function filterOrdersPeriod(period) {
  AppState.ordersPeriod = period;
  ['today', 'tomorrow', 'week', 'all'].forEach(p => {
    const btn = document.getElementById(`order-tab-${p}`);
    if (btn) btn.classList.toggle('active', p === period);
  });
  loadOrders();
}

function renderOrdersList() {
  const container = document.getElementById('orders-list-container');
  if (AppState.orders.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:30px; color:var(--cream-500);">No hay pedidos en este período o filtro.</div>';
    return;
  }
  container.innerHTML = AppState.orders.map(order => renderOrderCardHtml(order)).join('');
}

function renderOrderCardHtml(order, isDashboard = false) {
  let nextStatusBtn = '';
  if (order.status === 'PENDIENTE') {
    nextStatusBtn = `<button class="btn btn-accent btn-sm" onclick="advanceOrderStatus(${order.id}, 'EN_PREPARACION')"><i class="ti ti-flame"></i> Hornear</button>`;
  } else if (order.status === 'EN_PREPARACION') {
    nextStatusBtn = `<button class="btn btn-accent btn-sm" onclick="advanceOrderStatus(${order.id}, 'LISTO')"><i class="ti ti-package"></i> Listo</button>`;
  } else if (order.status === 'LISTO') {
    nextStatusBtn = `<button class="btn btn-primary btn-sm" onclick="advanceOrderStatus(${order.id}, 'ENTREGADO')"><i class="ti ti-check"></i> Entregar</button>`;
  }

  const payBtn = order.pending_balance > 0 
    ? `<button class="btn btn-secondary btn-sm" onclick="openPaymentModal(${order.id})"><i class="ti ti-cash"></i> Abonar</button>`
    : '';

  return `
    <div class="item-card">
      <div class="item-card-top">
        <div>
          <div class="item-card-title">${order.customer_name} <span style="font-weight:400; color:var(--cream-500); font-size:12px;">#${order.order_number}</span></div>
          <div class="item-card-meta">
            📅 ${UI.formatDate(order.delivery_date)} • ⏰ ${order.delivery_time || '12:00'} • ${order.delivery_type === 'DOMICILIO' ? '🛵 Domicilio' : '🏠 Retiro'}
          </div>
        </div>
        <div>
          ${UI.getStatusBadge(order.status)}
        </div>
      </div>
      <div class="item-card-details">
        <div class="detail-pill">Total: <strong>${UI.formatCurrency(order.total_amount)}</strong></div>
        <div class="detail-pill">Abonado: <strong>${UI.formatCurrency(order.total_paid)}</strong></div>
        <div class="detail-pill">Saldo: <strong style="color:${order.pending_balance > 0 ? 'var(--danger)' : 'var(--success)'}">${UI.formatCurrency(order.pending_balance)}</strong></div>
        <div class="detail-pill">${UI.getPaymentBadge(order.payment_status)}</div>
      </div>
      ${order.notes ? `<div style="font-size:12px; color:var(--cream-700); font-style:italic;">📝 ${order.notes}</div>` : ''}
      <div class="item-card-actions">
        <button class="btn btn-secondary btn-sm btn-icon" title="Ver Recibo" onclick="openTicketModal(${order.id})">
          <i class="ti ti-receipt"></i>
        </button>
        ${payBtn}
        ${nextStatusBtn}
        <button class="btn btn-danger btn-sm btn-icon" title="Eliminar Pedido" onclick="confirmDeleteOrder(${order.id}, '${order.order_number}')">
          <i class="ti ti-trash"></i>
        </button>
      </div>
    </div>
  `;
}

async function advanceOrderStatus(orderId, newStatus) {
  try {
    const res = await API.updateOrderStatus(orderId, newStatus);
    UI.showToast(res.message, 'success');
    if (AppState.currentView === 'dashboard') loadDashboard();
    else loadOrders();
    refreshInventoryState();
  } catch (err) {
    UI.showToast(err.message, 'error');
  }
}

// Eliminar pedido
async function confirmDeleteOrder(orderId, orderNumber) {
  if (!confirm(`¿Deseas eliminar el pedido #${orderNumber}? Si los insumos ya fueron descontados, se restaurarán al inventario automáticamente.`)) {
    return;
  }

  try {
    const res = await API.deleteOrder(orderId);
    UI.showToast(res.message, 'success');
    await Promise.all([refreshInventoryState(), refreshCustomersState()]);

    if (AppState.currentView === 'dashboard') loadDashboard();
    else if (AppState.currentView === 'orders') loadOrders();
  } catch (err) {
    UI.showToast(err.message, 'error');
  }
}

// ==================== MÓDULO DE CLIENTES ====================
function renderCustomersList() {
  const container = document.getElementById('customers-list-container');
  const search = (document.getElementById('customers-search-input').value || '').toLowerCase();

  let list = AppState.customers;
  if (search) {
    list = list.filter(c => c.name.toLowerCase().includes(search) || (c.phone && c.phone.includes(search)));
  }

  if (list.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:30px; color:var(--cream-500);">No hay clientes registrados.</div>';
    return;
  }

  container.innerHTML = list.map(c => {
    const cleanPhone = c.phone ? c.phone.replace(/[^0-9]/g, '') : '';
    const whatsappLink = cleanPhone ? `https://wa.me/${cleanPhone}` : null;

    return `
      <div class="item-card">
        <div class="item-card-top">
          <div>
            <div class="item-card-title">${c.name}</div>
            <div class="item-card-meta">${c.phone || 'Sin teléfono'} • ${c.address || 'Sin dirección registrada'}</div>
          </div>
          ${c.pending_balance > 0 
            ? `<span class="badge badge-danger">Debe: ${UI.formatCurrency(c.pending_balance)}</span>` 
            : '<span class="badge badge-success">Al Día</span>'}
        </div>
        <div class="item-card-details">
          <div class="detail-pill">Pedidos Realizados: <strong>${c.total_orders}</strong></div>
          <div class="detail-pill">Compras Totales: <strong>${UI.formatCurrency(c.total_purchases)}</strong></div>
        </div>
        ${c.notes ? `<div style="font-size:12px; color:var(--cream-700);">📌 ${c.notes}</div>` : ''}
        <div class="item-card-actions">
          ${whatsappLink ? `
            <a href="${whatsappLink}" target="_blank" class="btn btn-secondary btn-sm" style="color:#059669;">
              <i class="ti ti-brand-whatsapp"></i> Chat WhatsApp
            </a>` : ''}
          <button class="btn btn-primary btn-sm" onclick="openNewOrderWithCustomer(${c.id})">
            <i class="ti ti-plus"></i> Pedido
          </button>
          <button class="btn btn-danger btn-sm btn-icon" title="Eliminar Cliente" onclick="confirmDeleteCustomer(${c.id}, '${escapeQuotes(c.name)}')">
            <i class="ti ti-trash"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// Eliminar cliente
async function confirmDeleteCustomer(customerId, name) {
  if (!confirm(`¿Estás seguro de eliminar al cliente '${name}' del directorio?`)) {
    return;
  }

  try {
    const res = await API.deleteCustomer(customerId, false);
    UI.showToast(res.message, 'success');
    await refreshCustomersState();
    renderCustomersList();
    if (AppState.currentView === 'dashboard') loadDashboard();
  } catch (err) {
    if (err.data && err.data.has_orders) {
      if (confirm(`${err.data.error}\n\nPresiona 'Aceptar' para forzar la eliminación definitiva de este cliente y todo su historial.`)) {
        try {
          const resForce = await API.deleteCustomer(customerId, true);
          UI.showToast(resForce.message, 'success');
          await Promise.all([refreshCustomersState(), refreshInventoryState()]);
          renderCustomersList();
          if (AppState.currentView === 'dashboard') loadDashboard();
        } catch (forceErr) {
          UI.showToast(forceErr.message, 'error');
        }
      }
    } else {
      UI.showToast(err.message, 'error');
    }
  }
}

// ==================== MÓDULO DE FINANZAS Y MÉTRICAS ====================
async function loadMetrics(period = 'month') {
  AppState.metricsPeriod = period;
  ['today', 'week', 'month', 'all'].forEach(p => {
    const btn = document.getElementById(`metrics-tab-${p}`);
    if (btn) btn.classList.toggle('active', p === period);
  });

  try {
    const data = await API.getMetrics(period);
    document.getElementById('fin-revenue').textContent = UI.formatCurrency(data.summary.total_revenue);
    document.getElementById('fin-orders-count').textContent = `${data.summary.total_orders} pedidos`;
    document.getElementById('fin-costs').textContent = UI.formatCurrency(data.summary.total_cost);
    document.getElementById('fin-net-profit').textContent = UI.formatCurrency(data.summary.net_profit);
    document.getElementById('fin-margin').textContent = `Margen: ${data.summary.profit_margin_pct}%`;
    document.getElementById('fin-receivables').textContent = UI.formatCurrency(data.summary.global_receivables);

    // Top productos
    const topContainer = document.getElementById('metrics-top-products-list');
    if (data.top_products.length === 0) {
      topContainer.innerHTML = '<div style="color:var(--cream-500); font-size:13px;">Sin ventas registradas en el período.</div>';
    } else {
      topContainer.innerHTML = data.top_products.map((tp, idx) => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px dashed var(--cream-200); font-size:13px;">
          <div>
            <strong>#${idx + 1} ${tp.name}</strong>
            <div style="font-size:11px; color:var(--cream-500);">${tp.units_sold} unidades vendidas</div>
          </div>
          <div style="text-align:right;">
            <div style="font-weight:700; color:var(--primary-900);">${UI.formatCurrency(tp.total_revenue)}</div>
            <div style="font-size:11px; color:var(--success);">Ganancia: ${UI.formatCurrency(tp.profit)}</div>
          </div>
        </div>
      `).join('');
    }

    // Gráfico Chart.js
    renderSalesCostChart(data.daily_chart);
  } catch (err) {
    UI.showToast(err.message, 'error');
  }
}

function renderSalesCostChart(dailyData) {
  const ctx = document.getElementById('salesCostChart');
  if (!ctx) return;

  if (AppState.chartInstance) {
    AppState.chartInstance.destroy();
  }

  const labels = dailyData.map(d => UI.formatDate(d.date));
  const revenues = dailyData.map(d => d.revenue);
  const costs = dailyData.map(d => d.cost);

  AppState.chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Ventas (Ingresos)',
          data: revenues,
          backgroundColor: '#14b8a6',
          borderRadius: 6
        },
        {
          label: 'Costo Insumos',
          data: costs,
          backgroundColor: '#f87171',
          borderRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { boxWidth: 12, font: { family: 'Outfit', size: 12 } } }
      },
      scales: {
        y: { beginAtZero: true, grid: { color: '#f3ebe1' } },
        x: { grid: { display: false } }
      }
    }
  });
}

// ==================== MODALES Y CONSTRUCTORES ====================

// --- Modal de Nuevo Pedido ---
function openNewOrderModal(preselectedCustomerId = null) {
  const custSelect = document.getElementById('order-customer-select');
  custSelect.innerHTML = '<option value="">-- Seleccione Cliente --</option>' + 
    AppState.customers.map(c => `<option value="${c.id}">${c.name} (${c.phone || 'Sin tel'})`).join('');

  if (preselectedCustomerId) {
    custSelect.value = preselectedCustomerId;
  }

  // Fecha de entrega por defecto: Hoy
  document.getElementById('order-delivery-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('order-delivery-time').value = '15:00';
  document.getElementById('order-delivery-type').value = 'RETIRO';
  toggleOrderAddressField();

  // Limpiar constructor de items
  AppState.orderItemsBuilder = [];
  document.getElementById('order-items-builder').innerHTML = '';
  addOrderItemRow();

  document.getElementById('order-notes').value = '';
  document.getElementById('order-initial-pay-amount').value = '';
  document.getElementById('order-deduct-inventory').checked = true;

  UI.openModal('modal-order');
}

function openNewOrderWithCustomer(customerId) {
  openNewOrderModal(customerId);
}

function toggleOrderAddressField() {
  const type = document.getElementById('order-delivery-type').value;
  document.getElementById('order-address-group').style.display = type === 'DOMICILIO' ? 'block' : 'none';
}

function addOrderItemRow() {
  const container = document.getElementById('order-items-builder');
  const rowIndex = AppState.orderItemsBuilder.length;

  const row = document.createElement('div');
  row.className = 'order-item-row';
  row.id = `order-item-row-${rowIndex}`;
  row.style.cssText = 'display:grid; grid-template-columns: 1fr 80px 36px; gap:8px; align-items:center;';

  const productOptions = AppState.products.map(p => 
    `<option value="${p.id}" data-price="${p.sale_price}">${p.name} (${UI.formatCurrency(p.sale_price)})`
  ).join('');

  row.innerHTML = `
    <select class="form-control" style="min-height:40px; font-size:13px;" onchange="updateOrderBuilderTotal()">
      ${productOptions}
    </select>
    <input type="number" class="form-control" style="min-height:40px; font-size:13px;" value="1" min="1" step="1" oninput="updateOrderBuilderTotal()">
    <button type="button" class="btn btn-danger btn-sm" style="min-height:40px; width:36px; padding:0;" onclick="removeOrderItemRow(${rowIndex})">&times;</button>
  `;

  container.appendChild(row);
  AppState.orderItemsBuilder.push(row);
  updateOrderBuilderTotal();
}

function removeOrderItemRow(index) {
  const row = document.getElementById(`order-item-row-${index}`);
  if (row) row.remove();
  updateOrderBuilderTotal();
}

function updateOrderBuilderTotal() {
  let total = 0;
  const rows = document.querySelectorAll('#order-items-builder .order-item-row');
  rows.forEach(r => {
    const sel = r.querySelector('select');
    const input = r.querySelector('input');
    const selectedOpt = sel.options[sel.selectedIndex];
    if (selectedOpt) {
      const price = parseFloat(selectedOpt.dataset.price) || 0;
      const qty = parseFloat(input.value) || 1;
      total += (price * qty);
    }
  });

  document.getElementById('order-builder-total').textContent = UI.formatCurrency(total);
}

async function submitNewOrder(e) {
  e.preventDefault();
  const customerId = document.getElementById('order-customer-select').value;
  const deliveryDate = document.getElementById('order-delivery-date').value;
  const deliveryTime = document.getElementById('order-delivery-time').value;
  const deliveryType = document.getElementById('order-delivery-type').value;
  const deliveryAddress = document.getElementById('order-delivery-address').value;
  const notes = document.getElementById('order-notes').value;
  const initialPayAmount = parseFloat(document.getElementById('order-initial-pay-amount').value) || 0;
  const initialPayMethod = document.getElementById('order-initial-pay-method').value;
  const deductNow = document.getElementById('order-deduct-inventory').checked;

  const items = [];
  const rows = document.querySelectorAll('#order-items-builder .order-item-row');
  rows.forEach(r => {
    const sel = r.querySelector('select');
    const input = r.querySelector('input');
    const prodId = parseInt(sel.value);
    const qty = parseFloat(input.value) || 1;
    if (prodId && qty > 0) {
      items.push({ product_id: prodId, quantity: qty });
    }
  });

  if (items.length === 0) {
    UI.showToast('Debe agregar al menos un producto al pedido', 'error');
    return;
  }

  const payload = {
    customer_id: customerId,
    delivery_date: deliveryDate,
    delivery_time: deliveryTime,
    delivery_type: deliveryType,
    delivery_address: deliveryAddress,
    notes: notes,
    items: items,
    initial_payment: initialPayAmount > 0 ? {
      amount: initialPayAmount,
      payment_method: initialPayMethod,
      reference: 'Anticipo al crear pedido'
    } : null,
    deduct_inventory_now: deductNow
  };

  try {
    const created = await API.createOrder(payload);
    UI.showToast(`¡Pedido #${created.order_number} registrado con éxito!`, 'success');
    UI.closeModal('modal-order');

    await Promise.all([refreshInventoryState(), refreshCustomersState()]);
    if (AppState.currentView === 'dashboard') loadDashboard();
    else if (AppState.currentView === 'orders') loadOrders();
  } catch (err) {
    UI.showToast(err.message, 'error');
  }
}

// --- Modal de Pagos / Abonos ---
function openPaymentModal(orderId) {
  const order = AppState.orders.find(o => o.id === orderId);
  if (!order) return;

  document.getElementById('pay-order-id').value = order.id;
  document.getElementById('pay-order-info').textContent = `Pedido: #${order.order_number} - ${order.customer_name}`;
  document.getElementById('pay-order-pending-balance').textContent = UI.formatCurrency(order.pending_balance);
  document.getElementById('pay-amount-input').value = order.pending_balance;
  document.getElementById('pay-reference-input').value = '';

  UI.openModal('modal-payment');
}

async function submitPayment(e) {
  e.preventDefault();
  const orderId = document.getElementById('pay-order-id').value;
  const amount = parseFloat(document.getElementById('pay-amount-input').value);
  const method = document.getElementById('pay-method-select').value;
  const reference = document.getElementById('pay-reference-input').value;

  try {
    const res = await API.addPayment({
      order_id: orderId,
      amount: amount,
      payment_method: method,
      reference: reference,
      notes: 'Abono registrado desde el portal'
    });

    UI.showToast(res.message, 'success');
    UI.closeModal('modal-payment');
    await refreshCustomersState();

    if (AppState.currentView === 'dashboard') loadDashboard();
    else if (AppState.currentView === 'orders') loadOrders();
  } catch (err) {
    UI.showToast(err.message, 'error');
  }
}

// --- Modal de Ajuste de Stock ---
function openStockAdjustmentModal(ingredientId = null) {
  const select = document.getElementById('adj-ingredient-select');
  select.innerHTML = AppState.ingredients.map(i => 
    `<option value="${i.id}" data-cost="${i.cost_per_unit}" data-stock="${i.current_stock}" data-unit="${i.unit}">${i.name} (Stock: ${i.current_stock} ${i.unit})`
  ).join('');

  if (ingredientId) {
    select.value = ingredientId;
  }

  onAdjustIngredientChange();
  document.getElementById('adj-quantity-input').value = '';
  document.getElementById('adj-ref-input').value = '';
  UI.openModal('modal-adjust-stock');
}

function onAdjustIngredientChange() {
  const select = document.getElementById('adj-ingredient-select');
  const opt = select.options[select.selectedIndex];
  if (opt) {
    document.getElementById('adj-cost-input').value = opt.dataset.cost || '';
  }
}

async function submitStockAdjustment(e) {
  e.preventDefault();
  const ingredientId = document.getElementById('adj-ingredient-select').value;
  const type = document.getElementById('adj-type-select').value;
  const quantity = parseFloat(document.getElementById('adj-quantity-input').value);
  const cost = document.getElementById('adj-cost-input').value;
  const ref = document.getElementById('adj-ref-input').value;

  try {
    const res = await API.adjustStock(ingredientId, {
      type: type,
      quantity: quantity,
      unit_cost: cost ? parseFloat(cost) : undefined,
      reference: ref
    });

    UI.showToast(res.message, 'success');
    UI.closeModal('modal-adjust-stock');
    await refreshInventoryState();

    if (AppState.currentView === 'inventory') renderInventoryList();
    else if (AppState.currentView === 'dashboard') loadDashboard();
  } catch (err) {
    UI.showToast(err.message, 'error');
  }
}

// --- Modal de Nuevo Insumo ---
function openNewIngredientModal() {
  document.getElementById('form-new-ingredient').reset();
  UI.openModal('modal-new-ingredient');
}

async function submitNewIngredient(e) {
  e.preventDefault();
  const name = document.getElementById('ing-name-input').value;
  const category = document.getElementById('ing-category-select').value;
  const unit = document.getElementById('ing-unit-select').value;
  const cost = parseFloat(document.getElementById('ing-cost-input').value) || 0;
  const stock = parseFloat(document.getElementById('ing-stock-input').value) || 0;
  const min = parseFloat(document.getElementById('ing-min-input').value) || 0;

  try {
    await API.createIngredient({
      name, category, unit, cost_per_unit: cost, current_stock: stock, min_stock: min
    });

    UI.showToast('Insumo registrado con éxito', 'success');
    UI.closeModal('modal-new-ingredient');
    await refreshInventoryState();
    renderInventoryList();
  } catch (err) {
    UI.showToast(err.message, 'error');
  }
}

// --- Modal de Nuevo Producto & Receta ---
function openNewProductModal() {
  document.getElementById('form-new-product').reset();
  AppState.recipeItemsBuilder = [];
  document.getElementById('recipe-items-builder').innerHTML = '';
  addRecipeItemRow();
  UI.openModal('modal-new-product');
}

function addRecipeItemRow() {
  const container = document.getElementById('recipe-items-builder');
  const index = AppState.recipeItemsBuilder.length;

  const row = document.createElement('div');
  row.className = 'recipe-item-row';
  row.id = `recipe-row-${index}`;
  row.style.cssText = 'display:grid; grid-template-columns: 1fr 90px 36px; gap:8px; align-items:center;';

  const options = AppState.ingredients.map(i => 
    `<option value="${i.id}">${i.name} (${i.unit})`
  ).join('');

  row.innerHTML = `
    <select class="form-control" style="min-height:40px; font-size:13px;">${options}</select>
    <input type="number" class="form-control" style="min-height:40px; font-size:13px;" placeholder="Cant." step="any" value="0.1">
    <button type="button" class="btn btn-danger btn-sm" style="min-height:40px; width:36px; padding:0;" onclick="document.getElementById('recipe-row-${index}').remove()">&times;</button>
  `;

  container.appendChild(row);
  AppState.recipeItemsBuilder.push(row);
}

async function submitNewProduct(e) {
  e.preventDefault();
  const name = document.getElementById('prod-name-input').value;
  const category = document.getElementById('prod-category-select').value;
  const price = parseFloat(document.getElementById('prod-price-input').value) || 0;
  const yieldQty = parseFloat(document.getElementById('prod-yield-qty-input').value) || 1;
  const yieldUnit = document.getElementById('prod-yield-unit-input').value || 'unidad';
  const desc = document.getElementById('prod-desc-input').value;

  const recipe = [];
  const rows = document.querySelectorAll('#recipe-items-builder .recipe-item-row');
  rows.forEach(r => {
    const sel = r.querySelector('select');
    const input = r.querySelector('input');
    const ingId = parseInt(sel.value);
    const qty = parseFloat(input.value) || 0;
    if (ingId && qty > 0) {
      recipe.push({ ingredient_id: ingId, quantity: qty });
    }
  });

  try {
    await API.createProduct({
      name, category, sale_price: price, yield_quantity: yieldQty, yield_unit: yieldUnit, description: desc, recipe
    });

    UI.showToast('Producto y receta guardados con éxito', 'success');
    UI.closeModal('modal-new-product');
    await refreshProductsState();
    loadProductionView();
  } catch (err) {
    UI.showToast(err.message, 'error');
  }
}

// --- Modal de Nuevo Cliente ---
function openNewCustomerModal(selectForOrder = false) {
  document.getElementById('form-new-customer').reset();
  document.getElementById('form-new-customer').dataset.selectForOrder = selectForOrder ? 'true' : 'false';
  UI.openModal('modal-new-customer');
}

async function submitNewCustomer(e) {
  e.preventDefault();
  const name = document.getElementById('cust-name-input').value;
  const phone = document.getElementById('cust-phone-input').value;
  const email = document.getElementById('cust-email-input').value;
  const address = document.getElementById('cust-address-input').value;
  const notes = document.getElementById('cust-notes-input').value;
  const selectForOrder = document.getElementById('form-new-customer').dataset.selectForOrder === 'true';

  try {
    const created = await API.createCustomer({ name, phone, email, address, notes });
    UI.showToast('Cliente registrado con éxito', 'success');
    UI.closeModal('modal-new-customer');
    await refreshCustomersState();

    if (selectForOrder) {
      const custSelect = document.getElementById('order-customer-select');
      custSelect.innerHTML += `<option value="${created.id}" selected>${created.name} (${created.phone || 'Sin tel'})`;
      custSelect.value = created.id;
    }

    if (AppState.currentView === 'customers') renderCustomersList();
  } catch (err) {
    UI.showToast(err.message, 'error');
  }
}

// --- Modal de Recibo / Ticket ---
async function openTicketModal(orderId) {
  try {
    const order = await API.getOrder(orderId);
    AppState.activeTicketOrder = order;

    const itemsHtml = order.items.map(it => `
      <div class="receipt-row">
        <span>${it.quantity}x ${it.product_name}</span>
        <span>${UI.formatCurrency(it.subtotal)}</span>
      </div>
    `).join('');

    const paymentsHtml = order.payments.map(p => `
      <div class="receipt-row" style="font-size:11px; color:#475569;">
        <span>Abono (${p.payment_method})</span>
        <span>-${UI.formatCurrency(p.amount)}</span>
      </div>
    `).join('');

    document.getElementById('ticket-content').innerHTML = `
      <div class="receipt-header">
        <h3>🥖 DULCE MENTA</h3>
        <p>Panadería & Repostería Artesanal</p>
        <p>Tel: +506 8888-1234</p>
        <p><strong>Pedido: #${order.order_number}</strong></p>
      </div>
      <div class="receipt-row"><strong>Cliente:</strong> <span>${order.customer_name}</span></div>
      <div class="receipt-row"><strong>Entrega:</strong> <span>${UI.formatDate(order.delivery_date)} ${order.delivery_time || ''}</span></div>
      <div class="receipt-row"><strong>Tipo:</strong> <span>${order.delivery_type === 'DOMICILIO' ? 'Envío Domicilio' : 'Retiro en Tienda'}</span></div>
      ${order.delivery_address ? `<div class="receipt-row"><strong>Dirección:</strong> <span>${order.delivery_address}</span></div>` : ''}
      <hr style="border:none; border-top:1px dashed #cbd5e1; margin:8px 0;">
      ${itemsHtml}
      <div class="receipt-total receipt-row">
        <span>TOTAL:</span>
        <span>${UI.formatCurrency(order.total_amount)}</span>
      </div>
      ${paymentsHtml}
      <div class="receipt-row" style="font-weight:700; color:${order.pending_balance > 0 ? '#b91c1c' : '#059669'}; margin-top:4px;">
        <span>SALDO PENDIENTE:</span>
        <span>${UI.formatCurrency(order.pending_balance)}</span>
      </div>
      ${order.notes ? `<p style="margin-top:8px; font-size:11px; font-style:italic;">Nota: ${order.notes}</p>` : ''}
      <p style="text-align:center; margin-top:12px; font-size:11px;">¡Gracias por endulzar tu día con nosotros! ✨</p>
    `;

    UI.openModal('modal-ticket');
  } catch (err) {
    UI.showToast(err.message, 'error');
  }
}

function shareTicketWhatsApp() {
  const order = AppState.activeTicketOrder;
  if (!order || !order.customer_phone) {
    UI.showToast('El cliente no tiene un teléfono registrado para WhatsApp', 'info');
    return;
  }

  const cleanPhone = order.customer_phone.replace(/[^0-9]/g, '');
  const itemsText = order.items.map(it => `- ${it.quantity}x ${it.product_name} (${UI.formatCurrency(it.subtotal)})`).join('%0A');

  const text = `Hola ${order.customer_name}, te enviamos el comprobante de tu pedido en *Dulce Menta* 🥖%0A%0A*Pedido:* #${order.order_number}%0A*Fecha de Entrega:* ${UI.formatDate(order.delivery_date)} ${order.delivery_time || ''}%0A%0A*Detalle:*%0A${itemsText}%0A%0A*Total:* ${UI.formatCurrency(order.total_amount)}%0A*Abonado:* ${UI.formatCurrency(order.total_paid)}%0A*Saldo Pendiente:* ${UI.formatCurrency(order.pending_balance)}%0A%0A¡Muchas gracias por tu preferencia!`;

  window.open(`https://wa.me/${cleanPhone}?text=${text}`, '_blank');
}
