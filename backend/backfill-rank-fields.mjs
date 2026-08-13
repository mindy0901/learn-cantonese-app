/**
 * backfill-rank-fields.mjs — Điền các field xếp hạng còn thiếu từ xue-hanzi dictionary:
 *   - movieWordRank (mwr), bookWordRank (bwr), boost (b)
 *   - frequency: KHÔNG có nguồn trực tiếp — để nguyên (hoặc tính sau)
 *
 * Chỉ ĐIỀN field null/thiếu — KHÔNG ghi đè giá trị đã có.
 * Match: normPinyin(toneless) + simplified OR traditional (giống import-xue-hanzi).
 *
 * Usage:
 *   node /app/backfill-rank-fields.mjs --dry      # preview
 *   node /app/backfill-rank-fields.mjs --apply    # ghi DB
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
const DICT = resolve(__dirname, "data", "xue-hanzi", "dictionary.json");

function normPyMatch(s) {
    const first = String(s ?? "").split(/[,;/]/)[0];
    let out = "";
    for (const ch of first.normalize("NFD")) {
        if (/[a-z]/i.test(ch)) out += ch;
    }
    return out.toLowerCase();
}

const dict = JSON.parse(readFileSync(DICT, "utf8"));

// Index by han (traditional/simplified) + normalized pinyin
const byTrad = new Map();
const bySimp = new Map();
const byNormPy = new Map();
for (const e of dict) {
    if (e.t) {
        if (!byTrad.has(e.t)) byTrad.set(e.t, []);
        byTrad.get(e.t).push(e);
    }
    if (e.s) {
        if (!bySimp.has(e.s)) bySimp.set(e.s, []);
        bySimp.get(e.s).push(e);
    }
    const p = normPyMatch(e.p);
    if (p) {
        if (!byNormPy.has(p)) byNormPy.set(p, []);
        byNormPy.get(p).push(e);
    }
}

const rows = await pool.query(
    `SELECT id, han_traditional, han_simplified, pinyin, movie_word_rank, book_word_rank, boost
     FROM vocabularies
     WHERE movie_word_rank IS NULL OR book_word_rank IS NULL OR boost IS NULL`,
);
console.log(`Vocab thiếu field: ${rows.rows.length}`);

let updated = 0;
let stillMissing = 0;
for (const r of rows.rows) {
    const simp = (r.han_simplified ?? "").replace(/\s+/g, "");
    const trad = (r.han_traditional ?? "").replace(/\s+/g, "");
    const p = normPyMatch(r.pinyin);
    const norm = (s) => String(s ?? "").replace(/\s+/g, "");
    // Prefer han match (trad → simp), fallback to pinyin; prefer exact form match
    const best =
        (trad ? byTrad.get(trad) : undefined)?.[0] ||
        (simp ? bySimp.get(simp) : undefined)?.[0] ||
        (trad && simp ? byTrad.get(trad)?.find((e) => norm(e.s) === simp) : undefined) ||
        (p ? byNormPy.get(p)?.find((e) => norm(e.t) === trad || norm(e.s) === simp) : undefined) ||
        (p ? byNormPy.get(p)?.[0] : undefined);

    const patch = {};
    if (!best) {
        stillMissing++;
        continue;
    }
    if (r.movie_word_rank == null && best.mwr != null) patch.movie_word_rank = best.mwr;
    if (r.book_word_rank == null && best.bwr != null) patch.book_word_rank = best.bwr;
    if (r.boost == null && best.b != null) patch.boost = best.b;
    if (Object.keys(patch).length === 0) continue;

    updated++;
    if (APPLY) {
        const entries = Object.entries(patch);
        const sets = entries.map(([k], i) => `${k}=$${i + 1}`).join(", ");
        await pool.query(`UPDATE vocabularies SET ${sets}, updated_at=now() WHERE id=$${entries.length + 1}`, [
            ...Object.values(patch),
            r.id,
        ]);
    }
}

console.log(`Sẽ điền: ${updated} | vẫn thiếu (không match nguồn): ${stillMissing} | mode: ${APPLY ? "APPLY" : "DRY"}`);
await pool.end();
