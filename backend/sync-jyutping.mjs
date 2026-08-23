/**
 * sync-jyutping.mjs
 * Fill `jyutping` for vocabularies imported on 2026-08-03 that lack it.
 *
 * Source priority:
 *   1. cantowords (words.hk) full-word — read from backend/data/cantowords-jyutping-words.json.
 *   2. CC-Canto full-word — backend/data/CCCANTO.json.
 *   3. Fallback: to-jyutping (context-aware full-word romanization).
 *
 * Also recomputes + syncs hanCharacters breakdown so each char gets its jyutping.
 *
 * Usage: node sync-jyutping.mjs [--dry]
 */
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { computeHanCharacters, syncVocabularyHanCharacters } from "./lib/hanCharacterBreakdown.js";
import ToJyutping from "to-jyutping";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY = process.argv.includes("--dry");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

// ── 1. cantowords (words.hk) full-word jyutping — highest priority ──
const cantowordsMap = new Map();
{
    const raw = JSON.parse(readFileSync(resolve(__dirname, "data", "cantowords-jyutping-words.json"), "utf-8"));
    for (const [word, readings] of Object.entries(raw)) {
        const jp = Array.isArray(readings) && readings.length ? String(readings[0]).trim() : "";
        if (word && jp) cantowordsMap.set(word, jp);
    }
}
console.log("cantowords entries:", cantowordsMap.size);

// ── 2. CC-Canto full-word map (trad OR simp → jyutping) ──
const cantoMap = new Map();
{
    const raw = JSON.parse(readFileSync(resolve(__dirname, "data", "CCCANTO.json"), "utf-8"));
    for (const e of raw) {
        if (!e.jp) continue;
        if (!cantoMap.has(e.t)) cantoMap.set(e.t, e.jp);
        if (e.s && !cantoMap.has(e.s)) cantoMap.set(e.s, e.jp);
    }
}
console.log("CC-Canto entries:", cantoMap.size);

// ── 3. Fallback: to-jyutping (context-aware full-word) — no separate map needed

async function main() {
    const vocabs = await prisma.vocabulary.findMany({
        where: {
            createdAt: { gte: new Date("2026-08-03T00:00:00.000Z") },
            OR: [{ jyutping: null }, { jyutping: "" }],
        },
        select: { id: true, hanTraditional: true, hanSimplified: true, pinyin: true },
    });
    console.log("📖 vocab missing jyutping:", vocabs.length);

    let fromCantowords = 0;
    let fromCanto = 0;
    let fromToJyutping = 0;
    let none = 0;
    const updates = [];

    for (const v of vocabs) {
        const trad = (v.hanTraditional || "").trim();
        const simp = (v.hanSimplified || "").trim();
        let jp = cantowordsMap.get(trad) || (simp && simp !== trad ? cantowordsMap.get(simp) : null);
        let src = "cantowords";
        if (!jp) {
            jp = cantoMap.get(trad) || (simp && simp !== trad ? cantoMap.get(simp) : null);
            src = "cc-canto";
        }
        if (!jp) {
            jp = ToJyutping.getJyutpingText(trad || simp);
            src = "to-jyutping";
        }
        if (!jp) {
            none++;
            continue;
        }
        if (src === "cantowords") fromCantowords++;
        else if (src === "cc-canto") fromCanto++;
        else fromToJyutping++;
        updates.push({ id: v.id, jyutping: jp, src });
    }

    console.log(
        `✅ cantowords: ${fromCantowords} | cc-canto: ${fromCanto} | to-jyutping: ${fromToJyutping} | none: ${none}`,
    );

    if (DRY) {
        console.log(`(DRY — no writes; ${updates.length} rows would be updated)`);
        for (const u of updates.slice(0, 10)) console.log(`  ${u.src}: ${u.id} → ${u.jyutping}`);
        return;
    }

    const now = new Date();
    const BATCH = 200;
    let done = 0;
    for (let i = 0; i < updates.length; i += BATCH) {
        const batch = updates.slice(i, i + BATCH);
        await prisma.$transaction(
            batch.map(({ id, jyutping }) =>
                prisma.vocabulary.update({
                    where: { id },
                    data: { jyutping, updatedAt: now },
                }),
            ),
        );
        done += batch.length;
        console.log(`  ✅ ${done}/${updates.length}`);
    }

    // Recompute + sync hanCharacters so each char gets jyutping
    console.log("\n🔁 recomputing hanCharacters breakdown...");
    let recomputed = 0;
    for (let i = 0; i < updates.length; i += BATCH) {
        const batch = updates.slice(i, i + BATCH);
        for (const u of batch) {
            const v = await prisma.vocabulary.findUnique({
                where: { id: u.id },
                select: {
                    id: true,
                    hanTraditional: true,
                    hanSimplified: true,
                    pinyin: true,
                    jyutping: true,
                    sinoVietnamese: true,
                },
            });
            if (!v) continue;
            const breakdown = computeHanCharacters(v);
            await prisma.vocabulary.update({
                where: { id: v.id },
                data: { hanCharacters: breakdown.length > 0 ? breakdown : null, updatedAt: now },
            });
            if (breakdown.length > 0) {
                await syncVocabularyHanCharacters(v.id, breakdown);
            }
            recomputed++;
        }
        console.log(`  🔁 ${Math.min(i + BATCH, updates.length)}/${updates.length}`);
    }
    console.log(`✔ recomputed ${recomputed} vocabularies`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
