/**
 * sync-meanings-eng.mjs
 * Fill `engMeanings` on vocabulary_meanings rows by pairing CVDICT Vietnamese
 * meanings with CC-CEDICT English definitions BY INDEX (safe mode).
 *
 * Because CVDICT is translated from CC-CEDICT meaning-by-meaning, the index
 * correspondence only holds when the cleaned Vietnamese part count equals the
 * English definition count. This script ONLY updates rows when they match
 * exactly (≈89% of entries); mismatched entries (~11%) are skipped untouched.
 *
 * Matching strategy per vocabulary:
 *   1. Find the xue-hanzi dictionary entry (by han + preferred pinyin reading).
 *   2. Split its `vi` by "/", clean each part the same way the original
 *      sync-vocab-meanings-rows.mjs did (remove LT:/CL:/pinyin brackets, noise,
 *      dedupe by token) → cleanedParts.
 *   3. Only when cleanedParts.length === en.length → pair cleanedParts[i] ↔ en[i].
 *   4. For each DB vocabulary_meanings row (ordered by position) assign en[i]:
 *      - prefer exact position match (text must match too);
 *      - else unique text-token match;
 *      - otherwise skip (never guess / never write wrong English).
 *
 * Usage: node sync-meanings-eng.mjs [--dry]
 */
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY = process.argv.includes("--dry");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const dict = JSON.parse(readFileSync(resolve(__dirname, "data", "xue-hanzi-dictionary.json"), "utf-8"));

