/**
 * import-cantowords-popular.mjs
 * Import popular Cantonese words (ranked by words.hk frequency) as custom
 * vocabularies, sourcing ALL word data from backend/data/wordshk.json
 * (han forms, jyutping, English + Cantonese meanings, and example sentences).
 *
 * Sources:
 *   - cantowords-freq-words.json  → word → rank (which words are "popular")
 *   - wordshk.json                → full word data (t, s, jp, defs[].en/yue/egs)
 *
 * What it writes per new word:
 *   - vocabularies row (hanTraditional, hanSimplified, jyutping, eng_meanings)
 *   - vocabulary_meanings rows (one per wordshk def, engMeanings filled)
 *   - vocabulary_examples rows (attached to each meaning, han+jyutping+en)
 *   - pinyin / viet_meanings left empty (wordshk has no pinyin/Vietnamese)
 *
 * SAFETY:
 *   - Only INSERTs NEW vocabularies (skips existing by han+jyutping).
 *   - Never overwrites / deletes existing rows.
 *   - Default TOP_N = 5000 popular words. Pass TOP_N env or an arg to change.
 *   - --dry flag: only previews counts, does NOT write to DB.
 *
 * Usage: node import-cantowords-popular.mjs [--dry] [TOP_N]
 */
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY = process.argv.includes("--dry");
const TOP_N = Number(process.argv.find((a) => /^\d+$/.test(a)) || process.env.TOP_N || 5000);

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const HAN_RE = /[\u3400-\u4dbf\u4e00-\u9fff]/;
const LATIN_OR_DIGIT_RE = /[a-zA-Z0-9%]/;

/** words.hk POS (Chinese) → Vietnamese category label (group in meanings). */
const POS_MAP = {
    名詞: "Danh từ",
    動詞: "Động từ",
    形容詞: "Tính từ",
    副詞: "Trạng từ",
    語句: "Cụm từ",
    語素: "Hình vị",
    量詞: "Lượng từ",
    區別詞: "Tính từ",
    詞綴: "Phụ tố",
    代詞: "Đại từ",
    連詞: "Liên từ",
    助詞: "Trợ từ",
    擬聲詞: "Từ tượng thanh",
    介詞: "Giới từ",
    數詞: "Số từ",
    感嘆詞: "Thán từ",
    方位詞: "Định vị từ",
    其他: "Khác",
};
function posCategory(pos) {
    const list = Array.isArray(pos) ? pos : [];
    return list.length ? POS_MAP[list[0]] || list[0] || "" : "";
}

function normJyutping(jp) {
    return String(jp ?? "")
        .replace(/\s+/g, "")
        .toLowerCase();
}

function stableUUID(trad, simp, pinyin, jyutping) {
    const key = `${trad || ""}|${simp || ""}|${(pinyin || "").replace(/\s+/g, "").toLowerCase()}|${normJyutping(jyutping)}`;
    return crypto
        .createHash("md5")
        .update(key)
        .digest("hex")
        .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
}

/** Deterministic UUID for nested meaning/example rows (idempotent re-runs). */
function stableSubUUID(...parts) {
    const key = parts.join("|");
    return crypto
        .createHash("md5")
        .update(key)
        .digest("hex")
        .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
}

