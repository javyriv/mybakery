// Cliente API REST para Dulce Menta Bakery System
const API = {
  baseUrl: '/api',

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    try {
      const response = await fetch(url, { ...options, headers });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const error = new Error(data.error || `Error ${response.status}: ${response.statusText}`);
        error.data = data;
        error.status = response.status;
        throw error;
      }
      return data;
    } catch (err) {
      console.error(`Error en API (${endpoint}):`, err);
      throw err;
    }
  },

  // Insumos e Inventario
  getInventory: () => API.request('/inventory'),
  getInventoryAlerts: () => API.request('/inventory/alerts'),
  createIngredient: (data) => API.request('/inventory', { method: 'POST', body: JSON.stringify(data) }),
  updateIngredient: (id, data) => API.request(`/inventory/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  adjustStock: (id, data) => API.request(`/inventory/${id}/adjust`, { method: 'POST', body: JSON.stringify(data) }),
  deleteIngredient: (id, force = false) => API.request(`/inventory/${id}${force ? '?force=true' : ''}`, { method: 'DELETE' }),

  // Productos y Recetas
  getProducts: () => API.request('/products'),
  getProduct: (id) => API.request(`/products/${id}`),
  createProduct: (data) => API.request('/products', { method: 'POST', body: JSON.stringify(data) }),
  updateProduct: (id, data) => API.request(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  saveRecipe: (id, items) => API.request(`/products/${id}/recipe`, { method: 'POST', body: JSON.stringify({ items }) }),
  deleteRecipe: (id) => API.request(`/products/${id}/recipe`, { method: 'DELETE' }),
  deleteProduct: (id, force = false) => API.request(`/products/${id}${force ? '?force=true' : ''}`, { method: 'DELETE' }),

  // Proyección de Producción y Costos
  projectProduction: (productId, quantity) => API.request('/production/project', {
    method: 'POST',
    body: JSON.stringify({ product_id: productId, quantity })
  }),
  executeProduction: (productId, quantity, notes, allowNegative = false) => API.request('/production/execute', {
    method: 'POST',
    body: JSON.stringify({ product_id: productId, quantity, notes, allow_negative_stock: allowNegative })
  }),

  // Clientes
  getCustomers: () => API.request('/customers'),
  getCustomer: (id) => API.request(`/customers/${id}`),
  createCustomer: (data) => API.request('/customers', { method: 'POST', body: JSON.stringify(data) }),
  updateCustomer: (id, data) => API.request(`/customers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCustomer: (id, force = false) => API.request(`/customers/${id}${force ? '?force=true' : ''}`, { method: 'DELETE' }),

  // Pedidos
  getOrders: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return API.request(`/orders${qs ? '?' + qs : ''}`);
  },
  getOrder: (id) => API.request(`/orders/${id}`),
  createOrder: (data) => API.request('/orders', { method: 'POST', body: JSON.stringify(data) }),
  updateOrder: (id, data) => API.request(`/orders/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateOrderStatus: (id, status) => API.request(`/orders/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status })
  }),
  deleteOrder: (id) => API.request(`/orders/${id}`, { method: 'DELETE' }),

  // Pagos y Abonos
  addPayment: (data) => API.request('/payments', { method: 'POST', body: JSON.stringify(data) }),

  // Autenticación & Usuarios
  login: (data) => API.request('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  getUsers: () => API.request('/users'),
  getUser: (id) => API.request(`/users/${id}`),
  createUser: (data) => API.request('/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id, data) => API.request(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteUser: (id) => API.request(`/users/${id}`, { method: 'DELETE' }),

  // Finanzas y Métricas
  getMetrics: (period = 'month') => API.request(`/metrics?period=${period}`),
  getSettings: () => API.request('/settings'),
  saveSettings: (data) => API.request('/settings', { method: 'POST', body: JSON.stringify(data) })
};
