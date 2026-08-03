/**
 * sync-viet-meanings.mjs
 * Pre-fill Vocabulary.vietMeanings from CVDICT (Vietnamese dictionary of CEDICT).
 *
 * SAFETY: only fills rows where vietMeanings is null/empty. NEVER overwrites user data.
 *
 * Reports per-use coverage. WRITES to DB — run only after explicit confirmation.
 */

import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { lookupCVDictVocab, loadCVDict } from "./lib/cvdictLoader.js";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
    const dict = loadCVDict();
    console.log("📖 CVDICT loaded:", dict.entries.length, "entries");
    console.log("");

    console.log("[1/2] Reading vocabularies with EMPTY vietMeanings...");
    const vocabs = await prisma.vocabulary.findMany({
        where: { OR: [{ vietMeanings: null }, { vietMeanings: "" }] },
        select: {
            id: true,
            hanTraditional: true,
            hanSimplified: true,
            hskLevel: true,
            jyutping: true,
        },
    });
    console.log("   ->", vocabs.length, "vocabularies missing Vietnamese meaning\n");

    let filled = 0;
    let noMatch = 0;
    const byHsk = {};
    const examples = [];

    for (const v of vocabs) {
        const trad = (v.hanTraditional || "").trim();
        const simp = (v.hanSimplified || "").trim();
        const vi = lookupCVDictVoc(simp || undefined, trad || undefined);
        if (!vi) {
            noMatch++;
            continue;
        }
        await prisma.vocabulary.update({
            where: { id: v.id },
            data: { vietMeanings: vi, updatedAt: new Date() },
        });
        filled++;
        const hsk = (v.hskLevel || "?").trim();
        byHsk[hsk] = (byHsk[hsk] || 0) + 1;
        if (examples.length < 15) examples.push({ trad, simp, vi });
    }

    console.log("✅ Done!");
    console.log("   filled:", filled, "| no-match:", noMatch);

    if (Object.keys(byHsk).length) {
        console.log("   by HSK:");
        for (const [k, c] of Object.entries(byHsk).sort()) console.log("     ", k, "=", c);
    }

    if (examples.length) {
        console.log("   sample filled:");
        for (const ex of examples) console.log("     ", ex.trad || ex.simp, "->", ex.vi);
    }
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