/**
 * sync-sv-merged.mjs
 * Sync Sino-Vietnamese to han_characters + vocabularies.
 * Source priority: Unihan kVietnamese (kvietnamese.txt) FIRST, phienam.txt as fallback.
 *
 * Reports, per han character AND per vocabulary, which source (unihan / phienam)
 * supplied each sinoVietnamese reading, so you can audit coverage.
 *
 * This script WRITES to the database. Run only after explicit confirmation.
 */

import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { buildMergedSinoVietnameseMap } from "./lib/sinoVietnamesesMap.js";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const HAN = /[\u3400-\u4dbf\u4e00-\u9fff]/;

async function main() {
    const { map, stats } = buildMergedSinoVietnameseMap();
    console.log("📚 Sino-Vietnamese map (merged, Unihan priority)");
    console.log("   unihanTotal:", stats.unihanTotal, "| phienamTotal:", stats.phienamTotal);
    console.log("   mapTotal:", stats.mapTotal, "= usedUnihan:", stats.usedUnihan, "+ usedPhienam:", stats.usedPhienam);
    console.log("   overlap(both files):", stats.both, "| onlyUnihan:", stats.onlyUnihan, "| onlyPhienam:", stats.onlyPhienam);
    console.log("");

    // ── [1] han_characters ──
    console.log("[1/4] Updating han_characters (only those WITHOUT SV)...");
    const hanChars = await prisma.hanCharacter.findMany({
        select: { id: true, hanTraditional: true, hanSimplified: true, sinoVietnamese: true },
    });

    let huhanCount = 0;
    let hphienamCount = 0;
    let hSkipped = 0;

    for (const h of hanChars) {
        const currentSv = h.sinoVietnamese?.[0] ?? "";
        if (currentSv) {
            hSkipped++;
            continue; // Already has SV — never overwrite
        }
        const char = h.hanSimplified || h.hanTraditional;
        const entry = map.get(char);
        if (!entry) {
            hSkipped++;
            continue;
        }
        await prisma.hanCharacter.update({
            where: { id: h.id },
            data: { sinoVietnamese: [entry.value] },
        });
        if (entry.source === "unihan") huhanCount++;
        else hphienamCount++;
    }
    console.log(`   -> han_chars new readings: unihan=${huhanCount} phienam=${hphienamCount} | skipped(already-sv/no-map)=${hSkipped}`);

    // ── [2/3] Rebuild per-char map from DB (after update) ──
    console.log("[2/4] Rebuilding character map from han_characters...");
    const updatedHanChars = await prisma.hanCharacter.findMany({
        where: { sinoVietnamese: { isEmpty: false } },
        select: { hanTraditional: true, hanSimplified: true, sinoVietnamese: true },
    });
    const svMap = new Map();
    for (const h of updatedHanChars) {
        const sv = h.sinoVietnamese?.[0] ?? "";
        if (!sv) continue;
        if (h.hanTraditional) svMap.set(h.hanTraditional, sv);
        if (h.hanSimplified && h.hanSimplified !== h.hanTraditional) svMap.set(h.hanSimplified, sv);
    }
    console.log("   ->", svMap.size, "character mappings");

    // ── [3/4] Update vocabularies ──
    console.log("[3/4] Updating vocabularies (only those missing SV)...");
    const vocabs = await prisma.vocabulary.findMany({
        where: { OR: [{ sinoVietnamese: null }, { sinoVietnamese: "" }] },
        select: { id: true, hanTraditional: true, hanSimplified: true },
    });
    console.log("   ->", vocabs.length, "vocabularies missing SV");

    let vCount = 0;
    let vSkipped = 0;
    const sourceByV = { unihan: 0, phienam: 0, db: 0, mixed: 0 };

    for (const vocab of vocabs) {
        const trad = vocab.hanTraditional ?? "";
        const chars = [...trad];
        const svParts = [];
        const sources = new Set();
        let allFound = true;

        for (const ch of chars) {
            if (!HAN.test(ch)) continue;
            let sv;
            let src;
            const fromMap = map.get(ch);
            if (fromMap) {
                sv = fromMap.value;
                src = fromMap.source;
            } else {
                sv = svMap.get(ch); // DB (previously synced) fallback
                src = "db";
            }
            if (sv) {
                svParts.push(sv);
                if (src) sources.add(src);
            } else {
                allFound = false;
                break;
            }
        }

        if (!allFound || svParts.length === 0) {
            vSkipped++;
            continue;
        }

        await prisma.vocabulary.update({
            where: { id: vocab.id },
            data: { sinoVietnamese: svParts.join(" ") },
        });
        vCount++;
        if (sources.size > 1) sourceByV.mixed++;
        else if (sources.has("unihan")) sourceByV.unihan++;
        else if (sources.has("phienam")) sourceByV.phienam++;
        else if (sources.has("db")) sourceByV.db++;
    }
    console.log("   -> vocabularies updated:", vCount, "| skipped:", vSkipped);
    console.log("   -> vocab source split (single-char mapped):");
    console.log("       unihan:", sourceByV.unihan);
    console.log("       phienam:", sourceByV.phienam);
    console.log("       db(fallback):", sourceByV.db);
    console.log("       mixed(sources):", sourceByV.mixed);
    console.log("");

    // ── [4/4] Stats ──
    const statsRes = await prisma.$queryRawUnsafe(
        "SELECT COUNT(*) as t, COUNT(*) FILTER (WHERE sino_vietnamese IS NOT NULL AND sino_vietnamese != '') as s FROM vocabularies",
    );
    console.log("✅ Done!");
    console.log("   Han char readings: unihan:", huhanCount, "phienam:", hphienamCount);
    console.log("   SV coverage: ", statsRes[0].s, "/", statsRes[0].t);

    let hUpdateCount = huhanCount + hphienamCount;
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