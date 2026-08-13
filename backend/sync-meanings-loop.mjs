/**
 * sync-meanings-loop.mjs
 * Run the meaning sync PERIODICALLY until no vocabularies are missing meanings.
 *
 * Each iteration: CVDICT/CEDICT dict fill (fast) → translate fallback (with
 * delay + retry, capped by --limit) → write updates. Then sleeps --interval
 * minutes and repeats (the free Google endpoint rate-limit resets over time,
 * so running periodically fills the backlog a little each round).
 *
 * WRITES to DB — same safety as sync-meanings.mjs (only fills empty meanings,
 * never overwrites user data). Run only after explicit confirmation.
 *
 * Usage:
 *   node sync-meanings-loop.mjs [--interval=15] [--limit=50] [--maxRuns=0]
 *   (--maxRuns=0 → run forever until nothing left)
 */

import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { applyDictMeanings, enrichMissingMeanings } from "./lib/meaningPipeline.js";

const argNum = (name, def) => {
    const a = process.argv.find((x) => x.startsWith(`--${name}=`));
    const v = a ? Number(a.split("=")[1]) : NaN;
    return Number.isFinite(v) && v > 0 ? v : def;
};
const INTERVAL_MIN = argNum("interval", 15);
const TRANSLATE_LIMIT = argNum("limit", 50);
const MAX_RUNS = argNum("maxRuns", 0); // 0 = unlimited

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function runOnce() {
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

    const updates = [];
    let dictFilled = 0;
    const pending = [];
    for (const r of rows) {
        const before = { vietMeanings: r.vietMeanings || "", engMeanings: r.engMeanings || "" };
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
        } else {
            pending.push({ id: r.id, hanTraditional: r.hanTraditional, ...filled });
        }
    }

    let translated = 0;
    if (pending.length) {
        const targets = pending.slice(0, TRANSLATE_LIMIT);
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

    for (const u of updates) {
        await prisma.vocabulary.update({
            where: { id: u.id },
            data: { vietMeanings: u.vietMeanings || null, engMeanings: u.engMeanings || null },
        });
    }

    return { missing: rows.length - updates.length, dictFilled, translated, updated: updates.length };
}

async function main() {
    console.log(
        `\n🔄 Meaning sync loop (interval=${INTERVAL_MIN}m, translateLimit=${TRANSLATE_LIMIT}, maxRuns=${MAX_RUNS || "∞"})\n`,
    );
    let run = 0;
    while (true) {
        run++;
        const { missing, dictFilled, translated, updated } = await runOnce();
        const when = new Date().toISOString();
        console.log(
            `[${when}] run #${run} → updated=${updated} (dict=${dictFilled}, translate=${translated}), stillMissing=${missing}`,
        );
        if (missing <= 0) {
            console.log("🎉 No vocabularies missing meanings. Done.");
            break;
        }
        if (MAX_RUNS && run >= MAX_RUNS) {
            console.log(`Reached maxRuns=${MAX_RUNS}. Stopping.`);
            break;
        }
        console.log(`  sleeping ${INTERVAL_MIN} min…`);
        await sleep(INTERVAL_MIN * 60 * 1000);
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
