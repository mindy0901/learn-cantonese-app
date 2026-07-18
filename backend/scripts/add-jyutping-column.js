// Add jyutping column to han_characters on Supabase cloud
// Usage: node backend/scripts/add-jyutping-column.js

import pg from "pg";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

const sql = readFileSync(
    resolve(__dirname, "../supabase/migrations/20260714180000_han_characters_jyutping.sql"),
    "utf-8",
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

    // Verify column exists
    const { rows } = await pool.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'han_characters' AND column_name = 'jyutping'",
    );
    if (rows.length > 0) {
        console.log("Verified: jyutping column exists.");
    }
} catch (err) {
    console.error("Direct error:", err.message);

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
