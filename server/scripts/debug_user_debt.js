/*
  Usage: node server/scripts/debug_user_debt.js "Dugi"
  Prints:
  - matching users
  - recent orders with status/original_status
  - pending debt base split by EUR/MKD
  - manual adjustments split by currency
*/
const { query, pool } = require('../database/connection');

async function main() {
  try {
    const name = process.argv[2] || 'Dugi';
    console.log(`🔎 Looking up users by name: ${name}`);

    const usersRes = await query('SELECT id, name, role FROM users WHERE name ILIKE $1', [name]);
    if (usersRes.rows.length === 0) {
      console.log('No users found.');
      return;
    }

    for (const user of usersRes.rows) {
      console.log(`\n👤 User: id=${user.id}, name=${user.name}, role=${user.role}`);

      const ordersRes = await query(
        `SELECT id, status, original_status, total_amount, created_at
         FROM orders
         WHERE client_id = $1
         ORDER BY id DESC
         LIMIT 20`,
        [user.id]
      );
      console.log(`Orders (latest 20):`);
      for (const o of ordersRes.rows) {
        console.log(` - id=${o.id}, status=${o.status}, original_status=${o.original_status}, total=${o.total_amount}`);
      }

      const debtBaseRes = await query(
        `SELECT 
           COALESCE(SUM(CASE WHEN p.category = 'smartphones' THEN oi.quantity * oi.price ELSE 0 END), 0) as eur_debt_base,
           COALESCE(SUM(CASE WHEN p.category != 'smartphones' THEN oi.quantity * oi.price ELSE 0 END), 0) as mkd_debt_base
         FROM orders o
         JOIN order_items oi ON o.id = oi.order_id
         JOIN products p ON oi.product_id = p.id
         WHERE o.client_id = $1 AND o.original_status = 'pending' AND o.status != 'completed'`,
        [user.id]
      );
      const eurBase = parseFloat(debtBaseRes.rows[0]?.eur_debt_base || 0);
      const mkdBase = parseFloat(debtBaseRes.rows[0]?.mkd_debt_base || 0);
      console.log(`Debt base -> EUR: ${eurBase}, MKD: ${mkdBase}`);

      const adjRes = await query(
        `SELECT currency, COALESCE(SUM(adjustment_amount),0) AS sum
         FROM user_debt_adjustments
         WHERE user_id = $1 AND adjustment_type = 'manual_reduction'
         GROUP BY currency`,
        [user.id]
      );
      const eurAdj = adjRes.rows.find(r => r.currency === 'EUR')?.sum || 0;
      const mkdAdj = adjRes.rows.find(r => r.currency === 'MKD')?.sum || 0;
      console.log(`Adjustments -> EUR: ${eurAdj}, MKD: ${mkdAdj}`);

      const clamp = n => (n < 0 ? 0 : n);
      const eurDebt = clamp(eurBase - eurAdj);
      const mkdDebt = clamp(mkdBase - mkdAdj);
      console.log(`Computed Debt -> EUR: ${eurDebt}, MKD: ${mkdDebt}, Total: ${eurDebt + mkdDebt}`);
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    try { await pool.end(); } catch {}
  }
}

main();