// ── Cleaning helpers (mirror sync-vocab-meanings-rows.mjs) ──
function cleanMeaning(raw) {
    let s = String(raw || "").trim();
    s = s.replace(/^LT:\s*/i, "");
    s = s.replace(/LT:.*$/i, "").trim();
    s = s.replace(/^CL:\s*/i, "");
    s = s.replace(/\[[^\]]*\]/g, "").trim();
    s = s.replace(/\|\s*/g, "").trim();
    s = s.replace(/\s+/g, " ");
    return s;
}
const PURE_HANZI_ONLY = /^[\s\u3400-\u4dbf\u4e00-\u9fff,、＿_]+$/;
function token(s) {
    return String(s || "")
        .toLowerCase()
        .replace(/[^a-zà-ỹ0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
function isNoise(part) {
    const p = cleanMeaning(part);
    if (!p) return true;
    if (PURE_HANZI_ONLY.test(p)) return true;
    const hasZhOrVi = /[a-zà-ỹ]/.test(p);
    const hasHan = /[\u3400-\u4dbf\u4e00-\u9fff]/.test(p);
    if (!hasZhOrVi && !hasHan) return true;
    return false;
}
/**
 * Index-aligned pairs for a CVDICT `vi` string vs CC-CEDICT `en` array.
 * The alignment gate is the RAW part count (vi split by "/") — this is the
 * true CVDICT↔CC-CEDICT correspondence. Returns null when counts differ
 * (genuine translation mismatch → skip entirely, never guess).
 * Returns array parallel to raw parts: cleaned text (null if noise removed),
 * so non-null entries in order map 1:1 to the DB meaning rows.
 */
function buildIndexPairs(viRaw, en) {
    const rawParts = String(viRaw || "")
        .split("/")
        .map((p) => p.trim())
        .filter(Boolean);
    if (rawParts.length !== (Array.isArray(en) ? en.length : 0)) return null;
    const seen = new Set();
    const pairs = [];
    for (let i = 0; i < rawParts.length; i++) {
        if (isNoise(rawParts[i])) {
            pairs.push(null); // keeps raw index aligned to en[i]
            continue;
        }
        const cleaned = cleanMeaning(rawParts[i]);
        if (seen.has(token(cleaned))) {
            pairs.push(null); // dedupe — keep alignment, only first writes
            continue;
        }
        seen.add(token(cleaned));
        pairs.push(cleaned);
    }
    return pairs;
}

// ── Index xue-hanzi entries ──
const byTrad = new Map();
const bySimp = new Map();
for (const e of dict) {
    const t = (e.t || "").trim();
    const s = (e.s || "").trim();
    if (t) {
        if (!byTrad.has(t)) byTrad.set(t, []);
        byTrad.get(t).push(e);
    }
    if (s) {
        if (!bySimp.has(s)) bySimp.set(s, []);
        bySimp.get(s).push(e);
    }
}
function normKey(s) {
    return String(s ?? "")
        .replace(/\s+/g, "")
        .toLowerCase();
}
/** Best entry for a vocab (reading-preferred, same as metadata sync). */
function pickEntry(vocab) {
    const trad = (vocab.hanTraditional || "").trim();
    const simp = (vocab.hanSimplified || "").trim();
    const dbPyN = normKey(vocab.pinyinNumeric);
    const dbPy = normKey(vocab.pinyin);
    const poolSet = new Map();
    const add = (arr) => {
        for (const e of arr || []) poolSet.set(e, (poolSet.get(e) ?? 0) + 1);
    };
    if (trad) add(byTrad.get(trad));
    if (simp) add(bySimp.get(simp));
    const pool = [...poolSet.keys()];
    if (pool.length === 0) return null;
    if (dbPyN) {
        const hit = pool.find((e) => normKey(e.pt) === dbPyN);
        if (hit) return hit;
    }
    if (dbPy) {
        const hit = pool.find((e) => normKey(e.sp) === dbPy);
        if (hit) return hit;
    }
    if (pool.length === 1) return pool[0];
    const strong = pool.filter((e) => poolSet.get(e) >= 2);
    if (strong.length === 1) return strong[0];
    return pool[0];
}

async function main() {
    const vocabs = await prisma.vocabulary.findMany({
        where: { vocabularyMeanings: { some: {} } },
        select: {
            id: true,
            hanTraditional: true,
            hanSimplified: true,
            pinyin: true,
            pinyinNumeric: true,
            vocabularyMeanings: {
                orderBy: { position: "asc" },
                select: { id: true, position: true, vietMeanings: true, engMeanings: true },
            },
        },
        orderBy: { hanTraditional: "asc" },
    });
    console.log("📖 vocabularies with meaning rows:", vocabs.length);

    let withSource = 0;
    let exactIndex = 0;
    let indexMismatch = 0;
    let rowsToUpdate = 0;
    let rowsMatched = 0;
    let rowsSkipped = 0;
    const samples = [];

    for (const v of vocabs) {
        const e = pickEntry(v);
        if (!e) continue;
        withSource++;

        const en = Array.isArray(e.en) ? e.en : [];
        const pairs = buildIndexPairs(e.vi, en);
        // SAFE MODE: null = raw count mismatch → skip entirely, never guess
        if (pairs === null) {
            indexMismatch++;
            continue;
        }
        exactIndex++;

        // DB meaning rows correspond to the non-null cleaned parts, in order.
        const nonNullIdx = pairs.map((p, i) => (p !== null ? i : -1)).filter((i) => i >= 0);
        const rows = v.vocabularyMeanings;
        let rowCount = 0;
        for (let r = 0; r < rows.length; r++) {
            const row = rows[r];
            const rowToken = token(row.vietMeanings);
            const idx = r < nonNullIdx.length ? nonNullIdx[r] : -1;
            let enText = null;

            // 1) aligned position (clean part at idx matches row text)
            if (idx >= 0 && token(pairs[idx]) === rowToken) {
                enText = en[idx];
            } else {
                // 2) unique text-token match anywhere in the aligned pairs
                const matches = [];
                for (let j = 0; j < pairs.length; j++) {
                    if (pairs[j] !== null && token(pairs[j]) === rowToken) matches.push(j);
                }
                if (matches.length === 1) enText = en[matches[0]];
            }

            if (!enText) {
                rowsSkipped++;
                continue;
            }
            rowCount++;
            rowsMatched++;
            if (!DRY) {
                await prisma.vocabularyMeaning.update({
                    where: { id: row.id },
                    data: { engMeanings: enText, updatedAt: new Date() },
                });
            }
            if (samples.length < 8 && rowCount <= 2) {
                samples.push({ han: v.hanTraditional, position: row.position, vi: row.vietMeanings, en: enText });
            }
        }
        rowsToUpdate += rowCount;
    }

    console.log(
        `✅ with source: ${withSource} | exact index: ${exactIndex} | index mismatch (skipped): ${indexMismatch}`,
    );
    console.log(
        `rows to fill: ${rowsMatched} | rows skipped: ${rowsSkipped} ${DRY ? "(DRY — no writes)" : "(written)"}`,
    );

    console.log("\n-- samples (vi → en) --");
    for (const s of samples) console.log(`  ${s.han} [${s.position}] ${s.vi}  →  ${s.en}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