async function main() {
    console.log(`📚 Importing top ${TOP_N} popular Cantonese words from wordshk (dry=${DRY})\n`);

    // ── 1. Load frequency + wordshk data ──
    const freq = JSON.parse(readFileSync(resolve(__dirname, "data", "cantowords-freq-words.json"), "utf-8"));
    const wordshk = JSON.parse(readFileSync(resolve(__dirname, "data", "wordshk.json"), "utf-8"));
    // index by written form → ALL records (each record = one reading/entry)
    const wsByTrad = new Map();
    const wsBySimp = new Map();
    for (const r of wordshk) {
        if (r.t) {
            if (!wsByTrad.has(r.t)) wsByTrad.set(r.t, []);
            wsByTrad.get(r.t).push(r);
        }
        if (r.s) {
            if (!wsBySimp.has(r.s)) wsBySimp.set(r.s, []);
            wsBySimp.get(r.s).push(r);
        }
    }
    console.log(`  wordshk records: ${wordshk.length} (${wsByTrad.size} trad, ${wsBySimp.size} simp)\n`);

    // ── 2. Candidate list: popular Han words ──
    // cantowords-freq-words.json maps word → frequency COUNT (higher = more
    // frequent), so sort DESCENDING to take the most common words first.
    const candidates = [];
    for (const [word, count] of Object.entries(freq)) {
        if (!HAN_RE.test(word) || LATIN_OR_DIGIT_RE.test(word)) continue;
        candidates.push({ word, rank: Number(count) });
    }
    candidates.sort((a, b) => b.rank - a.rank || a.word.length - b.word.length);
    const top = candidates.slice(0, TOP_N);
    console.log(`  popular candidates (Han-only): ${candidates.length}, taking top ${TOP_N} by frequency (desc)`);

    // ── 3. Existing DB keys to avoid duplicates ──
    console.log("[1/3] Loading existing vocabularies...");
    const existing = await prisma.vocabulary.findMany({
        select: { hanTraditional: true, hanSimplified: true, jyutping: true },
    });
    const existingKeys = new Set();
    for (const v of existing) {
        const trad = (v.hanTraditional || "").trim();
        const simp = (v.hanSimplified || "").trim();
        const jp = normJyutping(v.jyutping);
        existingKeys.add(`${trad}|${simp}|${jp}`);
        if (trad && trad !== simp) existingKeys.add(`${simp}|${trad}|${jp}`);
    }
    console.log(`  ${existing.length} existing rows\n`);

    // ── 4. Resolve fields from wordshk (one row PER reading) ──
    console.log("[2/3] Resolving from wordshk.json...");
    const rows = [];
    let noWordshk = 0,
        skippedDup = 0;
    for (const { word, rank } of top) {
        // All records for this written form (each reading → a separate word)
        const records = wsByTrad.get(word) || wsBySimp.get(word);
        if (!records || records.length === 0) {
            noWordshk++;
            continue;
        }
        for (const rec of records) {
            const jp = (rec.jp || "").trim();
            if (!jp) continue;
            const trad = rec.t;
            // single-form char (simp === trad) → store hanSimplified as NULL
            const simp = rec.s && rec.s !== rec.t ? rec.s : null;
            const eng = (rec.defs || [])
                .map((d) => d.en)
                .filter(Boolean)
                .join("; ");
            const category = posCategory(rec.pos);
            const defs = (rec.defs || []).map((d) => ({
                category,
                yue: d.yue || "",
                en: d.en || "",
                egs: (d.egs || []).map((eg) => ({
                    yue: eg.yue || "",
                    jp: eg.jp || "",
                    en: eg.en || "",
                })),
            }));
            const id = stableUUID(trad, simp, null, jp);
            // key uses "" for single-form simp (matches existing rows with NULL simp)
            const key = `${trad}|${simp || ""}|${normJyutping(jp)}`;
            if (existingKeys.has(key)) {
                skippedDup++;
                continue;
            }
            rows.push({ id, trad, simp, jp, eng, defs, category, rank });
        }
    }
    console.log(`  → ${rows.length} new rows (skipped ${skippedDup} duplicates, ${noWordshk} not in wordshk)\n`);

    // ── 5. Insert ──
    console.log("[3/3] Inserting...");
    if (DRY) {
        console.log(`  (dry run — ${rows.length} rows would be inserted, not written)`);
        for (const r of rows.slice(0, 8)) {
            console.log(
                `    ${r.trad}${r.simp ? " / " + r.simp : ""} | ${r.jp} | ${(r.eng || "-").slice(0, 50)} | ${r.defs.length} def, ${r.defs.reduce((a, d) => a + d.egs.length, 0)} eg`,
            );
        }
        if (rows.length > 8) console.log(`    ... and ${rows.length - 8} more`);
    } else {
        const now = new Date().toISOString();
        // Build parallel arrays per table; inserted via unnest() so every column
        // has an explicit type cast (avoids PG "could not determine data type").
        const vIds = [],
            vTrad = [],
            vSimp = [],
            vPy = [],
            vJp = [],
            vVi = [],
            vEn = [];
        const mIds = [],
            mVid = [],
            mCat = [],
            mVi = [],
            mEn = [],
            mPos = [];
        const eIds = [],
            eVid = [],
            eMid = [],
            eHan = [],
            eJp = [],
            ePy = [],
            eVi = [],
            eEn = [],
            ePos = [];

        for (const r of rows) {
            vIds.push(r.id);
            vTrad.push(r.trad);
            vSimp.push(r.simp);
            vPy.push(null);
            vJp.push(r.jp);
            vVi.push(null);
            vEn.push(r.eng || null);

            let pos = 0;
            for (const d of r.defs) {
                const mid = stableSubUUID(r.id, "m", pos);
                mIds.push(mid);
                mVid.push(r.id);
                mCat.push(d.category || null);
                mVi.push(null);
                mEn.push(d.en || null);
                mPos.push(pos++);

                let epos = 0;
                for (const eg of d.egs) {
                    eIds.push(stableSubUUID(r.id, mid, "e", epos));
                    eVid.push(r.id);
                    eMid.push(mid);
                    eHan.push(eg.yue || null);
                    eJp.push(eg.jp || null);
                    ePy.push(null);
                    eVi.push(null);
                    eEn.push(eg.en || null);
                    ePos.push(epos++);
                }
            }
        }

        const nowArr = (n) => Array(n).fill(now);
        const nV = await prisma.$executeRawUnsafe(
            `INSERT INTO vocabularies (id, han_traditional, han_simplified, pinyin, jyutping, viet_meanings, eng_meanings, created_at, updated_at)
             SELECT * FROM unnest(
               $1::uuid[], $2::varchar[], $3::varchar[], $4::varchar[], $5::varchar[],
               $6::varchar[], $7::varchar[], $8::timestamp[], $9::timestamp[]
             ) ON CONFLICT (id) DO NOTHING`,
            vIds,
            vTrad,
            vSimp,
            vPy,
            vJp,
            vVi,
            vEn,
            nowArr(vIds.length),
            nowArr(vIds.length),
        );
        const nM = await prisma.$executeRawUnsafe(
            `INSERT INTO vocabulary_meanings (id, vocabulary_id, category, viet_meanings, eng_meanings, position, created_at, updated_at)
             SELECT * FROM unnest(
               $1::uuid[], $2::uuid[], $3::varchar[], $4::varchar[], $5::varchar[],
               $6::smallint[], $7::timestamp[], $8::timestamp[]
             ) ON CONFLICT (id) DO NOTHING`,
            mIds,
            mVid,
            mCat,
            mVi,
            mEn,
            mPos,
            nowArr(mIds.length),
            nowArr(mIds.length),
        );
        const nE = await prisma.$executeRawUnsafe(
            `INSERT INTO vocabulary_examples (id, vocabulary_id, meaning_id, han_example, jyutping_example, pinyin_example, viet_examples, eng_examples, position, created_at, updated_at)
             SELECT * FROM unnest(
               $1::uuid[], $2::uuid[], $3::uuid[], $4::varchar[], $5::varchar[],
               $6::varchar[], $7::varchar[], $8::varchar[], $9::smallint[],
               $10::timestamp[], $11::timestamp[]
             ) ON CONFLICT (id) DO NOTHING`,
            eIds,
            eVid,
            eMid,
            eHan,
            eJp,
            ePy,
            eVi,
            eEn,
            ePos,
            nowArr(eIds.length),
            nowArr(eIds.length),
        );
        console.log(`  ✅ inserted ${nV} vocabularies, ${nM} meanings, ${nE} examples`);
    }

    const total = await prisma.$queryRawUnsafe("SELECT COUNT(*) as cnt FROM vocabularies");
    console.log(`\n  Total vocabularies now: ${total[0].cnt}`);
    console.log(DRY ? "  (dry run — nothing written)" : "  ✅ Done!");
}

main().catch((e) => {
    console.error("❌", e);
    process.exit(1);
});
