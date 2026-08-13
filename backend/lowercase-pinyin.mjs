/**
 * lowercase-pinyin.mjs
 * Lowercase the `pinyin` column for all vocabularies (AGENTS.md 1.3: pinyin
 * must always be stored lowercase). Also recomputes the `hanCharacters`
 * breakdown JSON so per-char pinyin is lowercase, then syncs HanCharacter
 * readings (merge-only, case-insensitive).
 *
 * Usage: node lowercase-pinyin.mjs [--dry]
 */
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { computeHanCharacters, syncVocabularyHanCharacters } from "./lib/hanCharacterBreakdown.js";

const DRY = process.argv.includes("--dry");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
    const vocabs = await prisma.vocabulary.findMany({
        select: {
            id: true,
            hanTraditional: true,
            hanSimplified: true,
            pinyin: true,
            jyutping: true,
            sinoVietnamese: true,
        },
    });
    console.log("📖 total vocab:", vocabs.length);

    const changed = vocabs.filter((v) => (v.pinyin || "") !== String(v.pinyin || "").toLowerCase());
    console.log(`🔠 pinyin needs lowercasing: ${changed.length}`);

    if (DRY) {
        console.log(`(DRY — no writes; ${changed.length} rows)`);
        for (const v of changed.slice(0, 15)) {
            console.log(`  ${v.hanTraditional} | ${v.pinyin} → ${String(v.pinyin).toLowerCase()}`);
        }
        return;
    }

    const now = new Date();
    const BATCH = 200;
    let done = 0;
    for (let i = 0; i < changed.length; i += BATCH) {
        const batch = changed.slice(i, i + BATCH);
        await prisma.$transaction(
            batch.map((v) =>
                prisma.vocabulary.update({
                    where: { id: v.id },
                    data: { pinyin: String(v.pinyin).toLowerCase(), updatedAt: now },
                }),
            ),
        );
        done += batch.length;
        console.log(`  ✅ ${done}/${changed.length}`);
    }

    // Recompute + sync hanCharacters so per-char pinyin is lowercase too
    console.log("\n🔁 recomputing hanCharacters breakdown...");
    let recomputed = 0;
    for (let i = 0; i < changed.length; i += BATCH) {
        const batch = changed.slice(i, i + BATCH);
        for (const v of batch) {
            const current = await prisma.vocabulary.findUnique({
                where: { id: v.id },
                select: {
                    id: true,
                    hanTraditional: true,
                    hanSimplified: true,
                    pinyin: true,
                    jyutping: true,
                    sinoVietnamese: true,
                },
            });
            if (!current) continue;
            const breakdown = computeHanCharacters(current);
            await prisma.vocabulary.update({
                where: { id: current.id },
                data: { hanCharacters: breakdown.length > 0 ? breakdown : null, updatedAt: now },
            });
            if (breakdown.length > 0) {
                await syncVocabularyHanCharacters(current.id, breakdown);
            }
            recomputed++;
        }
        console.log(`  🔁 ${Math.min(i + BATCH, changed.length)}/${changed.length}`);
    }
    console.log(`✔ recomputed ${recomputed} vocabularies`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
