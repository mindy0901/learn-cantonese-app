/**
 * import-xue-hanzi.mjs — Update local DB from phucbm/xue-hanzi dictionary.json.
 *
 * Data: backend/data/xue-hanzi/dictionary.json
 * Entry: { s, t, p, pt, sp, b, vi, sv, en[], hsk?, mwr?, bwr?, tw? }
 *
 * Strategy (per user request):
 *  1. UPDATE rows already in DB that match a POPULAR entry (rank<=10000 || boost>=30):
 *     overwrite vietMeanings, engMeanings, sinoVietnamese, movieWordRank,
 *     bookWordRank, relatedWords, boost. Fill pinyin/hskLevel only if empty.
 *  2. CREATE entries not in DB that are POPULAR.
 *  3. DELETE DB rows that match dictionary but whose entries are ALL NOT popular.
 *
 * Match: normPinyin(toneless) + simplified OR traditional.
 * Popular: min(movieWordRank, bookWordRank) <= 10000 OR boost >= 30.
 *
 * Safety: --dry preview (default), --apply writes. WRITES/DELETES — confirm first.
 */
import dotenv from "dotenv";
import { createHash } from "crypto";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "..", ".env.dev") });
const APPLY = process.argv.includes("--apply");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const DICT = resolve(__dirname, "data", "xue-hanzi", "dictionary.json");

