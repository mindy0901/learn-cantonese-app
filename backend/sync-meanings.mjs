/**
 * sync-meanings.mjs
 * Sync missing Vietnamese/English meanings for ALL vocabularies using the shared
 * meaning pipeline (backend/lib/meaningPipeline.js):
 *
 *   1. CVDICT (Vietnamese) + CEDICT (English) — fast local dict lookup.
 *   2. If the dicts don't return a complete vi–en pair → translate fallback
 *      (whole pair, via the app's translate pipeline).
 *
 * Safety:
 *   - Only touches rows where vietMeanings/engMeanings are empty (never
 *     overwrites existing user data).
 *   - Supports --dry (preview) and --apply (write). WRITES to DB — run only
 *     after explicit confirmation.
 *   - Translate fallback is capped with --limit to avoid hammering the free
 *     Google-Translate endpoint.
 *
 * Usage:
 *   node /app/sync-meanings.mjs --dry
 *   node /app/sync-meanings.mjs --apply --limit 50
 */

import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { applyDictMeanings, enrichMissingMeanings } from "./lib/meaningPipeline.js";

const DRY = process.argv.includes("--dry");
const APPLY = process.argv.includes("--apply");
const LIMIT_ARG = process.argv.find((a) => a.startsWith("--limit="));
const TRANSLATE_LIMIT = LIMIT_ARG ? Number(LIMIT_ARG.split("=")[1]) || 30 : 30;

if (!DRY && !APPLY) {
    console.error("Usage: node sync-meanings.mjs --dry | --apply [--limit=N]");
    process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
    console.log(`\n🔄 Syncing missing meanings (mode=${DRY ? "dry" : "apply"}, translateLimit=${TRANSLATE_LIMIT})\n`);

    const rows = await prisma.vocabulary.findMany({
        where: {
            OR: [{ vietMeanings: null }, { vietMeanings: "" }, { engMeanings: null }, { engMeanings: "" }],
        },
        select: {
            id: true,
            hanTraditional: true,
            hanSimplified: true,
            vietMeanings: true,
            engMeanings: true,
        },
    });
    console.log(`  ${rows.length} vocabularies missing vi and/or en\n`);

    // ── Phase 1: dict fill (fast, local) ──
    let dictFilled = 0;
    const pending = [];
    const updates = [];
    for (const r of rows) {
        const before = {
            vietMeanings: r.vietMeanings || "",
            engMeanings: r.engMeanings || "",
        };
        const filled = applyDictMeanings({
            hanTraditional: r.hanTraditional,
            hanSimplified: r.hanSimplified,
            vietMeanings: before.vietMeanings,
            engMeanings: before.engMeanings,
        });
        const changed = filled.vietMeanings !== before.vietMeanings || filled.engMeanings !== before.engMeanings;
        if (filled.complete) {
            dictFilled++;
            if (changed) updates.push({ id: r.id, ...filled });
        } else if (changed) {
            // incomplete pair → candidate for translate fallback
            pending.push({ id: r.id, hanTraditional: r.hanTraditional, ...filled });
        } else {
            pending.push({ id: r.id, hanTraditional: r.hanTraditional, ...filled });
        }
    }
    console.log(`  ✅ dict (CVDICT+CEDICT) filled complete pairs: ${dictFilled}`);

    // ── Phase 2: translate fallback (whole pair) for incomplete ──
    let translated = 0;
    if (pending.length) {
        const targets = pending.slice(0, TRANSLATE_LIMIT);
        console.log(`  🌐 translate fallback for ${targets.length} incomplete pair(s)…`);
        await enrichMissingMeanings(targets, TRANSLATE_LIMIT);
        for (const t of targets) {
            if (t.vietMeanings && t.engMeanings) {
                translated++;
                const existing = updates.find((u) => u.id === t.id);
                if (existing) existing.vietMeanings = t.vietMeanings;
                else updates.push({ id: t.id, vietMeanings: t.vietMeanings, engMeanings: t.engMeanings });
            }
        }
    }

    const stillMissing = rows.length - dictFilled - translated;
    console.log(
        `\n  dictFilled: ${dictFilled} | translated: ${translated} | updates: ${updates.length} | stillMissing: ${stillMissing}\n`,
    );

    // ── Phase 3: write ──
    if (updates.length === 0) {
        console.log("  Nothing to update.");
        return;
    }
    if (DRY) {
        console.log("  [dry] would update these rows (first 20):");
        for (const u of updates.slice(0, 20)) {
            console.log(`    ${u.id} → vi="${u.vietMeanings}" en="${u.engMeanings}"`);
        }
        return;
    }

    console.log(`  Writing ${updates.length} updates…`);
    let done = 0;
    for (const u of updates) {
        await prisma.vocabulary.update({
            where: { id: u.id },
            data: { vietMeanings: u.vietMeanings || null, engMeanings: u.engMeanings || null },
        });
        done++;
        if (done % 200 === 0) console.log(`    …${done}/${updates.length}`);
    }
    console.log(`  ✅ Done: ${done} updated.`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
