/**
 * restore-from-cloud.mjs — Khôi phục dữ liệu từ Prisma cloud (db.prisma.io) → local.
 * Cloud đang ở schema CŨ (trước split): tạo lại các bảng cũ + copy toàn bộ rows.
 * Chạy: docker compose -f docker-compose.dev.yml exec -T backend node /app/restore-from-cloud.mjs --apply
 *       (không --apply = chỉ preview các bảng + counts)
 */
import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "..", ".env.dev") });
const LOCAL_URL = process.env.DATABASE_URL;

const cloudEnv = fs.readFileSync(resolve(__dirname, ".env.cloud"), "utf8");
const m = cloudEnv.match(/DATABASE_URL\s*=\s*['"]([^'"]+)['"]/);
if (!m) {
    console.error("Cannot parse DATABASE_URL from .env.cloud");
    process.exit(1);
}
const CLOUD_URL = m[1];

const APPLY = process.argv.includes("--apply");

// Bảng không cần restore: _prisma_migrations (prisma internal),
// sentence_patterns (đã drop ở schema hiện tại), user_vocabularies (đã bỏ).
const SKIP_TABLES = new Set(["_prisma_migrations", "sentence_patterns", "user_vocabularies"]);

// jsonb/json → JS objects; text[] → JS arrays (pg handles arrays natively)
pg.types.setTypeParser(pg.types.builtins.JSONB, (v) => (v === null ? null : JSON.parse(v)));
pg.types.setTypeParser(pg.types.builtins.JSON, (v) => (v === null ? null : JSON.parse(v)));

/** Bảng user (public schema), loại hệ thống */
async function listTables(pool) {
    const { rows } = await pool.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema='public' AND table_type='BASE TABLE'
         ORDER BY table_name`,
    );
    return rows.map((r) => r.table_name);
}

/** Column definitions cho 1 bảng (từ cloud) */
async function getColumns(pool, table) {
    const { rows } = await pool.query(
        `SELECT column_name, data_type, udt_name, character_maximum_length,
                is_nullable, column_default, is_identity
         FROM information_schema.columns
         WHERE table_schema='public' AND table_name=$1
         ORDER BY ordinal_position`,
        [table],
    );
    return rows;
}

/** Build CREATE TABLE DDL từ columns */
function buildCreate(table, cols) {
    const defs = cols.map((c) => {
        let type;
        if (c.udt_name === "_text") type = "text[]";
        else if (c.udt_name === "_varchar") type = "varchar[]";
        else if (c.udt_name === "_int4") type = "integer[]";
        else if (c.udt_name === "_int8") type = "bigint[]";
        else if (c.udt_name === "_float8") type = "double precision[]";
        else if (c.udt_name === "_bool") type = "boolean[]";
        else if (c.udt_name === "_numeric") type = "numeric[]";
        else if (c.udt_name === "_jsonb") type = "jsonb[]";
        else if (c.data_type === "USER-DEFINED") type = c.udt_name;
        else if (c.data_type === "ARRAY") type = c.udt_name;
        else type = c.data_type;

        let s = `  "${c.column_name}" ${type}`;
        if (c.is_nullable === "NO") s += " NOT NULL";
        // bỏ default liên quan identity/sequence phức tạp — giữ lại bản cũ
        if (c.column_default && !/^nextval|^gen_random|^uuid_generate/i.test(c.column_default)) {
            s += ` DEFAULT ${c.column_default}`;
        }
        return s;
    });
    return `CREATE TABLE IF NOT EXISTS "${table}" (\n${defs.join(",\n")}\n);`;
}

/** Format JS array → PG array literal, e.g. ["MAO"] → {MAO} (AGENTS.md §10.3) */
function pgArrayLiteral(arr) {
    return (
        "{" +
        arr
            .map((x) => {
                const s = String(x);
                return /[{}",\\\s]/.test(s) ? '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"' : s;
            })
            .join(",") +
        "}"
    );
}

/** Chuyển value theo udt_name để insert an toàn */
function normalize(v, udt) {
    if (v === null || v === undefined) return null;
    if (["jsonb", "json"].includes(udt)) return typeof v === "string" ? v : JSON.stringify(v);
    if (udt.startsWith("_")) return pgArrayLiteral(Array.isArray(v) ? v : [v]);
    return v;
}

async function main() {
    const cloud = new pg.Pool({ connectionString: CLOUD_URL, ssl: { rejectUnauthorized: false } });
    const local = new pg.Pool({ connectionString: LOCAL_URL });

    const tables = (await listTables(cloud)).filter((t) => !SKIP_TABLES.has(t));
    console.log("cloud tables (restore):", tables.length);

    const counts = {};
    for (const t of tables) {
        const r = await cloud.query(`SELECT count(*)::int c FROM "${t}"`);
        counts[t] = r.rows[0].c;
    }
    console.log("cloud counts:", JSON.stringify(counts, null, 0));

    if (!APPLY) {
        console.log("\n(dry run — chạy --apply để tạo bảng + copy vào local)");
        await cloud.end();
        await local.end();
        return;
    }

    const client = await local.connect();
    try {
        await client.query("BEGIN");
        for (const t of tables) {
            const cols = await getColumns(cloud, t);
            const createSql = buildCreate(t, cols);
            await client.query(createSql);

            const colNames = cols.map((c) => `"${c.column_name}"`);
            const selectCols = cols.map((c) => `"${c.column_name}"`).join(", ");
            const udts = cols.map((c) => c.udt_name);

            const total = counts[t];
            const BATCH = 500;
            for (let off = 0; off < total; off += BATCH) {
                const { rows } = await cloud.query(
                    `SELECT ${selectCols} FROM "${t}" ORDER BY 1 OFFSET ${off} LIMIT ${BATCH}`,
                );
                for (const row of rows) {
                    const vals = cols.map((c) => normalize(row[c.column_name], c.udt_name));
                    const ph = cols.map((_, i) => `$${i + 1}`).join(", ");
                    await client.query(`INSERT INTO "${t}" (${colNames.join(", ")}) VALUES (${ph})`, vals);
                }
            }
            console.log(`  ${t}: ${total} rows copied`);
        }
        await client.query("COMMIT");
        console.log("RESTORE OK");
    } catch (e) {
        await client.query("ROLLBACK");
        console.error("RESTORE FAILED:", e.message);
        process.exit(1);
    } finally {
        client.release();
        await cloud.end();
        await local.end();
    }
}

main();