// ── normalize ──
function normPyMatch(s) {
    const first = String(s ?? "").split(/[,;/]/)[0];
    let out = "";
    for (const ch of first.normalize("NFD")) {
        if (/[a-z]/i.test(ch)) out += ch;
    }
    return out.toLowerCase();
}
function cleanPinyin(s) {
    return String(s ?? "")
        .replace(/\u200b/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}
function capitalizeSentences(s) {
    return String(s ?? "")
        .replace(/(^|[.;;])\s*(\p{L})/gu, (m, p1, p2) => p1 + p2.toUpperCase())
        .trim();
}
function upperSv(s) {
    return String(s ?? "")
        .trim()
        .toUpperCase();
}
function stableUUID(hanTraditional, hanSimplified, normPinyin, normJyutping) {
    const raw = `${hanTraditional}|${hanSimplified ?? ""}|${normPinyin}|${normJyutping ?? ""}`;
    const h = createHash("md5").update(raw).digest("hex");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}
function isPopular(e) {
    const mwr = e.mwr || 9999999;
    const bwr = e.bwr || 9999999;
    return Math.min(mwr, bwr) <= 10000 || (e.b || 0) >= 30;
}
function relJson(tw) {
    if (!Array.isArray(tw) || !tw.length) return null;
    return JSON.stringify(tw.map((w) => ({ word: w.word, trad: w.trad, gloss: w.gloss })));
}
function hskLabel(h) {
    if (!h) return null;
    const n = Number(h);
    if (n >= 7) return "HSK 7-9";
    return `HSK ${n}`;
}

async function main() {
    const entries = JSON.parse(readFileSync(DICT, "utf8"));
    console.log(`dictionary entries: ${entries.length}`);

    // OpenCC for canonical traditional (avoids rare CJK-ext variants like 㓂)
    let toTrad = (s) => s;
    try {
        const OpenCC = await import("opencc-js");
        toTrad = OpenCC.Converter({ from: "cn", to: "hk" });
    } catch {
        /* fallback: use entry.t */
    }
    const tradOf = (e) => {
        // prefer entry.t only when it's a common CJK char (no rare ext variants)
        const t = e.t;
        if (t && /^[\u4e00-\u9fff]+$/.test(t) && !/[\u3400-\u4dbf\u{20000}-\u{2a6df}]/u.test(t)) return t;
        const conv = toTrad(e.s);
        return conv || e.s;
    };

    // index entries by "np|simp" and "np|trad" -> popular flag + best entry
    const byKey = new Map(); // key -> { any: bool, popular: bool, best: entry }
    const addKey = (k, e) => {
        if (!k) return;
        const cur = byKey.get(k) || { any: false, popular: false, best: null };
        cur.any = true;
        if (isPopular(e)) {
            cur.popular = true;
            if (!cur.best || (e.b || 0) > (cur.best.b || 0)) cur.best = e;
        }
        byKey.set(k, cur);
    };
    for (const e of entries) {
        const np = normPyMatch(e.p);
        addKey(`${np}|${e.s}`, e);
        if (e.t && e.t !== e.s) addKey(`${np}|${e.t}`, e);
    }

    const { rows } = await pool.query(
        `SELECT id, han_simplified, han_traditional, pinyin, hsk_level, viet_meanings,
                eng_meanings, sino_vietnamese, movie_word_rank, book_word_rank,
                related_words, boost
         FROM vocabularies`,
    );

    const upd = [],
        del = [],
        keepNoDict = [];
    for (const r of rows) {
        const np = normPyMatch(r.pinyin);
        const simp = r.han_simplified ? byKey.get(`${np}|${r.han_simplified}`) : null;
        const trad = r.han_traditional ? byKey.get(`${np}|${r.han_traditional}`) : null;
        const any = simp?.any || trad?.any;
        const popular = simp?.popular || trad?.popular;
        if (popular) {
            upd.push({ r, best: simp?.best || trad?.best });
        } else if (any) {
            del.push(r);
        } else {
            keepNoDict.push(r);
        }
    }

    // CREATE: entries popular, not matched by any DB row
    const matchedKeys = new Set();
    for (const r of rows) {
        const np = normPyMatch(r.pinyin);
        if (r.han_simplified) matchedKeys.add(`${np}|${r.han_simplified}`);
        if (r.han_traditional) matchedKeys.add(`${np}|${r.han_traditional}`);
    }
    const seen = new Set();
    const newRows = [];
    for (const e of entries) {
        const np = normPyMatch(e.p);
        const trad = tradOf(e);
        if (matchedKeys.has(`${np}|${e.s}`) || matchedKeys.has(`${np}|${trad}`)) continue;
        if (!isPopular(e)) continue;
        const key = `${np}|${e.s}`;
        if (seen.has(key)) continue;
        seen.add(key);
        newRows.push(e);
    }

    console.log(`MODE: ${APPLY ? "APPLY (WRITES + DELETES)" : "DRY (preview)"}`);
    console.log(`  UPDATE (popular, in DB):   ${upd.length}`);
    console.log(`  CREATE (popular, new):     ${newRows.length}`);
    console.log(`  DELETE (not popular):      ${del.length}`);
    console.log(`  keep (no dict match):      ${keepNoDict.length}`);

    const sU = upd.slice(0, 8).map(({ r, best }) => ({
        w: r.han_traditional,
        py: r.pinyin,
        mwr: best?.mwr ?? null,
        bwr: best?.bwr ?? null,
        sv: best?.sv ?? "",
        vi: best?.vi ?? "",
    }));
    console.log("\n--- update samples ---");
    for (const s of sU) console.log(`  ${s.w} ${s.py} | mwr=${s.mwr} bwr=${s.bwr} | sv="${s.sv}" vi="${s.vi}"`);
    const sD = del.slice(0, 10).map((r) => ({ w: r.han_traditional, py: r.pinyin, hsk: r.hsk_level }));
    console.log("\n--- delete samples ---");
    for (const s of sD) console.log(`  ${s.w} ${s.py} (${s.hsk})`);
    const sN = newRows.slice(0, 8).map((e) => ({ w: e.s, t: tradOf(e), py: e.p, mwr: e.mwr, bwr: e.bwr }));
    console.log("\n--- create samples ---");
    for (const s of sN) console.log(`  ${s.w} (${s.t}) ${s.py} mwr=${s.mwr} bwr=${s.bwr}`);

    if (!APPLY) {
        console.log("\n(dry run — run with --apply to write)");
        await pool.end();
        return;
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        let nU = 0;
        for (const { r, best } of upd) {
            const vi = best?.vi ? capitalizeSentences(best.vi) : r.viet_meanings;
            const en = best?.en?.length ? capitalizeSentences(best.en.join("; ")) : r.eng_meanings;
            // Keep existing sino_vietnamese (source only has first-char SV for compounds)
            const pinyin = r.pinyin || cleanPinyin(best?.p);
            const hsk = r.hsk_level || hskLabel(best?.hsk);
            const mwr = best?.mwr ?? r.movie_word_rank;
            const bwr = best?.bwr ?? r.book_word_rank;
            const rel = best?.tw?.length ? relJson(best.tw) : r.related_words;
            const boost = best?.b ?? r.boost;
            await client.query(
                `UPDATE vocabularies SET viet_meanings=$1, eng_meanings=$2,
                 pinyin=$3, hsk_level=$4, movie_word_rank=$5, book_word_rank=$6,
                 related_words=$7, boost=$8, updated_at=now() WHERE id=$9`,
                [vi, en, pinyin, hsk, mwr, bwr, rel, boost, r.id],
            );
            nU++;
        }
        let nD = 0;
        for (const r of del) {
            await client.query("DELETE FROM user_vocabularies WHERE vocabulary_id=$1", [r.id]);
            await client.query("DELETE FROM vocabulary_characters WHERE vocabulary_id=$1", [r.id]);
            await client.query("DELETE FROM vocabulary_meanings WHERE vocabulary_id=$1", [r.id]);
            await client.query("DELETE FROM vocabulary_examples WHERE vocabulary_id=$1", [r.id]);
            await client.query("DELETE FROM flashcard_deck_vocabularies WHERE vocabulary_id=$1", [r.id]);
            await client.query("DELETE FROM vocabularies WHERE id=$1", [r.id]);
            nD++;
        }
        let nC = 0;
        for (const e of newRows) {
            const trad = tradOf(e);
            const simp = e.s === trad ? null : e.s;
            const id = stableUUID(trad, simp, normPyMatch(e.p), "");
            // SV only reliable for single chars (source gives first-char only for compounds)
            const sv = [...e.s].length === 1 ? upperSv(e.sv || "") : null;
            await client.query(
                `INSERT INTO vocabularies
                 (id, han_traditional, han_simplified, pinyin, hsk_level, part_of_speech,
                  viet_meanings, eng_meanings, sino_vietnamese, movie_word_rank,
                  book_word_rank, related_words, boost, created_at, updated_at)
                 SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, now(), now()
                 WHERE NOT EXISTS (SELECT 1 FROM vocabularies WHERE id=$1)`,
                [
                    id,
                    trad,
                    simp,
                    cleanPinyin(e.p),
                    hskLabel(e.hsk),
                    null,
                    capitalizeSentences(e.vi || ""),
                    capitalizeSentences((e.en || []).join("; ")),
                    sv,
                    e.mwr ?? null,
                    e.bwr ?? null,
                    relJson(e.tw),
                    e.b ?? null,
                ],
            );
            nC++;
        }
        await client.query("COMMIT");
        console.log(`\n✔ WROTE: update=${nU}, create=${nC}, delete=${nD}`);
    } catch (e) {
        await client.query("ROLLBACK");
        console.error("ROLLED BACK:", e.message);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
