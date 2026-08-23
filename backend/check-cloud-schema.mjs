/** check-cloud-schema.mjs — kiểm tra schema Prisma cloud có đủ bảng/cột như local không. */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const txt = readFileSync(resolve(__dirname, ".env.cloud"), "utf8");
const url = txt.match(/DATABASE_URL=['"]([^'"]+)['"]/)?.[1];
if (!url) {
    console.error("No DATABASE_URL in .env.cloud");
    process.exit(1);
}
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

const LOCAL_TABLES = [
    "users",
    "radicals",
    "han_characters",
    "vocabularies",
    "vocabulary_readings",
    "vocabulary_meanings",
    "vocabulary_examples",
    "vocabulary_characters",
    "user_vocabularies",
    "grammars",
    "grammar_examples",
    "flashcard_decks",
    "flashcard_deck_vocabularies",
    "vocabulary_sets",
    "vocabulary_set_vocabularies",
];

try {
    const tabs = await pool.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`);
    const cloudTabs = new Set(tabs.rows.map((r) => r.tablename));
    console.log("CLOUD TABLES:", [...cloudTabs].join(", "));
    for (const t of LOCAL_TABLES) {
        if (!cloudTabs.has(t)) console.log(`  ❌ MISSING TABLE: ${t}`);
    }
    // Kiểm tra cột vocabularies cần thiết
    const vcols = await pool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name='vocabularies' ORDER BY column_name`,
    );
    const cloudVcols = new Set(vcols.rows.map((r) => r.column_name));
    const needV = [
        "id",
        "hanzi_traditional",
        "hanzi_simplified",
        "hanzi_traditional_hk",
        "hanzi_simplified_hk",
        "hsk_level",
        "frequency",
        "han_characters",
        "popularity",
        "created_at",
        "updated_at",
    ];
    console.log("CLOUD vocabularies cols:", [...cloudVcols].join(", "));
    for (const c of needV) if (!cloudVcols.has(c)) console.log(`  ❌ MISSING vocabularies col: ${c}`);
    const hc = await pool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name='han_characters' ORDER BY column_name`,
    );
    console.log("CLOUD han_characters cols:", hc.rows.map((r) => r.column_name).join(", "));
} catch (e) {
    console.error("ERR:", e.message);
    process.exitCode = 1;
} finally {
    await pool.end();
}
