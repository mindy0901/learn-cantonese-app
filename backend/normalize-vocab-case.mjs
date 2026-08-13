/**
 * normalize-vocab-case.mjs
 * Normalize case across the DB to match AGENTS.md §1.3 rules:
 *   - viet_meanings / eng_meanings → capitalize first letter of each sentence
 *     (capitalizeSentences — no title-casing per word)
 *   - pinyin / jyutping → lowercase
 *   - sino_vietnamese → uppercase (per-reading title case via normalizeSinoVietnameseValue)
 *
 * Applies to: vocabularies, vocabulary_meanings, han_characters.
 *
 * Usage:
 *   node normalize-vocab-case.mjs --dry    # preview only (no writes)
 *   node normalize-vocab-case.mjs           # write changes
 */
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { normalizeSinoVietnameseValue } from "./lib/sinoVietnameseReadings.js";

const DRY = process.argv.includes("--dry");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

/** Capitalize first letter of the whole string and of each sentence (after . ! ? ; /). */
function capitalizeSentences(value) {
    const s = String(value ?? "").trim();
    if (!s) return s;
    return s.replace(/(^|[.!?;/]\s*)(\p{L})/gu, (_m, pre, ch) => pre + ch.toLocaleUpperCase("vi"));
}

/** Same as capitalizeSentences but also after `,` (used for engMeanings). */
function capitalizeEng(value) {
    const s = String(value ?? "").trim();
    if (!s) return s;
    return s.replace(/(^|[.,!?;/]\s*)(\p{L})/gu, (_m, pre, ch) => pre + ch.toLocaleUpperCase("vi"));
}

async function main() {
    // 1) vocabularies
    const vocabs = await prisma.vocabulary.findMany({
        select: { id: true, pinyin: true, jyutping: true, vietMeanings: true, engMeanings: true, sinoVietnamese: true },
    });
    let vChanged = 0;
    for (const v of vocabs) {
        const patch = {};
        if (v.pinyin != null && v.pinyin !== "") {
            const p = v.pinyin.trim().toLowerCase();
            if (p !== v.pinyin) patch.pinyin = p;
        }
        if (v.jyutping != null && v.jyutping !== "") {
            const j = v.jyutping.trim().toLowerCase();
            if (j !== v.jyutping) patch.jyutping = j;
        }
        const vm = capitalizeSentences(v.vietMeanings);
        if (v.vietMeanings != null && v.vietMeanings !== "" && vm !== v.vietMeanings) patch.vietMeanings = vm;
        const em = capitalizeEng(v.engMeanings);
        if (v.engMeanings != null && v.engMeanings !== "" && em !== v.engMeanings) patch.engMeanings = em;
        if (v.sinoVietnamese != null && v.sinoVietnamese !== "") {
            const sv = normalizeSinoVietnameseValue(v.sinoVietnamese);
            if (sv !== v.sinoVietnamese) patch.sinoVietnamese = sv;
        }
        if (Object.keys(patch).length === 0) continue;
        vChanged++;
        if (!DRY) await prisma.vocabulary.update({ where: { id: v.id }, data: patch });
    }
    console.log(`vocabularies: ${vChanged}/${vocabs.length} to change${DRY ? " (dry)" : ""}`);

    // 2) vocabulary_meanings
    const meanings = await prisma.vocabularyMeaning.findMany({
        select: { id: true, vietMeanings: true, engMeanings: true },
    });
    let mChanged = 0;
    for (const m of meanings) {
        const patch = {};
        const vm = capitalizeSentences(m.vietMeanings);
        if (m.vietMeanings != null && m.vietMeanings !== "" && vm !== m.vietMeanings) patch.vietMeanings = vm;
        const em = capitalizeEng(m.engMeanings);
        if (m.engMeanings != null && m.engMeanings !== "" && em !== m.engMeanings) patch.engMeanings = em;
        if (Object.keys(patch).length === 0) continue;
        mChanged++;
        if (!DRY) await prisma.vocabularyMeaning.update({ where: { id: m.id }, data: patch });
    }
    console.log(`vocabulary_meanings: ${mChanged}/${meanings.length} to change${DRY ? " (dry)" : ""}`);

    // 3) han_characters
    const chars = await prisma.hanCharacter.findMany({
        select: { id: true, pinyin: true, jyutping: true, sinoVietnamese: true },
    });
    let cChanged = 0;
    const sameArr = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    const lower = (arr) => (Array.isArray(arr) ? arr.map((x) => String(x).toLowerCase()) : arr);
    const upperSV = (arr) => (Array.isArray(arr) ? arr.map((x) => normalizeSinoVietnameseValue(x)) : arr);
    for (const c of chars) {
        const patch = {};
        const py = lower(c.pinyin);
        const jp = lower(c.jyutping);
        const sv = upperSV(c.sinoVietnamese);
        if (!sameArr(py, c.pinyin)) patch.pinyin = py;
        if (!sameArr(jp, c.jyutping)) patch.jyutping = jp;
        if (!sameArr(sv, c.sinoVietnamese)) patch.sinoVietnamese = sv;
        if (Object.keys(patch).length === 0) continue;
        cChanged++;
        if (!DRY) await prisma.hanCharacter.update({ where: { id: c.id }, data: patch });
    }
    console.log(`han_characters: ${cChanged}/${chars.length} to change${DRY ? " (dry)" : ""}`);

    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
