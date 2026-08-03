/**
 * fix-import-pinyin.mjs
 * Fix pinyin (and pinyinNumeric) for vocabulary imported on 2026-08-03 whose
 * syllables got joined (e.g. "ānquánxìng" → "ān quán xìng").
 *
 * Cause: xue-hanzi `p` uses zero-width spaces (\u200b) between syllables;
 * the import's cleanPinyin deleted them instead of converting to spaces.
 * This script re-derives pinyin from the xue-hanzi source for the rows
 * imported today that currently have no space in their pinyin, and
 * recomputes + syncs the hanCharacters breakdown.
 *
 * Usage: node fix-import-pinyin.mjs [--dry]
 */
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { computeHanCharacters, syncVocabularyHanCharacters } from "./lib/hanCharacterBreakdown.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY = process.argv.includes("--dry");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const dict = JSON.parse(readFileSync(resolve(__dirname, "data", "xue-hanzi-dictionary.json"), "utf-8"));

function cleanPinyin(p) {
    return String(p || "")
        .replace(/[\u200c\u200d\u00ad]/g, "")
        .replace(/\u200b/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
function cleanPinyinNumeric(pt) {
    return String(pt || "")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/([1-5])(?=[a-zü])/g, "$1 ");
}
function normKey(s) {
    return String(s ?? "")
        .replace(/[\u200b\u200c\u200d\u00ad]/g, "")
        .replace(/\s+/g, "")
        .toLowerCase();
}

// Index xue-hanzi by (simp) and (trad)
const bySimp = new Map();
const byTrad = new Map();
for (const e of dict) {
    const s = (e.s || "").trim();
    const t = (e.t || "").trim();
    if (s) {
        if (!bySimp.has(s)) bySimp.set(s, []);
        bySimp.get(s).push(e);
    }
    if (t) {
        if (!byTrad.has(t)) byTrad.set(t, []);
        byTrad.get(t).push(e);
    }
}

function pickEntry(vocab) {
    const simp = (vocab.hanSimplified || "").trim();
    const trad = (vocab.hanTraditional || "").trim();
    const pool = [...(simp ? (bySimp.get(simp) ?? []) : []), ...(trad ? (byTrad.get(trad) ?? []) : [])];
    if (pool.length === 0) return null;
    // Prefer entry whose clean pinyin matches current (joined) form
    const cur = normKey(vocab.pinyin);
    const hit = pool.find((e) => normKey(cleanPinyin(e.p)) === cur || normKey(e.pt) === cur);
    if (hit) return hit;
    return pool[0];
}

async function main() {
    const vocabs = await prisma.vocabulary.findMany({
        where: {
            createdAt: { gte: new Date("2026-08-03T00:00:00.000Z") },
        },
        select: {
            id: true,
            hanTraditional: true,
            hanSimplified: true,
            pinyin: true,
            pinyinNumeric: true,
        },
    });
    console.log("📖 vocab imported today:", vocabs.length);

    let fixed = 0;
    let fixedNumeric = 0;
    let noSource = 0;
    const BATCH = 200;
    const updates = [];

    for (const v of vocabs) {
        const multi = (v.hanTraditional || "").length > 1;
        const hasSpace = /[\s]/.test(v.pinyin ?? "");
        if (multi && !hasSpace) {
            // pinyin joined — re-derive from source
            const e = pickEntry(v);
            if (!e) {
                noSource++;
                continue;
            }
            const newPinyin = cleanPinyin(e.p);
            const newNumeric = cleanPinyinNumeric(e.pt);
            if (!newPinyin) continue;
            updates.push({ id: v.id, pinyin: newPinyin, pinyinNumeric: newNumeric || null });
            if (newNumeric && normKey(newNumeric) !== normKey(v.pinyinNumeric)) fixedNumeric++;
            fixed++;
        }
    }

    console.log(`✅ joined pinyin to fix: ${fixed} | numeric changed: ${fixedNumeric} | no source: ${noSource}`);

    if (DRY) {
        console.log(`(DRY — no writes; ${updates.length} rows would be updated)`);
        for (const u of updates.slice(0, 8)) console.log(`  ${u.id} → ${u.pinyin} | ${u.pinyinNumeric}`);
        return;
    }

    const now = new Date();
    let done = 0;
    for (let i = 0; i < updates.length; i += BATCH) {
        const batch = updates.slice(i, i + BATCH);
        await prisma.$transaction(
            batch.map(({ id, pinyin, pinyinNumeric }) =>
                prisma.vocabulary.update({
                    where: { id },
                    data: { pinyin, pinyinNumeric, updatedAt: now },
                }),
            ),
        );
        done += batch.length;
        console.log(`  ✅ ${done}/${updates.length}`);
    }

    // Recompute + sync hanCharacters for all fixed rows (their breakdown was wrong too)
    console.log("\n🔁 recomputing hanCharacters breakdown...");
    let recomputed = 0;
    for (let i = 0; i < updates.length; i += BATCH) {
        const batch = updates.slice(i, i + BATCH);
        for (const u of batch) {
            const v = await prisma.vocabulary.findUnique({
                where: { id: u.id },
                select: {
                    id: true,
                    hanTraditional: true,
                    hanSimplified: true,
                    pinyin: true,
                    jyutping: true,
                    sinoVietnamese: true,
                },
            });
            if (!v) continue;
            const breakdown = computeHanCharacters(v);
            await prisma.vocabulary.update({
                where: { id: v.id },
                data: { hanCharacters: breakdown.length > 0 ? breakdown : null, updatedAt: now },
            });
            if (breakdown.length > 0) {
                await syncVocabularyHanCharacters(v.id, breakdown);
            }
            recomputed++;
        }
        console.log(`  🔁 ${Math.min(i + BATCH, updates.length)}/${updates.length}`);
    }
    console.log(`✔ recomputed ${recomputed} vocabularies`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
