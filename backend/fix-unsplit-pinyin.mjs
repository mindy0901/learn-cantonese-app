/**
 * Fix unsplit pinyin in vocabularies table.
 * Uses the updated splitPinyin function that handles adjacent tone-marked vowels.
 */
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { splitPinyin } from "./lib/pinyinSplit.js";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
    console.log("🔍 Finding unsplit pinyin entries...\n");

    // Find all HSK vocab with pinyin
    const all = await prisma.vocabulary.findMany({
        where: {
            hskLevel: { not: null, not: "" },
            pinyin: { not: null, not: "" },
        },
        select: {
            id: true,
            hanTraditional: true,
            pinyin: true,
        },
    });
    console.log(`  → ${all.length} total HSK entries with pinyin\n`);

    // Find entries where splitPinyin produces a different result
    const toFix = [];
    for (const v of all) {
        const fixed = splitPinyin(v.pinyin);
        if (fixed !== v.pinyin) {
            toFix.push({ id: v.id, hanTraditional: v.hanTraditional, oldPinyin: v.pinyin, newPinyin: fixed });
        }
    }

    console.log(`  → ${toFix.length} entries need fixing\n`);

    // Show what will be changed
    for (const entry of toFix.slice(0, 30)) {
        console.log(`  ${entry.hanTraditional}: "${entry.oldPinyin}" → "${entry.newPinyin}"`);
    }
    if (toFix.length > 30) {
        console.log(`  ... and ${toFix.length - 30} more`);
    }

    console.log(`\n🔧 Applying fixes...\n`);

    let fixed = 0;
    const BATCH = 100;
    for (let i = 0; i < toFix.length; i += BATCH) {
        const batch = toFix.slice(i, i + BATCH);
        for (const entry of batch) {
            try {
                await prisma.vocabulary.update({
                    where: { id: entry.id },
                    data: { pinyin: entry.newPinyin, updatedAt: new Date().toISOString() },
                });
                fixed++;
            } catch (e) {
                console.error(`  ❌ Failed: ${entry.hanTraditional} - ${e.message}`);
            }
        }
        console.log(`  ... ${Math.min(i + BATCH, toFix.length)}/${toFix.length}`);
    }

    console.log(`\n✅ Fixed ${fixed} pinyin entries`);

    // Also manually fix known broken entry
    const manualFix = {
        hanTraditional: "喜怒哀樂",
        oldPinyin: "xǐn ùāi lè",
        newPinyin: "xǐ nù āi lè",
    };
    try {
        const entry = await prisma.vocabulary.findFirst({
            where: { hanTraditional: manualFix.hanTraditional, pinyin: manualFix.oldPinyin },
        });
        if (entry) {
            await prisma.vocabulary.update({
                where: { id: entry.id },
                data: { pinyin: manualFix.newPinyin, updatedAt: new Date().toISOString() },
            });
            console.log(
                `\n🔧 Manual fix: ${manualFix.hanTraditional}: "${manualFix.oldPinyin}" → "${manualFix.newPinyin}"`,
            );
        }
    } catch (e) {
        console.error(`  ❌ Manual fix failed: ${e.message}`);
    }

    // Fix 忍飢挨餓
    const manualFix2 = {
        hanTraditional: "忍飢挨餓",
        oldPinyin: "rěn jīái è",
        newPinyin: "rěn jī ái è",
    };
    try {
        const entry = await prisma.vocabulary.findFirst({
            where: { hanTraditional: manualFix2.hanTraditional, pinyin: manualFix2.oldPinyin },
        });
        if (entry) {
            await prisma.vocabulary.update({
                where: { id: entry.id },
                data: { pinyin: manualFix2.newPinyin, updatedAt: new Date().toISOString() },
            });
            console.log(
                `🔧 Manual fix: ${manualFix2.hanTraditional}: "${manualFix2.oldPinyin}" → "${manualFix2.newPinyin}"`,
            );
        }
    } catch (e) {
        console.error(`  ❌ Manual fix failed: ${e.message}`);
    }

    // Also fix entries that STILL have no spaces at all (single word, multi-char, pinyin has no spaces)
    // e.g. "wán", "kòng", "gu", "xiàn" for erhua or incomplete entries
    // These will be caught by splitPinyin if they have tone marks

    console.log("\n✅ All done!");
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
