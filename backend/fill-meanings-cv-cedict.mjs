/**
 * fill-meanings-cv-cedict.mjs — Fill viet_meanings (CVDICT) + eng_meanings (CEDICT)
 * for DB rows missing BOTH, only when both sources match the same word+pinyin.
 * Normalizes vi/en with capitalizeSentences (AGENTS.md rule).
 * --dry preview (default), --apply writes.
 */
import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "..", ".env.dev") });
const APPLY = process.argv.includes("--apply");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const DATA = resolve(__dirname, "data");

function normPy(s) {
    const first = String(s ?? "").split(/[,;/]/)[0];
    let out = "";
    for (const ch of first.normalize("NFD")) {
        if (/[a-z]/i.test(ch)) out += ch;
    }
    return out.toLowerCase();
}
function capitalizeSentences(s) {
    return String(s ?? "")
        .replace(/(^|[.;;])\s*(\p{L})/gu, (m, p1, p2) => p1 + p2.toUpperCase())
        .trim();
}

async function main() {
    const cvdIdx = new Map();
    for (const e of JSON.parse(readFileSync(resolve(DATA, "CVDICT.json"), "utf8"))) {
        const k = `${normPy(e.p)}|${e.s}`;
        if (!cvdIdx.has(k)) cvdIdx.set(k, e.vi || "");
        const k2 = `${normPy(e.p)}|${e.t}`;
        if (!cvdIdx.has(k2)) cvdIdx.set(k2, e.vi || "");
    }
    const cedIdx = new Map();
    for (const e of JSON.parse(readFileSync(resolve(DATA, "CEDICT.json"), "utf8"))) {
        const en = (e.en || []).join("; ");
        const k = `${normPy(e.p)}|${e.s}`;
        if (!cedIdx.has(k)) cedIdx.set(k, en);
        const k2 = `${normPy(e.p)}|${e.t}`;
        if (!cedIdx.has(k2)) cedIdx.set(k2, en);
    }
    console.log(`CVDICT idx: ${cvdIdx.size}, CEDICT idx: ${cedIdx.size}`);

    const { rows } = await pool.query(
        `SELECT id, han_simplified, han_traditional, pinyin, viet_meanings, eng_meanings FROM vocabularies`,
    );

    const fills = [];
    for (const r of rows) {
        const hasVi = r.viet_meanings && r.viet_meanings.trim();
        const hasEn = r.eng_meanings && r.eng_meanings.trim();
        if (hasVi && hasEn) continue;
        const np = normPy(r.pinyin);
        const vi =
            (r.han_simplified && cvdIdx.get(`${np}|${r.han_simplified}`)) ||
            (r.han_traditional && cvdIdx.get(`${np}|${r.han_traditional}`));
        const en =
            (r.han_simplified && cedIdx.get(`${np}|${r.han_simplified}`)) ||
            (r.han_traditional && cedIdx.get(`${np}|${r.han_traditional}`));
        if (!vi || !en) continue; // only fill pairs
        fills.push({
            id: r.id,
            w: r.han_traditional,
            py: r.pinyin,
            vi: capitalizeSentences(vi),
            en: capitalizeSentences(en),
        });
    }

    console.log(`MODE: ${APPLY ? "APPLY" : "DRY"}  rows to fill (vi+en pairs): ${fills.length}`);
    for (const s of fills.slice(0, 10)) console.log(`  ${s.w} ${s.py} | vi="${s.vi}" | en="${s.en}"`);

    if (APPLY) {
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            let n = 0;
            for (const s of fills) {
                await client.query(
                    "UPDATE vocabularies SET viet_meanings=$1, eng_meanings=$2, updated_at=now() WHERE id=$3",
                    [s.vi, s.en, s.id],
                );
                n++;
            }
            await client.query("COMMIT");
            console.log(`\n✔ WROTE ${n} rows`);
        } catch (e) {
            await client.query("ROLLBACK");
            console.error("ROLLED BACK:", e.message);
            process.exitCode = 1;
        } finally {
            client.release();
        }
    } else {
        console.log("\n(dry run — run with --apply to write)");
    }
    await pool.end();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
