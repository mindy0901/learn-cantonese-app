import pg from "pg";
import { readFileSync } from "fs";

const { Pool } = pg;

const sql = readFileSync(
  "/app/supabase/migrations/20260714020000_han_characters_search_key.sql",
  "utf-8"
);

// Try direct connection
const pool = new Pool({
  host: "db.tifgjbsfcajmxbzflcbm.supabase.co",
  port: 5432,
  database: "postgres",
  user: "postgres",
  password: process.env.SUPABASE_SECRET_KEY,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

try {
  console.log("Connecting...");
  await pool.query("SELECT 1");
  console.log("Connected. Running migration...");
  await pool.query(sql);
  console.log("Migration complete.");
} catch (err) {
  console.error("Error:", err.message);
  
  // Fallback: try pooler with different user format
  console.log("Trying pooler...");
  const pool2 = new Pool({
    host: "aws-0-ap-southeast-1.pooler.supabase.com",
    port: 6543,
    database: "postgres",
    user: process.env.SUPABASE_URL?.match(/https:\/\/(.+)\.supabase/)?.[1] || "tifgjbsfcajmxbzflcbm",
    password: process.env.SUPABASE_SECRET_KEY,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });
  try {
    await pool2.query("SELECT 1");
    console.log("Connected via pooler. Running migration...");
    await pool2.query(sql);
    console.log("Migration complete.");
  } catch (err2) {
    console.error("Pooler error:", err2.message);
  } finally {
    await pool2.end();
  }
} finally {
  await pool.end();
}
