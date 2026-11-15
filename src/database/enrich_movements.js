const { query, run, get, transaction } = require('./db');

function enrichHistoricalMovements() {
  const existingMovs = query("SELECT count(*) as count FROM inventory_movements WHERE type LIKE 'SALIDA%'");
  if (existingMovs[0].count > 0) {
    console.log(`Ya existen ${existingMovs[0].count} movimientos de salida registrados.`);
    return;
  }

  console.log('Generando movimientos de inventario para pedidos y producciones históricas...');
  transaction(() => {
    // 1. Descontar pedidos marcados como inventory_deducted = 1
    const orders = query('SELECT * FROM orders WHERE inventory_deducted = 1');
    for (const o of orders) {
      const items = query('SELECT * FROM order_items WHERE order_id = ?', [o.id]);
      for (const item of items) {
        const product = get('SELECT * FROM products WHERE id = ?', [item.product_id]);
        if (!product) continue;
        const recipeItems = query('SELECT * FROM recipes WHERE product_id = ?', [item.product_id]);
        const yieldQty = product.yield_quantity > 0 ? product.yield_quantity : 1;
        const scaleFactor = item.quantity / yieldQty;
        for (const r of recipeItems) {
          const required = Math.round((r.quantity * scaleFactor) * 1000) / 1000;
          const ing = get('SELECT * FROM ingredients WHERE id = ?', [r.ingredient_id]);
          const unitCost = ing ? ing.cost_per_unit : 0;
          const movDate = o.delivery_date + ' ' + (o.delivery_time ? o.delivery_time + ':00' : '12:00:00');
          run(`
            INSERT INTO inventory_movements (ingredient_id, type, quantity, unit_cost, reference, notes, created_at)
            VALUES (?, 'SALIDA_PEDIDO', ?, ?, ?, ?, ?)
          `, [
            r.ingredient_id,
            required,
            unitCost,
            `Pedido ${o.order_number}`,
            `Insumos descontados para ${item.quantity} ${product.name}`,
            movDate
          ]);
        }
      }
    }

    // 2. Movimientos para producciones registradas
    const prods = query('SELECT * FROM productions');
    for (const pr of prods) {
      const product = get('SELECT * FROM products WHERE id = ?', [pr.product_id]);
      if (!product) continue;
      const recipeItems = query('SELECT * FROM recipes WHERE product_id = ?', [pr.product_id]);
      const yieldQty = product.yield_quantity > 0 ? product.yield_quantity : 1;
      const scaleFactor = pr.quantity / yieldQty;
      for (const r of recipeItems) {
        const required = Math.round((r.quantity * scaleFactor) * 1000) / 1000;
        const ing = get('SELECT * FROM ingredients WHERE id = ?', [r.ingredient_id]);
        const unitCost = ing ? ing.cost_per_unit : 0;
        run(`
          INSERT INTO inventory_movements (ingredient_id, type, quantity, unit_cost, reference, notes, created_at)
          VALUES (?, 'SALIDA_PRODUCCION', ?, ?, ?, ?, ?)
        `, [
          r.ingredient_id,
          required,
          unitCost,
          `Producción: ${pr.quantity} ${product.name}`,
          pr.notes || 'Consumo de insumos por lote de producción',
          pr.production_date
        ]);
      }
    }
  });

  const countAfter = query("SELECT count(*) as count FROM inventory_movements WHERE type LIKE 'SALIDA%'");
  console.log(`✅ Movimientos de salida generados exitosamente: ${countAfter[0].count} registros.`);
}

if (require.main === module) {
  enrichHistoricalMovements();
}

module.exports = { enrichHistoricalMovements };
