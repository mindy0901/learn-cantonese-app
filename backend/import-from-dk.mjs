/**
 * import-from-dk.mjs — Clean import from drkameleon ONLY
 *
 * - Wipes all HSK vocab, lessons, grammars (already done)
 * - Imports from drkameleon/complete-hsk-vocabulary (newest only)
 * - Splits pinyin before storing
 * - Stores ALL fields: pos, frequency, radical, engMeanings
 */

import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import crypto from "crypto";
import https from "https";
import { splitPinyin } from "./lib/pinyinSplit.js";

const JSON_URL = "https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/master/complete.json";
const ADMIN_USER_ID = "627b7e1d-d928-47ae-9bc1-ea90daf48ebe";

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

function stableUUID(trad, simp, pinyin) {
    const np = (pinyin || "").replace(/\s+/g, "").toLowerCase();
    const key = `${trad || ""}|${simp || ""}|${np}|`;
    return crypto
        .createHash("md5")
        .update(key)
        .digest("hex")
        .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
}

function pickNewestLevel(levels) {
    let best = null;
    for (const lvl of levels || []) {
        if (!lvl.startsWith("newest-")) continue;
        const num = parseInt(lvl.replace("newest-", ""));
        if (!best || num < best) best = num;
    }
    // Fallback to new-X if no newest
    if (!best) {
        for (const lvl of levels || []) {
            if (!lvl.startsWith("new-") || lvl.startsWith("newest-")) continue;
            const num = parseInt(lvl.replace("new-", ""));
            if (!best || num < best) best = num;
        }
    }
    return best ? `HSK ${best}` : null;
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
    console.log("📦 Importing from drkameleon/complete-hsk-vocabulary\n");

    // ── Download ──
    console.log("[1/2] Downloading complete.json...");
    const raw = await fetchUrl(JSON_URL);
    const data = JSON.parse(raw);
    const keys = Object.keys(data);
    console.log(`  → ${keys.length} entries`);

    // ── Expand to flat rows ──
    console.log("[2/2] Expanding & inserting...");
    const rowMap = new Map(); // id → row
    let skippedOld = 0;

    for (const key of keys) {
        const entry = data[key];
        const simp = (entry.simplified || "").trim();
        if (!simp) continue;

        const hskLevel = pickNewestLevel(entry.level);
        if (!hskLevel) {
            skippedOld++;
            continue;
        }

        const radical = (entry.radical || "").trim();
        const frequency = entry.frequency || null;
        const pos = (entry.pos || []).join(",");

        for (const form of entry.forms || []) {
            const trad = (form.traditional || simp).trim();
            const rawPinyin = (form.transcriptions?.pinyin || "").trim();
            const pinyin = splitPinyin(rawPinyin); // split!
            const engMeanings = (form.meanings || []).join("; ");
            const classifiers = (form.classifiers || []).join(",");
            const pinyinNumeric = (form.transcriptions?.numeric || "").trim();
            const id = stableUUID(trad, simp, pinyin);

            if (rowMap.has(id)) {
                const ex = rowMap.get(id);
                const exLvl = parseInt((ex.hskLevel || "999").replace("HSK ", ""));
                const newLvl = parseInt((hskLevel || "999").replace("HSK ", ""));
                if (newLvl < exLvl) ex.hskLevel = hskLevel;
                if (engMeanings.length > (ex.engMeanings || "").length) ex.engMeanings = engMeanings;
            } else {
                rowMap.set(id, {
                    id,
                    hanTraditional: trad,
                    hanSimplified: simp,
                    pinyin,
                    engMeanings,
                    hskLevel,
                    pos,
                    frequency,
                    radical,
                    classifiers,
                    pinyinNumeric,
                });
            }
        }
    }

    const rows = [...rowMap.values()];
    console.log(`  → ${rows.length} unique rows (skipped ${skippedOld} old-only)`);

    // ── Batch insert ──
    const now = new Date().toISOString();
    const BATCH = 100;

    for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        const values = [];
        const params = [];
        let idx = 1;

        for (const r of batch) {
            values.push(
                `($${idx}::uuid,$${idx + 1},$${idx + 2},$${idx + 3},$${idx + 4},$${idx + 5},$${idx + 6},$${idx + 7},$${idx + 8},$${idx + 9},$${idx + 10},$${idx + 11},$${idx + 12})`,
            );
            params.push(
                r.id,
                r.hanTraditional,
                r.hanSimplified || null,
                r.pinyin || null,
                r.engMeanings || null,
                r.hskLevel,
                r.pos || null,
                r.frequency,
                r.radical || null,
                r.classifiers || null,
                r.pinyinNumeric || null,
                now,
                now,
            );
            idx += 13;
        }

        try {
            await prisma.$executeRawUnsafe(
                `
                INSERT INTO vocabularies (id, han_traditional, han_simplified, pinyin, eng_meanings, hsk_level, pos, frequency, radical, classifiers, pinyin_numeric, created_at, updated_at)
                VALUES ${values.join(", ")}
                ON CONFLICT (id) DO UPDATE SET
                    han_traditional = EXCLUDED.han_traditional,
                    han_simplified  = EXCLUDED.han_simplified,
                    pinyin          = EXCLUDED.pinyin,
                    eng_meanings    = EXCLUDED.eng_meanings,
                    hsk_level       = EXCLUDED.hsk_level,
                    pos             = EXCLUDED.pos,
                    frequency       = EXCLUDED.frequency,
                    radical         = EXCLUDED.radical,
                    classifiers     = EXCLUDED.classifiers,
                    pinyin_numeric  = EXCLUDED.pinyin_numeric,
                    updated_at      = EXCLUDED.updated_at
            `,
                ...params,
            );
        } catch (e) {
            console.log(`  ⚠️ Batch ${Math.floor(i / BATCH) + 1}: ${e.message}`);
        }

        if (i > 0 && i % 2000 === 0) console.log(`  ... ${i}/${rows.length}`);
    }

    // ── Summary ──
    console.log(`  ✅ ${rows.length} rows imported\n`);
    const counts = await prisma.$queryRawUnsafe(
        "SELECT hsk_level, COUNT(*) FROM vocabularies WHERE hsk_level IS NOT NULL AND hsk_level != '' GROUP BY hsk_level ORDER BY hsk_level",
    );
    counts.forEach((r) => console.log(`  ${r.hsk_level}: ${r.count}`));

    const eng = await prisma.$queryRawUnsafe(
        "SELECT COUNT(*) as c FROM vocabularies WHERE eng_meanings IS NOT NULL AND eng_meanings != ''",
    );
    const total = await prisma.$queryRawUnsafe("SELECT COUNT(*) as c FROM vocabularies");
    console.log(`\n  English: ${eng[0].c} / ${total[0].c}`);
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
