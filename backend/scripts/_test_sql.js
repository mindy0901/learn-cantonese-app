import "dotenv/config";
import { requireAdmin } from "../lib/supabaseAdmin.js";

const db = requireAdmin();

// Check if sql method exists
if (typeof db.sql === "function") {
  console.log("db.sql EXISTS");
  try {
    const r = await db.sql`SELECT 1 AS one`;
    console.log("RESULT:", JSON.stringify(r));
  } catch (e) {
    console.log("SQL ERROR:", e.message);
  }
} else {
  console.log("db.sql NOT FOUND, methods:", Object.keys(db).filter(k => typeof db[k] === 'function').slice(0, 15));
}

// Also check db.rpc
console.log("rpc type:", typeof db.rpc);
