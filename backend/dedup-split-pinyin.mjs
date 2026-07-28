/**
 * dedup-split-pinyin.mjs — Dedup vocab by splitting pinyin first, then matching
 *
 * Logic:
 * 1. For every vocab entry, compute splitPinyin + normalized version
 * 2. Group by (hanTraditional, hanSimplified, normalizedSplitPinyin)
 * 3. For groups with >1, keep the one with English, delete others
 * 4. Also fix pinyin spacing (split format) for remaining entries
 */

import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { splitPinyin } from "./lib/pinyinSplit.js";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

function normPinyin(p) {
    // Split, remove spaces, lowercase
    const split = splitPinyin(p || "");
    return split.replace(/\s+/g, "").toLowerCase();
}

async function main() {
    console.log("🔍 Checking duplicates with split-pinyin normalization...\n");

    // ── Load all HSK vocab ──
    console.log("[1/3] Loading vocab...");
    const all = await prisma.vocabulary.findMany({
        where: { hskLevel: { not: null, not: "" } },
        select: {
            id: true,
            hanTraditional: true,
            hanSimplified: true,
            pinyin: true,
            engMeanings: true,
            hskLevel: true,
        },
    });
    console.log(`  → ${all.length} entries`);

    // ── Group by (trad, simp, normPinyin) ──
    console.log("[2/3] Computing split-pinyin groups...");
    const groups = new Map();
    for (const v of all) {
        const np = normPinyin(v.pinyin);
        const key = `${v.hanTraditional}|${v.hanSimplified || ""}|${np}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(v);
    }

    // Find duplicate groups
    const dupGroups = [...groups.values()].filter((g) => g.length > 1);
    console.log(`  → ${dupGroups.length} duplicate groups`);

    // Show sample
    for (const g of dupGroups.slice(0, 5)) {
        console.log(`    ${g[0].hanTraditional} (${g[0].hanSimplified || "-"}): ${g.length} rows`);
        for (const r of g) {
            console.log(`      ${r.pinyin} | ${(r.engMeanings || "-").substring(0, 40)} | ${r.hskLevel}`);
        }
    }

    // ── Delete duplicates: keep English, remove no-English ──
    console.log("[3/3] Deleting duplicates...");
    let deleted = 0;
    const toDelete = [];

    for (const g of dupGroups) {
        const withEng = g.filter((r) => r.engMeanings && r.engMeanings.trim());
        const withoutEng = g.filter((r) => !r.engMeanings || !r.engMeanings.trim());

        if (withEng.length > 0 && withoutEng.length > 0) {
            // Delete all without English, keep all with English
            for (const r of withoutEng) toDelete.push(r.id);
        } else if (withEng.length > 1) {
            // Multiple with English: keep the one with longest engMeanings
            withEng.sort((a, b) => (b.engMeanings || "").length - (a.engMeanings || "").length);
            for (let i = 1; i < withEng.length; i++) toDelete.push(withEng[i].id);
            if (withoutEng.length > 0) for (const r of withoutEng) toDelete.push(r.id);
        } else {
            // All without English or all equal: keep first, delete rest
            for (let i = 1; i < g.length; i++) toDelete.push(g[i].id);
        }
    }

    console.log(`  → ${toDelete.length} rows to delete`);

    // Delete in batches
    const BATCH = 100;
    for (let i = 0; i < toDelete.length; i += BATCH) {
        const batch = toDelete.slice(i, i + BATCH);
        await prisma.vocabulary.deleteMany({ where: { id: { in: batch } } });
        deleted += batch.length;
    }

    console.log(`  → Deleted ${deleted}`);

    // Also fix pinyin formatting: update unsplit → split
    console.log("\n  Fixing pinyin spacing (unsplit → split)...");
    let fixed = 0;
    const toFix = all.filter((v) => {
        if (!v.pinyin) return false;
        const split = splitPinyin(v.pinyin);
        return split !== v.pinyin; // different after splitting
    });

    for (let i = 0; i < toFix.length; i += BATCH) {
        const batch = toFix.slice(i, i + BATCH);
        for (const v of batch) {
            try {
                const split = splitPinyin(v.pinyin || "");
                if (split && split !== v.pinyin) {
                    await prisma.vocabulary.update({
                        where: { id: v.id },
                        data: { pinyin: split, updatedAt: new Date().toISOString() },
                    });
                    fixed++;
                }
            } catch (e) {
                // might have been deleted
            }
        }
        if (i % 1000 === 0) console.log(`    ... ${i}/${toFix.length}`);
    }
    console.log(`  → Fixed ${fixed} pinyin entries`);

    // ── Final stats ──
    const total = await prisma.$queryRawUnsafe("SELECT COUNT(*) as cnt FROM vocabularies");
    const eng = await prisma.$queryRawUnsafe(
        "SELECT COUNT(*) as cnt FROM vocabularies WHERE eng_meanings IS NOT NULL AND eng_meanings != ''",
    );
    console.log(`\n  Final: ${total[0].cnt} total | ${eng[0].cnt} with English`);
    console.log("✅ Done!");
}

main()
    .catch((e) => {
        console.error("❌", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
        await pool.end();
    });
