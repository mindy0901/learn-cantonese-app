/**
 * sync-vi-en-pairs.mjs
 * Fill Viet (CVDICT) + English (CEDICT) meanings as a PAIR for vocabularies.
 *
 * Rule (user requirement):
 *   - Look up Vietnamese from CVDICT and English from CEDICT by the SAME Han form.
 *   - Only write when BOTH meanings are available (a complete vi–en pair).
 *   - If either side is missing / not found → skip (do NOT write a partial pair).
 *   - Never overwrites existing non-empty user data.
 *
 * Safety: only updates rows where vietMeanings/engMeanings are empty.
 * WRITES to DB — run only after explicit confirmation. Supports --dry.
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

// ── Load CVDICT (Vietnamese) ──
const cvBy = new Map(); // simp OR trad → entry
{
    const entries = JSON.parse(readFileSync(resolve(__dirname, "data", "CVDICT.json"), "utf-8"));
    for (const e of entries) {
        if (e.s && !cvBy.has(e.s)) cvBy.set(e.s, e);
        if (e.t && !cvBy.has(e.t)) cvBy.set(e.t, e);
    }
    console.log("📖 CVDICT loaded:", entries.length, "entries | map:", cvBy.size);
}

// ── Load CEDICT (English) ──
const ceBy = new Map(); // simp OR trad → entry
{
    const entries = JSON.parse(readFileSync(resolve(__dirname, "data", "CEDICT.json"), "utf-8"));
    for (const e of entries) {
        if (e.s && !ceBy.has(e.s)) ceBy.set(e.s, e);
        if (e.t && !ceBy.has(e.t)) ceBy.set(e.t, e);
    }
    console.log("📖 CEDICT loaded:", entries.length, "entries | map:", ceBy.size);
}

async function main() {
    console.log(`\n🔄 Syncing vi–en meaning pairs (dry=${DRY})\n`);

    // Vocabs missing vietMeanings OR engMeanings
    const vocabs = await prisma.vocabulary.findMany({
        where: {
            OR: [{ vietMeanings: null }, { vietMeanings: "" }, { engMeanings: null }, { engMeanings: "" }],
        },
        select: { id: true, hanTraditional: true, hanSimplified: true, vietMeanings: true, engMeanings: true },
    });
    console.log(`  ${vocabs.length} vocabularies missing vi and/or en\n`);

    let filledPairs = 0;
    let skippedPartial = 0;
    let skippedFilled = 0;
    const examples = [];

    for (const v of vocabs) {
        const trad = (v.hanTraditional || "").trim();
        const simp = (v.hanSimplified || "").trim();

        // Look up by traditional first, then simplified
        const vi = cvBy.get(trad)?.vi || (simp && cvBy.get(simp)?.vi) || "";
        const enRaw = ceBy.get(trad) || (simp && ceBy.get(simp)) || null;
        const en = enRaw ? (Array.isArray(enRaw.en) ? enRaw.en.join("; ") : String(enRaw.en)).trim() : "";

        // Require BOTH meanings for a complete pair
        if (!vi || !en) {
            skippedPartial++;
            continue;
        }

        // Never overwrite existing non-empty user data
        const finalVi = (v.vietMeanings || "").trim() || vi;
        const finalEn = (v.engMeanings || "").trim() || en;
        if (finalVi === v.vietMeanings && finalEn === v.engMeanings) {
            skippedFilled++;
            continue;
        }

        if (!DRY) {
            await prisma.vocabulary.update({
                where: { id: v.id },
                data: { vietMeanings: finalVi, engMeanings: finalEn, updatedAt: new Date() },
            });
        }
        filledPairs++;
        if (examples.length < 10) examples.push({ trad: trad || simp, vi, en });
    }

    console.log(`  ✅ pairs filled: ${filledPairs}`);
    console.log(`  ⏭  skipped (no complete pair): ${skippedPartial}`);
    console.log(`  ⏭  skipped (already filled): ${skippedFilled}`);
    if (examples.length) {
        console.log("\n  samples:");
        for (const ex of examples) console.log(`    ${ex.trad} | ${ex.vi.slice(0, 35)} | ${ex.en.slice(0, 35)}`);
    }
    console.log(DRY ? "\n  (dry run — nothing written)" : "\n  ✅ Done!");
}

main().catch((e) => {
    console.error("❌", e);
    process.exit(1);
});
