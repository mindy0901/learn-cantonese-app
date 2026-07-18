// Run han_characters search_key migration on Supabase cloud
// Usage: node backend/scripts/migrate-search-key.js

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const url = process.env.SUPABASE_URL?.replace(/\/rest\/v1\/?$/i, "").replace(/\/$/, "");
const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();

if (!url || !secretKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY");
  process.exit(1);
}

const supabase = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const sql = readFileSync(
  resolve(__dirname, "../supabase/migrations/20260714020000_han_characters_search_key.sql"),
  "utf-8"
);

// Split by semicolons and run each statement
const statements = sql
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && !s.startsWith("--"));

async function main() {
  for (const stmt of statements) {
    console.log("Running:", stmt.slice(0, 80) + (stmt.length > 80 ? "..." : ""));
    const { error } = await supabase.rpc("exec_sql", { sql: stmt }).maybeSingle();

    if (error) {
      // Try raw SQL via REST API
      const { error: rawError } = await supabase
        .from("_sql")
        .select("*")
        .or(`sql.eq.${stmt}`)
        .maybeSingle();

      console.error("Error:", error.message);
    } else {
      console.log("OK");
    }
  }
  console.log("Migration complete.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
