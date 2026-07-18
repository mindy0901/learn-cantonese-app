import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

// Try different host/port combos
const combos = [
  { host: "tifgjbsfcajmxbzflcbm.supabase.co", port: 5432 },
  { host: "tifgjbsfcajmxbzflcbm.supabase.co", port: 6543 },
];

for (const { host, port } of combos) {
  const pool = new Pool({
    host,
    port,
    database: "postgres",
    user: "postgres",
    password: process.env.SUPABASE_SECRET_KEY,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000,
  });
  try {
    console.log(`Trying ${host}:${port}...`);
    const r = await pool.query("SELECT 1 AS one");
    console.log(`  OK: ${host}:${port}`, r.rows);
  } catch (e) {
    console.log(`  ERR: ${host}:${port} - ${e.message}`);
  }
  await pool.end();
}
