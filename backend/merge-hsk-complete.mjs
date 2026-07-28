/**
 * merge-hsk-complete.mjs — Merge data from drkameleon/complete-hsk-vocabulary
 *
 * Uses HSK 3.0 standard ONLY (newest-X > new-X priority, ignore old-X).
 * - newest-X: latest HSK 3.0 revision (highest priority)
 * - new-X: original HSK 3.0 classification (fallback)
 * - old-X: HSK 2.0 (IGNORED)
 *
 * Strategy:
 * - Single HSK level per entry (best = newest > new)
 * - FULL overwrite on existing DB rows (engMeanings, pinyin, hskLevel)
 * - Add new rows for entries not yet in DB
 */

import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import crypto from "crypto";
import https from "https";

const JSON_URL = "https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/master/complete.json";

function stableUUID(hanTraditional, hanSimplified, pinyin, jyutping) {
    const normPinyin = (pinyin || "").replace(/\s+/g, "").toLowerCase();
    const normJyutping = (jyutping || "").replace(/\s+/g, "").toLowerCase();
    const key = `${hanTraditional || ""}|${hanSimplified || ""}|${normPinyin}|${normJyutping}`;
    return crypto
        .createHash("md5")
        .update(key)
        .digest("hex")
        .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
}

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        https
            .get(url, (res) => {
                if (res.statusCode === 301 || res.statusCode === 302)
                    return fetchUrl(res.headers.location).then(resolve, reject);
                if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
                let d = "";
                res.on("data", (c) => (d += c));
                res.on("end", () => resolve(d));
            })
            .on("error", reject);
    });
}

/**
 * Pick the BEST single HSK level: newest-X > new-X. Ignores old-X.
 * Returns "HSK X" or null.
 */
function pickBestLevel(levels) {
    let bestNew = null; // highest priority new-X
    let bestNewest = null; // highest priority newest-X

    for (const lvl of levels || []) {
        if (lvl.startsWith("newest-")) {
            const num = parseInt(lvl.replace("newest-", ""));
            if (!bestNewest || num < bestNewest.num) bestNewest = { num, raw: lvl };
        } else if (lvl.startsWith("new-")) {
            const num = parseInt(lvl.replace("new-", ""));
            if (!bestNew || num < bestNew.num) bestNew = { num, raw: lvl };
        }
        // old-X is IGNORED
    }

    // newest always wins over new
    if (bestNewest) return `HSK ${bestNewest.num}`;
    if (bestNew) return `HSK ${bestNew.num}`;
    return null;
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
    console.log("🚀 Merging complete-hsk-vocabulary (newest > new priority)\n");

    // ── Step 1: Download ──
    console.log("[1/3] Downloading complete.json...");
    let data;
    try {
        const raw = await fetchUrl(JSON_URL);
        data = JSON.parse(raw);
    } catch (e) {
        console.error(`❌ Cannot download: ${e.message}`);
        process.exit(1);
    }
    const keys = Object.keys(data);
    console.log(`  → ${keys.length} entries`);

    // ── Step 2: Expand to flat rows + dedup ──
    console.log("[2/3] Expanding entries (newest > new, single level)...");
    const rowMap = new Map();

    let skippedOld = 0;
    for (const key of keys) {
        const entry = data[key];
        const simplified = (entry.simplified || "").trim();
        if (!simplified) continue;

        const hskLevel = pickBestLevel(entry.level);
        if (!hskLevel) {
            skippedOld++;
            continue;
        } // only old-X or nothing

        const forms = entry.forms || [];
        for (const form of forms) {
            const traditional = (form.traditional || simplified).trim();
            const pinyin = (form.transcriptions?.pinyin || "").trim();
            const engMeanings = (form.meanings || []).join("; ");
            const id = stableUUID(traditional, simplified, pinyin, "");

            if (rowMap.has(id)) {
                const existing = rowMap.get(id);
                // Keep the LOWER (earlier) HSK level — newest priority already handled by pickBestLevel
                const existNum = parseInt((existing.hskLevel || "999").replace("HSK ", ""));
                const newNum = parseInt((hskLevel || "999").replace("HSK ", ""));
                if (newNum < existNum) {
                    existing.hskLevel = hskLevel; // lower = earlier = priority
                }
                // Use longer engMeanings
                if (engMeanings && (!existing.engMeanings || engMeanings.length > existing.engMeanings.length)) {
                    existing.engMeanings = engMeanings;
                }
                // Use pinyin with tone marks if available
                if (pinyin && (!existing.pinyin || pinyin.length > existing.pinyin.length)) {
                    existing.pinyin = pinyin;
                }
            } else {
                rowMap.set(id, {
                    id,
                    hanTraditional: traditional,
                    hanSimplified: simplified,
                    pinyin,
                    engMeanings,
                    hskLevel,
                });
            }
        }
    }
    const rows = [...rowMap.values()];
    console.log(`  → ${rows.length} unique rows (skipped ${skippedOld} old-only entries)`);

    // ── Step 3: Batch raw-SQL upsert (FULL overwrite) ──
    console.log("[3/3] Batch upserting (full overwrite)...");
    const now = new Date().toISOString();
    const BATCH = 100;

    for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        const values = [];
        const params = [];
        let idx = 1;

        for (const r of batch) {
            values.push(
                `($${idx}::uuid, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5}, $${idx + 6}, $${idx + 7})`,
            );
            params.push(
                r.id,
                r.hanTraditional,
                r.hanSimplified || null,
                r.pinyin || null,
                r.engMeanings || null,
                r.hskLevel || null,
                now,
                now,
            );
            idx += 8;
        }

        try {
            // FULL overwrite: replace engMeanings, hskLevel, pinyin
            await prisma.$executeRawUnsafe(
                `
                INSERT INTO vocabularies (id, han_traditional, han_simplified, pinyin, eng_meanings, hsk_level, created_at, updated_at)
                VALUES ${values.join(", ")}
                ON CONFLICT (id) DO UPDATE SET
                    han_traditional = EXCLUDED.han_traditional,
                    han_simplified  = EXCLUDED.han_simplified,
                    pinyin          = EXCLUDED.pinyin,
                    eng_meanings    = EXCLUDED.eng_meanings,
                    hsk_level       = EXCLUDED.hsk_level,
                    updated_at      = EXCLUDED.updated_at
            `,
                ...params,
            );
        } catch (e) {
            console.log(`  ⚠️  Batch ${Math.floor(i / BATCH) + 1} error: ${e.message}`);
        }

        if (i > 0 && i % 2000 === 0) console.log(`  ... ${i}/${rows.length} rows`);
    }

    // ── Summary ──
    console.log(`  ✅ ${rows.length} rows processed\n`);
    const counts = await prisma.$queryRawUnsafe(
        "SELECT hsk_level, COUNT(*) as cnt FROM vocabularies WHERE hsk_level IS NOT NULL AND hsk_level != '' GROUP BY hsk_level ORDER BY hsk_level",
    );
    counts.forEach((r) => console.log(`  ${(r.hsk_level || "?").padEnd(10)} ${r.cnt}`));
    const eng = await prisma.$queryRawUnsafe(
        "SELECT COUNT(*) as cnt FROM vocabularies WHERE eng_meanings IS NOT NULL AND eng_meanings != ''",
    );
    const total = await prisma.$queryRawUnsafe("SELECT COUNT(*) as cnt FROM vocabularies");
    console.log(`\n  Words with English: ${eng[0].cnt} / ${total[0].cnt}`);
    console.log("\n🎉 Merge complete!");
}

main()
    .catch((e) => {
        console.error("❌ Fatal:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
        await pool.end();
    });
