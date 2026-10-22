# 🥖 Dulce Menta — Sistema Integral para Panadería & Repostería Artesanal

Sistema de gestión comercial, operativo y financiero con arquitectura **Mobile-First**, diseñado específicamente para panaderías y reposterías artesanales. Permite la toma rápida de pedidos desde celulares o tablets en mostrador, proyección de costos de recetas con cálculo automático de insumos requeridos, control de inventario de materias primas con alertas de stock crítico, cuentas por cobrar con historial de abonos y métricas financieras en tiempo real.

---

## 🎨 Paleta de Colores e Identidad Visual
* **Colores Principales:** Matices de color menta y verdes turquesas pastel (`#2DD4BF`, `#14B8A6`, `#0F766E`, `#E6FFFA`, `#CCFBF1`).
* **Tonos Complementarios:** Tonos neutros cálidos y crema suaves (`#FFFDF9`, `#FAF5EF`, `#F4ECDF`, `#8C7562`) ideales para obradores y panaderías.
* **Diseño UI/UX:** Mobile-First con barra de navegación inferior (*Bottom Navigation*), botones táctiles grandes (>46px de altura), tarjetas limpias, modales tipo lámina deslizante (*Bottom Sheet*) y gráficos interactivos con Chart.js.

---

## 🚀 Arquitectura y Tecnologías
* **Backend:** Node.js con servidor Express (API RESTful).
* **Base de Datos:** SQLite unificado (`data/bakery.db`), ligero, portable y sin necesidad de servicios externos.
* **Frontend:** Single Page Application (SPA) con HTML5 semántico, Custom CSS con Variables y Vanilla JavaScript (ES6+).
* **Compatibilidad Multiplataforma:** Ejecución nativa en Windows y accesible en la red local para smartphones y tablets (iOS / Android).

---

## 📂 Estructura Modular del Proyecto

```
C:\my bakery\
├── .env                         # Variables de entorno locales
├── .env.example                 # Plantilla de variables de entorno
├── .gitignore                   # Exclusiones de Git (node_modules, *.db, etc.)
├── package.json                 # Dependencias y scripts de ejecución
├── INICIAR_PANADERIA.bat        # Lanzador rápido con un solo clic para Windows
├── README.md                    # Manual y documentación técnica
│
├── data/
│   └── bakery.db                # Base de datos SQLite local
│
├── src/
│   ├── app.js                   # Configuración de Express, middlewares y rutas
│   ├── server.js                # Servidor HTTP y detección de IPs de red local
│   ├── database/
│   │   ├── db.js                # Conector a SQLite con soporte transaccional
│   │   ├── schema.sql           # Definición de tablas, relaciones e índices
│   │   └── seed.js              # Datos iniciales realistas para demostración
│   └── routes/
│       ├── inventory.js         # API de Insumos, alertas y movimientos
│       ├── products.js          # API de Catálogo, recetas y costos unitarios
│       ├── production.js        # API de Proyección escalable y ejecuciones
│       ├── orders.js            # API de Pedidos, agenda y control de estados
│       ├── customers.js         # API de Clientes y cuentas por cobrar
│       ├── payments.js          # API de Registro y trazabilidad de abonos
│       ├── metrics.js           # API de Informes financieros y KPIs
│       └── settings.js          # API de Ajustes de la panadería
│
└── public/
    ├── index.html               # SPA principal Mobile-First
    ├── css/
    │   └── styles.css           # Sistema de diseño turquesa/menta y responsive
    └── js/
        ├── api.js               # Cliente HTTP hacia la API REST
        ├── ui.js                # Formateo, badges, modales y toasts
        └── app.js               # Lógica interactiva de todos los módulos
```

---

## 🛠️ Instrucciones de Ejecución Local en Windows

### Opción 1: Con el Lanzador Automático (Recomendado)
Haz doble clic sobre el archivo **`INICIAR_PANADERIA.bat`** ubicado en `C:\my bakery`. El script verificará las dependencias, arrancará el servidor y abrirá tu navegador predeterminado en:
`http://localhost:4000`

### Opción 2: Desde la Terminal (PowerShell o CMD)
1. Abre tu terminal y navega al directorio del proyecto:
   ```powershell
   cd "C:\my bakery"
   ```
2. Instala las dependencias (solo la primera vez):
   ```powershell
   npm.cmd install
   ```
3. Inicia la aplicación:
   ```powershell
   npm.cmd start
   ```
4. O en modo desarrollo con recarga automática:
   ```powershell
   npm.cmd run dev
   ```

---

## 📱 Acceso desde Celulares y Tablets en la Misma Red Wi-Fi
Al iniciar el servidor, la consola mostrará automáticamente la dirección IP local de tu computadora en la red.
Por ejemplo:
```
=========================================================
🥐 DULCE MENTA — SISTEMA DE GESTIÓN PARA REPOSTERÍA & PAN
=========================================================
💻 Acceso Local (esta PC):   http://localhost:4000
📱 Acceso Móvil (Celulares):  http://192.168.1.50:4000
✨ Servidor listo y escuchando peticiones.
=========================================================
```
Simplemente abre el navegador de tu celular (Safari, Chrome) e ingresa la dirección `http://192.168.1.50:4000`.

> **Nota para Windows Defender Firewall:** Si tu celular no conecta, asegúrate de permitir conexiones entrantes en el puerto `4000` o aceptar el diálogo de Windows Defender que aparece al ejecutar Node.js por primera vez.

