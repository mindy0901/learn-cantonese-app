/**
 * sync-sino-vietnamese.mjs — Update sino_vietnamese from vocabularies.json
 * Match by HÁN TỰ (character) only — pinyin/jyutping is irrelevant.
 */

import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { readFileSync } from "fs";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
    console.log("🔄 Syncing Sino-Vietnamese by HÁN TỰ only\n");

    // ── Load vocabularies.json ──
    console.log("[1/3] Loading vocabularies.json...");
    const raw = readFileSync("vocabularies.json", "utf-8");
    const entries = JSON.parse(raw);

    // Build: character → best sino_vietnamese
    const svMap = new Map();
    for (const entry of entries) {
        const simp = (entry.forms?.simplified || "").trim();
        const trad = (entry.forms?.traditional || entry.character || "").trim();
        const char = simp || trad;
        if (!char) continue;

        const svReadings = [];
        for (const pr of entry.pronunciations || []) {
            const sv = (pr.sino_vietnamese || "").trim();
            if (sv && !svReadings.includes(sv)) svReadings.push(sv);
        }
        if (svReadings.length > 0) {
            svReadings.sort((a, b) => b.length - a.length);
            svMap.set(char, svReadings[0]);
        }
    }
    console.log(`  → ${svMap.size} characters with SV`);

    // ── Load all vocab ──
    console.log("[2/3] Loading vocab...");
    const allVocab = await prisma.vocabulary.findMany({
        select: { id: true, hanTraditional: true, hanSimplified: true, sinoVietnamese: true },
    });
    console.log(`  → ${allVocab.length} total`);

    // ── Update by CHARACTER only ──
    console.log("[3/3] Updating...");
    let updated = 0;
    let notFound = 0;
    const now = new Date().toISOString();
    const BATCH = 100;

    for (let i = 0; i < allVocab.length; i += BATCH) {
        const batch = allVocab.slice(i, i + BATCH);
        for (const v of batch) {
            const char = v.hanSimplified || v.hanTraditional || "";
            if (!char) {
                notFound++;
                continue;
            }

            // Look up by simplified first, then traditional
            let sv = svMap.get(char);
            if (!sv && v.hanTraditional && v.hanTraditional !== char) {
                sv = svMap.get(v.hanTraditional);
            }

            if (sv && sv !== (v.sinoVietnamese || "")) {
                await prisma.vocabulary.update({
                    where: { id: v.id },
                    data: { sinoVietnamese: sv, updatedAt: now },
                });
                updated++;
            } else if (!sv && !v.sinoVietnamese) {
                notFound++;
            }
        }
        if (i % 2000 === 0) console.log(`  ... ${i}/${allVocab.length}`);
    }

    // ── Stats ──
    const stats = await prisma.$queryRawUnsafe(
        "SELECT COUNT(*) as t, COUNT(*) FILTER (WHERE sino_vietnamese IS NOT NULL AND sino_vietnamese != '') as s FROM vocabularies",
    );
    console.log(`\n  → ${updated} updated, ${notFound} still missing`);
    console.log(`  SV coverage: ${stats[0].s} / ${stats[0].t}`);
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
