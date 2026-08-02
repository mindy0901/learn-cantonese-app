/**
 * sync-sv-from-phienam.mjs
 * Sync Sino-Vietnamese from phienam.txt to han_characters, then to vocabularies
 */

import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { readFileSync } from "fs";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const HAN = /[\u3400-\u4dbf\u4e00-\u9fff]/;

async function main() {
    console.log("🔄 Syncing Sino-Vietnamese from phienam.txt\n");

    // ── Load phienam.txt ──
    console.log("[1/4] Loading phienam.txt...");
    const raw = readFileSync("data/phienam.txt", "utf-8");
    const lines = raw.split("\n").filter(Boolean);
    
    const svByChar = new Map();
    for (const line of lines) {
        const [char, sv] = line.split("=");
        if (char && sv && HAN.test(char)) {
            svByChar.set(char.trim(), sv.trim());
        }
    }
    console.log(`  → ${svByChar.size} characters with SV`);

    // ── Update han_characters ──
    console.log("[2/4] Updating han_characters...");
    const hanChars = await prisma.hanCharacter.findMany({
        select: { id: true, hanTraditional: true, hanSimplified: true, sinoVietnamese: true },
    });

    let hanUpdated = 0;
    for (const h of hanChars) {
        const currentSv = h.sinoVietnamese?.[0] ?? "";
        if (currentSv) continue; // Already has SV

        const char = h.hanSimplified || h.hanTraditional;
        const sv = svByChar.get(char);
        if (sv) {
            await prisma.hanCharacter.update({
                where: { id: h.id },
                data: { sinoVietnamese: [sv] },
            });
            hanUpdated++;
        }
    }
    console.log(`  → ${hanUpdated} han_characters updated`);

    // ── Rebuild svByChar from updated han_characters ──
    console.log("[3/4] Rebuilding character map...");
    const updatedHanChars = await prisma.hanCharacter.findMany({
        where: { sinoVietnamese: { isEmpty: false } },
        select: { hanTraditional: true, hanSimplified: true, sinoVietnamese: true },
    });

    const svMap = new Map();
    for (const h of updatedHanChars) {
        const sv = h.sinoVietnamese?.[0] ?? "";
        if (!sv) continue;
        if (h.hanTraditional) svMap.set(h.hanTraditional, sv);
        if (h.hanSimplified && h.hanSimplified !== h.hanTraditional) {
            svMap.set(h.hanSimplified, sv);
        }
    }
    console.log(`  → ${svMap.size} character mappings`);

    // ── Update vocabularies ──
    console.log("[4/4] Updating vocabularies...");
    const vocabs = await prisma.vocabulary.findMany({
        where: {
            OR: [
                { sinoVietnamese: null },
                { sinoVietnamese: "" },
            ],
        },
        select: { id: true, hanTraditional: true, hanSimplified: true },
    });

    console.log(`  → ${vocabs.length} vocabularies missing SV`);

    let vocabUpdated = 0;
    let skipped = 0;

    for (const vocab of vocabs) {
        const trad = vocab.hanTraditional ?? "";
        const chars = [...trad];
        const svParts = [];
        let allFound = true;

        for (const ch of chars) {
            if (!HAN.test(ch)) continue;
            const sv = svMap.get(ch);
            if (sv) {
                svParts.push(sv);
            } else {
                allFound = false;
                break;
            }
        }

        if (!allFound || svParts.length === 0) {
            skipped++;
            continue;
        }

        await prisma.vocabulary.update({
            where: { id: vocab.id },
            data: { sinoVietnamese: svParts.join(" ") },
        });
        vocabUpdated++;
    }

    // ── Stats ──
    const stats = await prisma.$queryRawUnsafe(
        "SELECT COUNT(*) as t, COUNT(*) FILTER (WHERE sino_vietnamese IS NOT NULL AND sino_vietnamese != '') as s FROM vocabularies",
    );
    
    console.log(`\n✅ Done!`);
    console.log(`  Han characters updated: ${hanUpdated}`);
    console.log(`  Vocabularies updated: ${vocabUpdated}`);
    console.log(`  Vocabularies skipped: ${skipped}`);
    console.log(`  SV coverage: ${stats[0].s} / ${stats[0].t}`);
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
