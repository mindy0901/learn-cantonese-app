/**
 * sync-cloud-schema.mjs (2026-08-16)
 * Đồng bộ schema Prisma cloud = local cho danh sách TABLES (backup mirror).
 *
 * Cách làm: DROP + RECREATE từng bảng trên cloud theo đúng DDL local
 * (column + type + nullable + default + PK id). Cloud là mirror sẽ bị reset
 * bởi backup-prisma-cloud.mjs nên mất dữ liệu cloud là OK.
 *
 * ⚠️ GHI CLOUD — phải có user xác nhận trước khi chạy (AGENTS.md §10).
 * Usage: docker compose -f docker-compose.dev.yml exec -T backend node /app/sync-cloud-schema.mjs
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const txt = readFileSync(resolve(__dirname, "..", ".env.cloud"), "utf8");
const CLOUD_URL = txt.match(/DATABASE_URL=['"]([^'"]+)['"]/)?.[1];
if (!CLOUD_URL) {
    console.error("No DATABASE_URL in .env.cloud");
    process.exit(1);
}
const cloud = new pg.Pool({ connectionString: CLOUD_URL, ssl: { rejectUnauthorized: false } });
const local = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const TABLES = [
    "users",
    "radicals",
    "cantonese_vocabularies",
    "cantonese_vocabulary_romanizations",
    "cantonese_vocabulary_meanings",
    "cantonese_vocabulary_examples",
    "mandarin_vocabularies",
    "mandarin_vocabulary_romanizations",
    "mandarin_vocabulary_meanings",
    "mandarin_vocabulary_examples",
    "grammars",
    "grammar_examples",
    "flashcard_decks",
    "flashcard_deck_cantonese_vocabularies",
    "flashcard_deck_mandarin_vocabularies",
    "vocabulary_sets",
    "vocabulary_set_cantonese_vocabularies",
    "vocabulary_set_mandarin_vocabularies",
    "user_checkins",
    "user_favorite_vocabularies",
    "user_disliked_vocabularies",
    "user_vocabulary_mastery",
    "tags",
    "vocabulary_tags",
];

async function localColumns(table) {
    const { rows } = await local.query(
        `SELECT a.attname AS name,
                pg_catalog.format_type(a.atttypid, a.atttypmod) AS type,
                NOT a.attnotnull AS nullable,
                pg_get_expr(d.adbin, d.adrelid) AS def
         FROM pg_attribute a
         LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
         WHERE a.attrelid = ('public."' || $1 || '"')::regclass
           AND a.attnum > 0 AND NOT a.attisdropped
         ORDER BY a.attnum`,
        [table],
    );
    return rows;
}

/** Escapes a default expression (from pg_get_expr) into a safe DDL default. */
function defSql(def) {
    if (!def) return "";
    // pg_get_expr returns e.g. "'abc'::character varying" or "CURRENT_TIMESTAMP" or "gen_random_uuid()"
    if (def.startsWith("nextval(") || def.includes("::uuid")) {
        // uuid default via gen_random_uuid handled below
    }
    return ` DEFAULT ${def}`;
}

// Bảng ĐÃ DROP khỏi local (2026-08-16/08-31) — dọn khỏi cloud để mirror đúng local
const STALE_TABLES = [
    "han_characters",
    "cantonese_vocabulary_characters",
    "mandarin_vocabulary_characters",
    "vocabularies",
    "vocabulary_meanings",
    "vocabulary_examples",
    "vocabulary_characters",
    "user_vocabularies",
    "sentence_patterns",
    "flashcard_deck_vocabularies",
    "vocabulary_set_vocabularies",
];

async function main() {
    const applied = {};
    for (const t of STALE_TABLES) {
        await cloud.query(`DROP TABLE IF EXISTS "${t}" CASCADE`);
    }
    console.log(`  cleaned ${STALE_TABLES.length} stale tables`);
    for (const t of [...TABLES].reverse()) {
        await cloud.query(`DROP TABLE IF EXISTS "${t}" CASCADE`);
        console.log(`  DROPPED ${t}`);
    }
    for (const t of TABLES) {
        const cols = await localColumns(t);
        const colDefs = cols.map((c) => {
            let type = c.type;
            // Cho uuid id default gen_random_uuid() nếu local dùng nó
            let def = c.def ? defSql(c.def) : "";
            const nullSql = c.nullable ? "" : " NOT NULL";
            return `"${c.name}" ${type}${nullSql}${def}`;
        });
        const pk = cols.some((c) => c.name === "id");
        const pkSql = pk ? ", PRIMARY KEY (id)" : "";
        const ddl = `CREATE TABLE IF NOT EXISTS "${t}" (${colDefs.join(", ")}${pkSql})`;
        await cloud.query(ddl);
        console.log(`  CREATED ${t} (${cols.length} cols)`);
        applied[t] = cols.length;
    }
    console.log("\n✔ CLOUD SCHEMA SYNCED:", JSON.stringify(applied));
    await cloud.end();
    await local.end();
}

main().catch((e) => {
    console.error("ERR:", e.message);
    process.exit(1);
});
