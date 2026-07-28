/**
 * combine-vocab.mjs — Merge 3 nguồn từ vựng thành 1 dataset sạch
 *
 * Nguồn 1: drkameleon/complete-hsk-vocabulary (newest HSK 3.0, có English) — ƯU TIÊN CAO NHẤT
 * Nguồn 2: krmanik/HSK-3.0 Anki data (có pinyin, POS)
 * Nguồn 3: vocabularies.json / DB hiện tại (seed gốc)
 *
 * Chiến lược:
 * - Normalize pinyin: lowercase + bỏ tất cả non-alphanum (space, hyphen, v.v.)
 * - Match key = hanTraditional | hanSimplified | normPinyin
 * - Priority: drkameleon > krmanik > existing DB
 * - KHÔNG đụng đến lessons
 * - Chỉ INSERT/UPDATE, không DELETE
 */

import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import crypto from "crypto";
import https from "https";
import { readFileSync } from "fs";

const JSON_URL = "https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/master/complete.json";
const ANKI_BASE = "https://raw.githubusercontent.com/krmanik/HSK-3.0/master/New%20HSK%20(2025)/Anki%20xiehanzi";

// ── Helpers ──

function normPinyin(p) {
    // Chỉ bỏ khoảng trắng + lowercase — giữ tone marks để khớp UUID trong DB
    return (p || "").replace(/\s+/g, "").toLowerCase();
}

function stableUUID(trad, simp, pinyin) {
    const key = `${trad || ""}|${simp || ""}|${normPinyin(pinyin)}|`;
    return crypto
        .createHash("md5")
        .update(key)
        .digest("hex")
        .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
}

