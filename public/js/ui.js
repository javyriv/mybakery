// Utilidades de Interfaz de Usuario y Formateo
const UI = {
  currencySymbol: '₡',

  formatCurrency(amount) {
    const num = parseFloat(amount) || 0;
    return `${this.currencySymbol}${num.toLocaleString('es-CR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  },

  formatDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    const d = new Date(dateStr);
    return isNaN(d) ? dateStr : d.toLocaleDateString('es-CR');
  },

  showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = 'ti-info-circle';
    if (type === 'success') icon = 'ti-circle-check';
    if (type === 'error') icon = 'ti-alert-circle';

    toast.innerHTML = `<i class="ti ${icon}" style="font-size: 20px;"></i> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
  },

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('open');
      document.body.style.overflow = '';
    }
  },

  getStatusBadge(status) {
    switch (status) {
      case 'PENDIENTE':
        return '<span class="badge badge-warning"><i class="ti ti-clock"></i> Pendiente</span>';
      case 'EN_PREPARACION':
        return '<span class="badge badge-mint"><i class="ti ti-flame"></i> En Preparación</span>';
      case 'LISTO':
        return '<span class="badge badge-info"><i class="ti ti-package"></i> Listo p/ Entregar</span>';
      case 'ENTREGADO':
        return '<span class="badge badge-success"><i class="ti ti-check"></i> Entregado</span>';
      case 'CANCELADO':
        return '<span class="badge badge-danger"><i class="ti ti-x"></i> Cancelado</span>';
      default:
        return `<span class="badge badge-neutral">${status}</span>`;
    }
  },

  getPaymentBadge(paymentStatus) {
    switch (paymentStatus) {
      case 'PAGADO':
        return '<span class="badge badge-success">Pagado 100%</span>';
      case 'ABONO_PARCIAL':
        return '<span class="badge badge-warning">Abono Parcial</span>';
      case 'PENDIENTE':
        return '<span class="badge badge-danger">Pendiente</span>';
      default:
        return `<span class="badge badge-neutral">${paymentStatus}</span>`;
    }
  },

  getUserRoleBadge(role) {
    switch (role) {
      case 'ADMIN':
        return '<span class="badge badge-mint"><i class="ti ti-crown"></i> Administrador</span>';
      case 'PASTELERO':
        return '<span class="badge badge-warning"><i class="ti ti-tools-kitchen-2"></i> Pastelero / Panadero</span>';
      case 'VENTAS':
        return '<span class="badge badge-info"><i class="ti ti-tag"></i> Ventas & Caja</span>';
      default:
        return `<span class="badge badge-neutral">${role}</span>`;
    }
  }
};

// Exportar globalmente para eventos onclick en HTML
window.openModal = function(modalId) { UI.openModal(modalId); };
window.closeModal = function(modalId) { UI.closeModal(modalId); };

// NOTA: Se deshabilita el cierre al hacer click fuera del sheet para evitar
// pérdida accidental de datos al seleccionar texto o hacer click fuera.
// Las ventanas ahora solo se cierran explícitamente mediante Aceptar, Cancelar o Cerrar (×).
