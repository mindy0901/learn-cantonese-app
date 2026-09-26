/**
 * backup-prisma-cloud.mjs — Backup local DB → Prisma Postgres cloud (db.prisma.io).
 * Reads local (.env.dev) + cloud (.env.cloud) connection strings.
 * Resets cloud tables (FK order) then copies all rows local → cloud.
 * --dry preview (counts only), --apply resets + copies.
 */
import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "..", "..", ".env.dev") });
const LOCAL_URL = process.env.DATABASE_URL;

const fs = await import("fs");
const cloudEnv = fs.readFileSync(resolve(__dirname, "..", ".env.cloud"), "utf8");
const m = cloudEnv.match(/['"]?DATABASE_URL['"]?\s*=\s*['"]([^'"]+)['"]/);
if (!m) {
    console.error("Cannot parse DATABASE_URL from .env.cloud");
    process.exit(1);
}
const CLOUD_URL = m[1];

const APPLY = process.argv.includes("--apply");

// FK-safe copy order (2026-08-31 — sau drop han_characters + *_vocabulary_characters;
// thêm user_checkins 08-24; user_vocabularies/sentence_patterns đã bỏ)
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

// parse jsonb/json from local into JS objects (so we can re-stringify on insert)
pg.types.setTypeParser(pg.types.builtins.JSONB, (v) => (v === null ? null : JSON.parse(v)));
pg.types.setTypeParser(pg.types.builtins.JSON, (v) => (v === null ? null : JSON.parse(v)));

/** Format a JS array as a PostgreSQL array literal, e.g. ["LINH"] → {LINH} */
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

/** column_name → data_type for a table */
async function getColTypes(pool, table) {
    const { rows } = await pool.query(
        `SELECT column_name, data_type FROM information_schema.columns WHERE table_name=$1`,
        [table],
    );
    const map = {};
    for (const r of rows) map[r.column_name] = r.data_type;
    return map;
}

async function main() {
    const local = new pg.Pool({ connectionString: LOCAL_URL });
    const cloud = new pg.Pool({ connectionString: CLOUD_URL, ssl: { rejectUnauthorized: false } });

    // sanity: local reachable
    const lv = await local.query('SELECT count(*) c FROM "cantonese_vocabularies"').catch((e) => {
        console.error("local ERR", e.message);
        process.exit(1);
    });
    const lm = await local.query('SELECT count(*) c FROM "mandarin_vocabularies"').catch((e) => {
        console.error("local ERR", e.message);
        process.exit(1);
    });
    const cv = await cloud
        .query('SELECT count(*) c FROM "cantonese_vocabularies"')
        .catch(() => ({ rows: [{ c: "N/A" }] }));
    const cm = await cloud
        .query('SELECT count(*) c FROM "mandarin_vocabularies"')
        .catch(() => ({ rows: [{ c: "N/A" }] }));
    console.log(
        `local cantonese: ${lv.rows[0].c} | mandarin: ${lm.rows[0].c} | cloud cantonese: ${cv.rows[0].c} | mandarin: ${cm.rows[0].c}`,
    );
    console.log(`MODE: ${APPLY ? "APPLY (resets + copies)" : "DRY (preview)"}`);

    const counts = {};
    for (const t of TABLES) {
        const r = await local.query(`SELECT count(*) c FROM "${t}"`);
        counts[t] = Number(r.rows[0].c);
    }
    console.log("rows to backup:", JSON.stringify(counts));

    if (!APPLY) {
        console.log("\n(dry run — run with --apply to reset cloud + copy)");
        await local.end();
        await cloud.end();
        return;
    }

    const client = await cloud.connect();
    try {
        await client.query("BEGIN");
        // reset cloud (reverse FK order)
        for (const t of [...TABLES].reverse()) {
            await client.query(`DELETE FROM "${t}"`);
        }
        // copy local → cloud
        for (const t of TABLES) {
            const { rows } = await local.query(`SELECT * FROM "${t}"`);
            if (!rows.length) {
                console.log(`  ${t}: 0 (skip)`);
                continue;
            }
            const colTypes = await getColTypes(local, t);
            const cols = Object.keys(rows[0]);
            const colSql = cols.map((c) => `"${c}"`).join(",");
            for (let i = 0; i < rows.length; i += 500) {
                const batch = rows.slice(i, i + 500);
                const values = [];
                const ph = [];
                batch.forEach((row, bi) => {
                    const rowPh = cols.map((c, ci) => `$${bi * cols.length + ci + 1}`).join(",");
                    ph.push(`(${rowPh})`);
                    cols.forEach((c) => {
                        let v = row[c];
                        if (v !== null) {
                            const dt = colTypes[c];
                            if (dt === "ARRAY") {
                                // node-pg returns text[]/uuid[] as JS arrays → PG literal {…}
                                if (Array.isArray(v)) v = pgArrayLiteral(v);
                            } else if (dt === "jsonb" || dt === "json") {
                                // objects (jsonb parsed) → JSON strings
                                if (typeof v === "object") v = JSON.stringify(v);
                            }
                        }
                        values.push(v);
                    });
                });
                await client.query(
                    `INSERT INTO "${t}" (${colSql}) VALUES ${ph.join(",")} ON CONFLICT ("id") DO NOTHING`,
                    values,
                );
            }
            console.log(`  ✓ ${t}: ${rows.length}`);
        }
        await client.query("COMMIT");
        console.log("\n✔ BACKUP COMPLETE");
    } catch (e) {
        await client.query("ROLLBACK");
        console.error("ROLLED BACK:", e.message);
        process.exitCode = 1;
    } finally {
        client.release();
    }
    await local.end();
    await cloud.end();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