function matchKey(trad, simp, pinyin) {
    return `${(trad || "").trim()}|${(simp || "").trim()}|${normPinyin(pinyin)}`;
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

function pickBestLevel(levels) {
    let bestNewest = null,
        bestNew = null;
    for (const lvl of levels || []) {
        if (lvl.startsWith("newest-")) {
            const num = parseInt(lvl.replace("newest-", ""));
            if (!bestNewest || num < bestNewest.num) bestNewest = { num };
        } else if (lvl.startsWith("new-")) {
            const num = parseInt(lvl.replace("new-", ""));
            if (!bestNew || num < bestNew.num) bestNew = { num };
        }
    }
    if (bestNewest) return `HSK ${bestNewest.num}`;
    if (bestNew) return `HSK ${bestNew.num}`;
    return null;
}

// ── Main ──

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
    console.log("🔄 Combining 3 vocabulary sources...\n");

    // ── Step 1: Load drkameleon (priority #1) ──
    console.log("[1/4] Loading drkameleon complete-hsk-vocabulary...");
    const dkRaw = await fetchUrl(JSON_URL);
    const dkData = JSON.parse(dkRaw);
    const dkMap = new Map(); // matchKey → { id, trad, simp, pinyin, eng, hskLevel }

    let dkOldSkipped = 0;
    for (const key of Object.keys(dkData)) {
        const e = dkData[key];
        const simp = (e.simplified || "").trim();
        if (!simp) continue;
        const hskLevel = pickBestLevel(e.level);
        if (!hskLevel) {
            dkOldSkipped++;
            continue;
        }

        for (const form of e.forms || []) {
            const trad = (form.traditional || simp).trim();
            const pinyin = (form.transcriptions?.pinyin || "").trim();
            const eng = (form.meanings || []).join("; ");
            const id = stableUUID(trad, simp, pinyin);
            const mk = matchKey(trad, simp, pinyin);

            if (dkMap.has(mk)) {
                const ex = dkMap.get(mk);
                const exLvl = parseInt((ex.hskLevel || "999").replace("HSK ", ""));
                const newLvl = parseInt((hskLevel || "999").replace("HSK ", ""));
                if (newLvl < exLvl) ex.hskLevel = hskLevel;
                if (eng.length > (ex.engMeanings || "").length) ex.engMeanings = eng;
            } else {
                dkMap.set(mk, { id, hanTraditional: trad, hanSimplified: simp, pinyin, engMeanings: eng, hskLevel });
            }
        }
    }
    console.log(`  → ${dkMap.size} unique entries (skipped ${dkOldSkipped} old-only)`);

    // ── Step 2: Load krmanik Anki data (priority #2) ──
    console.log("[2/4] Loading krmanik HSK 3.0 Anki data...");
    const ankiMap = new Map(); // matchKey → { trad, simp, pinyin, pos }

    for (let level = 1; level <= 6; level++) {
        try {
            const raw = await fetchUrl(`${ANKI_BASE}/HSK_Level_${level}.txt`);
            const lines = raw.split("\n").filter((l) => l.includes("\t"));
            const seen = new Set();

            for (const line of lines) {
                const cols = line.split("\t");
                if (cols.length < 3) continue;
                const simp = (cols[0] || "").trim();
                const trad = (cols[1] || "").trim();
                const pinyin = (cols[2] || "").trim();
                const posRaw = (cols[5] || "").trim();
                if (!simp) continue;

                const posMatch = posRaw.match(/[\u4e00-\u9fff]+/g);
                const pos = posMatch ? posMatch.join(",") : "";
                const mk = matchKey(trad || simp, simp, pinyin);
                const dedup = `${simp}|${normPinyin(pinyin)}`;
                if (seen.has(dedup)) continue;
                seen.add(dedup);

                if (!ankiMap.has(mk)) {
                    ankiMap.set(mk, {
                        hanTraditional: trad || simp,
                        hanSimplified: simp,
                        pinyin,
                        pos,
                        hskLevel: `HSK ${level}`,
                    });
                }
            }
            console.log(`    HSK ${level}: ${lines.length} → ${seen.size} unique`);
        } catch (e) {
            console.log(`    HSK ${level}: N/A`);
        }
    }
    console.log(`  → ${ankiMap.size} total unique from Anki`);

    // ── Step 3: Merge all sources ──
    console.log("[3/4] Merging: dkameleon > Anki > existing DB...");

    // Start with drkameleon (highest priority)
    const merged = new Map(); // id → final row
    for (const [mk, row] of dkMap) {
        merged.set(row.id, { ...row, source: "drkameleon" });
    }

    // Add Anki entries not already covered by drkameleon
    let ankiAdded = 0;
    for (const [mk, row] of ankiMap) {
        // Check if drkameleon already has this word (by matchKey)
        if (dkMap.has(mk)) continue;

        const id = stableUUID(row.hanTraditional, row.hanSimplified, row.pinyin);
        if (!merged.has(id)) {
            merged.set(id, {
                id,
                hanTraditional: row.hanTraditional,
                hanSimplified: row.hanSimplified,
                pinyin: row.pinyin,
                engMeanings: null,
                hskLevel: row.hskLevel,
                source: "krmanik",
            });
            ankiAdded++;
        }
    }
    console.log(`  → ${ankiAdded} added from krmanik (not in drkameleon)`);

    // ── Step 4: Batch upsert into DB ──
    console.log("[4/4] Upserting into DB...");
    const rows = [...merged.values()];
    const now = new Date().toISOString();
    const BATCH = 100;
    let newCount = 0,
        updCount = 0;

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
            // Check which are new vs existing
            const ids = batch.map((r) => r.id);
            const existing = await prisma.vocabulary.findMany({
                where: { id: { in: ids } },
                select: { id: true },
            });
            const existingSet = new Set(existing.map((e) => e.id));
            newCount += batch.filter((r) => !existingSet.has(r.id)).length;
            updCount += batch.filter((r) => existingSet.has(r.id)).length;

            await prisma.$executeRawUnsafe(
                `
                INSERT INTO vocabularies (id, han_traditional, han_simplified, pinyin, eng_meanings, hsk_level, created_at, updated_at)
                VALUES ${values.join(", ")}
                ON CONFLICT (id) DO UPDATE SET
                    han_traditional = EXCLUDED.han_traditional,
                    han_simplified  = EXCLUDED.han_simplified,
                    pinyin          = EXCLUDED.pinyin,
                    eng_meanings    = COALESCE(NULLIF(EXCLUDED.eng_meanings, ''), vocabularies.eng_meanings),
                    hsk_level       = COALESCE(NULLIF(EXCLUDED.hsk_level, ''), vocabularies.hsk_level),
                    updated_at      = EXCLUDED.updated_at
            `,
                ...params,
            );
        } catch (e) {
            console.log(`  ⚠️  Batch ${Math.floor(i / BATCH) + 1} error: ${e.message}`);
        }

        if (i > 0 && i % 2000 === 0) console.log(`  ... ${i}/${rows.length}`);
    }

    console.log(`  → ${newCount} new, ${updCount} updated`);

    // ── Summary ──
    const total = await prisma.$queryRawUnsafe("SELECT COUNT(*) as cnt FROM vocabularies");
    const eng = await prisma.$queryRawUnsafe(
        "SELECT COUNT(*) as cnt FROM vocabularies WHERE eng_meanings IS NOT NULL AND eng_meanings != ''",
    );
    const counts = await prisma.$queryRawUnsafe(
        "SELECT hsk_level, COUNT(*) FROM vocabularies WHERE hsk_level IS NOT NULL AND hsk_level != '' GROUP BY hsk_level ORDER BY hsk_level",
    );
    console.log(`\n  Total: ${total[0].cnt} | With English: ${eng[0].cnt}`);
    console.log("  By level:");
    counts.forEach((r) => console.log(`    ${(r.hsk_level || "?").padEnd(10)} ${r.count}`));
    console.log("\n✅ Combine complete!");
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
