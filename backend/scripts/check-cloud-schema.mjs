/** check-cloud-schema.mjs — kiểm tra schema Prisma cloud có đủ bảng/cột như local không. */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const txt = readFileSync(resolve(__dirname, "..", ".env.cloud"), "utf8");
const url = txt.match(/DATABASE_URL=['"]([^'"]+)['"]/)?.[1];
if (!url) {
    console.error("No DATABASE_URL in .env.cloud");
    process.exit(1);
}
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

const LOCAL_TABLES = [
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

try {
    const tabs = await pool.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`);
    const cloudTabs = new Set(tabs.rows.map((r) => r.tablename));
    console.log("CLOUD TABLES:", [...cloudTabs].join(", "));
    for (const t of LOCAL_TABLES) {
        if (!cloudTabs.has(t)) console.log(`  ❌ MISSING TABLE: ${t}`);
    }
    // Kiểm tra cột key của 3 bảng chính
    for (const [tbl, need] of [
        [
            "cantonese_vocabularies",
            [
                "id",
                "hanzi_traditional_hk",
                "pure_cantonese",
                "popularity",
                "hanzi_characters",
                "created_at",
                "updated_at",
            ],
        ],
        [
            "mandarin_vocabularies",
            [
                "id",
                "hanzi_simplified",
                "hanzi_traditional",
                "hsk_level",
                "popularity",
                "hanzi_characters",
                "created_at",
                "updated_at",
            ],
        ],
        ["user_checkins", ["id", "user_id", "checkin_date", "created_at"]],
    ]) {
        const cols = await pool.query(
            `SELECT column_name FROM information_schema.columns WHERE table_name=$1 ORDER BY column_name`,
            [tbl],
        );
        const cloudCols = new Set(cols.rows.map((r) => r.column_name));
        console.log(`CLOUD ${tbl} cols:`, [...cloudCols].join(", "));
        for (const c of need) if (!cloudCols.has(c)) console.log(`  ❌ MISSING ${tbl} col: ${c}`);
    }
} catch (e) {
    console.error("ERR:", e.message);
    process.exitCode = 1;
} finally {
    await pool.end();
}