---

## 🌐 Instrucciones para Subir y Desplegar a GitHub

El proyecto ya cuenta con un archivo `.gitignore` optimizado que excluye `node_modules/`, `data/*.db` y archivos de entorno.

1. Abre la terminal en `C:\my bakery`:
   ```powershell
   cd "C:\my bakery"
   ```
2. Inicializa el repositorio Git:
   ```powershell
   git init
   git branch -M main
   ```
3. Agrega todos los archivos limpios:
   ```powershell
   git add .
   git commit -m "feat: release inicial del sistema Dulce Menta Bakery"
   ```
4. Crea un nuevo repositorio en tu cuenta de [GitHub](https://github.com/new) (por ejemplo: `my-bakery`).
5. Vincula el remoto y sube tu código:
   ```powershell
   git remote add origin https://github.com/TU_USUARIO/my-bakery.git
   git push -u origin main
   ```

---

## 📋 Módulos y Funcionalidades Incluidas

### 1. Gestión de Productos y Recetas (Escalabilidad de Insumos)
* **Catálogo de Productos Finales:** Queques, panes de masa madre, galletas, tartas y repostería fina.
* **Recetas Exactas:** Asociación de insumos por producto con cálculo automático del costo real de materia prima y margen de ganancia porcentual.
* **Simulador / Proyector de Producción:** Permite seleccionar cualquier producto e indicar una cantidad a preparar (ej: 25 unidades). Multiplica las cantidades base por el factor de escala, comprueba el stock actual, marca faltantes en rojo y estima la inversión total vs. venta prevista.
* **Descuento de Inventario:** Botón con un solo toque para descontar de inmediato los insumos utilizados de la base de datos de almacén.

### 2. Control de Inventarios de Materias Primas
* Registro de insumos categorizados (Harinas, Lácteos, Grasas, Azúcares, Frutas/Especias, Empaques) con su respectiva unidad (`g`, `kg`, `ml`, `L`, `unidad`).
* **Alertas de Stock Bajo:** Insignias de advertencia y banner principal cuando un ingrediente está por debajo de su stock mínimo de seguridad.
* Registro de entradas (compras de almacén con actualización opcional de costo) y mermas.

### 3. Directorio de Clientes & Cuentas por Cobrar
* Base de datos de clientes con nombre, dirección de entrega, notas de alergias y preferencias.
* **Enlace Directo a WhatsApp:** Abre el chat oficial con el cliente con un solo clic.
* **Cuentas por Cobrar:** Visualización inmediata del saldo pendiente de cada cliente y desglose de abonos registrados con fecha, método (SINPE Móvil, efectivo, tarjeta) y comprobante.

### 4. Toma y Gestión de Pedidos & Agenda
* Creación rápida de pedidos vinculando cliente, productos, fecha, hora de entrega y método (Retiro o Domicilio).
* **Flujo Operativo:** Estados táctiles (*Pendiente* ➔ *En Preparación* ➔ *Listo para Entregar* ➔ *Entregado*).
* **Agenda / Calendario:** Filtros de entrega para *Hoy*, *Mañana*, *Esta Semana* y *Todos*.
* **Ticket Digital:** Generador de comprobante con opción de impresión o envío directo por WhatsApp con el detalle del pedido y saldo pendiente.

### 5. Métricas y Finanzas
* Tarjetas KPI de Ingresos Totales, Costos de Inversión en Insumos, Ganancia Neta Real y Cuentas por Cobrar.
* Filtros por períodos (*Hoy*, *7 Días*, *Este Mes*, *Histórico*).
* Gráfico de barras interactivo con Chart.js comparando Ventas vs. Costos por día.
* Ranking de productos más vendidos y más rentables.

---

## 🗑️ Gestión y Eliminación Segura de Registros

El sistema cuenta con botones directos y endpoints seguros de eliminación con salvaguardas y confirmaciones automáticas:

1. **Eliminar Pedidos:**
   - Botón rojo de papelera (`🗑️`) en cada tarjeta de pedido.
   - **Restauración Automática de Stock:** Si los insumos del pedido ya habían sido descontados del inventario, al eliminar el pedido el sistema devuelve automáticamente las cantidades exactas de materias primas a su stock actual.
   - Limpia de forma segura los abonos y pagos registrados para ese pedido.

2. **Eliminar Insumos del Inventario:**
   - Botón de papelera (`🗑️`) en la tarjeta del insumo.
   - **Salvaguarda de Recetas:** Si el insumo está siendo utilizado en recetas activas, el sistema advierte al usuario y solicita confirmación para desvincularlo de las recetas antes de eliminarlo.

3. **Eliminar Productos y Recetas:**
   - Botón **"Vaciar Receta"** (`🥣`): Permite eliminar/desvincular todos los ingredientes de la receta del producto sin borrar el producto del catálogo.
   - Botón **"Eliminar Producto"** (`🗑️`): Elimina el producto y su receta base. Si posee pedidos históricos, solicita confirmación para eliminación definitiva.

4. **Eliminar Clientes:**
   - Botón de papelera (`🗑️`) en cada cliente del directorio.
   - Si el cliente posee pedidos en curso o históricos, el sistema solicita confirmación para forzar la eliminación en cascada junto con sus pedidos y pagos asociados.
