/**
 * import-xuehanzi-common.mjs
 * Add new HSK 1-6 vocabulary from backend/data/xue-hanzi-dictionary.json,
 * filtered to common words only, skipping rows already in the DB.
 *
 * Filters (approved by user, 2026-08-03):
 *   - HSK level 1-6
 *   - Common: (movieWordRank <= 5000) OR (bookWordRank <= 5000) OR (boost >= 20)
 *   - Not already in DB by (hanTraditional, hanSimplified, normalized pinyin)
 *   - Pure Han entries only (skip Latin/digit forms like "A咖", "BP机")
 *
 * Writes (create only — never overwrite existing):
 *   hanTraditional, hanSimplified, pinyin, sinoVietnamese, vietMeanings,
 *   engMeanings, hskLevel, pinyinNumeric, movieWordRank, bookWordRank, boost,
 *   searchPinyin, relatedWords, hanCharacters (+ sync to HanCharacter store).
 *
 * NOTE: source has no jyutping — user will add Cantonese readings later.
 *
 * Usage: node import-xuehanzi-common.mjs [--dry]
 */
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { createHash, randomUUID } from "crypto";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { computeHanCharacters, syncVocabularyHanCharacters } from "./lib/hanCharacterBreakdown.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY = process.argv.includes("--dry");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const OpenCC = await import("opencc-js");
const toTrad = OpenCC.Converter({ from: "cn", to: "hk" });

const dict = JSON.parse(readFileSync(resolve(__dirname, "data", "xue-hanzi-dictionary.json"), "utf-8"));

function stableUUID(trad, simp, pinyin, jyutping = "") {
    const normPy = (pinyin || "").replace(/\s+/g, "").toLowerCase();
    const normJp = (jyutping || "").replace(/\s+/g, "").toLowerCase();
    const key = `${trad || ""}|${simp || ""}|${normPy}|${normJp}`;
    const hash = createHash("md5").update(key).digest("hex");
    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

function normKey(s) {
    return String(s ?? "")
        .replace(/[\u200b\u200c\u200d\u00ad]/g, "")
        .replace(/\s+/g, "")
        .toLowerCase();
}

function cleanPinyin(p) {
    // xue-hanzi pinyin uses ZERO-WIDTH spaces (\u200b) between syllables;
    // convert them to real spaces instead of deleting (otherwise syllables join).
    return String(p || "")
        .replace(/[\u200c\u200d\u00ad]/g, "")
        .replace(/\u200b/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/** Split xue-hanzi numeric pinyin (no spaces, e.g. "an1quan2xing4") into spaced syllables. */
function cleanPinyinNumeric(pt) {
    return String(pt || "")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/([1-5])(?=[a-zü])/g, "$1 ");
}

function hasLatinOrDigit(s) {
    return /[A-Za-z0-9]/.test(s || "");
}

function isCommon(e) {
    const m = e.mwr;
    const b = e.bwr;
    const bst = e.b;
    if (m != null && m <= 5000) return true;
    if (b != null && b <= 5000) return true;
    if (bst != null && bst >= 20) return true;
    return false;
}

async function main() {
    const vocabs = await prisma.vocabulary.findMany({
        select: { id: true, hanTraditional: true, hanSimplified: true, pinyin: true },
    });
    const dbPys = new Map(); // (trad|simp) -> Set(normPinyin)
    for (const v of vocabs) {
        const key = `${v.hanTraditional || ""}|${v.hanSimplified || ""}`;
        if (!dbPys.has(key)) dbPys.set(key, new Set());
        dbPys.get(key).add(normKey(v.pinyin));
    }
    console.log("📖 existing vocab rows:", vocabs.length);

    // Build candidates
    const candidates = [];
    const seenIds = new Set();
    let skippedDup = 0;
    let skippedNonCommon = 0;
    let skippedLatin = 0;
    let skippedNoHan = 0;
    let noPinyin = 0;

    for (const e of dict) {
        const h = e.hsk;
        if (h == null || !(h >= 1 && h <= 6)) continue;
        const simp = (e.s || "").trim();
        if (!simp) {
            skippedNoHan++;
            continue;
        }
        if (hasLatinOrDigit(simp)) {
            skippedLatin++;
            continue;
        }

        // Canonical traditional form from simplified (OpenCC), not xue-hanzi's
        // sometimes-rare variant `t` (e.g. 㑺 for 俊) — per AGENTS 1.5.
        const trad = (toTrad(simp) || simp).trim();
        const pinyin = cleanPinyin(e.p);

        // Skip if same han + pinyin already exists in DB
        const dbKey = `${trad}|${simp}`;
        const pyN = normKey(pinyin);
        const dbPySet = dbPys.get(dbKey);
        if (dbPySet && (dbPySet.has(pyN) || dbPySet.has(normKey(e.pt)))) {
            skippedDup++;
            continue;
        }

        if (!isCommon(e)) {
            skippedNonCommon++;
            continue;
        }
        if (!pinyin) {
            noPinyin++;
        }

        const id = stableUUID(trad, simp, pinyin);
        if (seenIds.has(id)) {
            skippedDup++;
            continue;
        }
        seenIds.add(id);
        candidates.push({ e, id, trad, simp, pinyin });
    }

    console.log(`candidates after filters: ${candidates.length}`);
    console.log(
        `  skipped: dup=${skippedDup} nonCommon=${skippedNonCommon} latin=${skippedLatin} noHan=${skippedNoHan}`,
    );

    // Insert
    const now = new Date();
    let created = 0;
    let hanCreated = 0;
    let hanUpdated = 0;
    const BATCH = 200;

    for (let i = 0; i < candidates.length; i += BATCH) {
        const batch = candidates.slice(i, i + BATCH);
        for (const c of batch) {
            const e = c.e;
            const en = Array.isArray(e.en) ? e.en : [];
            const vi = (e.vi || "").trim();
            const sv = (e.sv || "").trim();
            const row = {
                id: c.id,
                hanTraditional: c.trad,
                hanSimplified: c.simp || null,
                pinyin: c.pinyin || null,
                jyutping: null,
                sinoVietnamese: sv || null,
                vietMeanings: vi || null,
                engMeanings: en.length ? en.join("; ") : null,
                hskLevel: `HSK ${e.hsk}`,
                pinyinNumeric: cleanPinyinNumeric(e.pt) || null,
                movieWordRank: e.mwr ?? null,
                bookWordRank: e.bwr ?? null,
                boost: e.b ?? null,
                searchPinyin: (e.sp || "").trim() || null,
                relatedWords: Array.isArray(e.tw) && e.tw.length ? e.tw : null,
                searchKey: null,
            };
            const hanCharacters = computeHanCharacters(row);

            if (DRY) {
                created++;
                continue;
            }
            await prisma.vocabulary.create({
                data: {
                    ...row,
                    hanCharacters: hanCharacters.length > 0 ? hanCharacters : undefined,
                    createdAt: now,
                    updatedAt: now,
                },
            });
            if (hanCharacters.length > 0) {
                const r = await syncVocabularyHanCharacters(c.id, hanCharacters);
                hanCreated += r.created;
                hanUpdated += r.updated;
            }
            created++;
        }
        console.log(`  ✅ ${Math.min(i + BATCH, candidates.length)}/${candidates.length}`);
    }

    console.log(`\n✔ ${DRY ? "DRY — would create" : "created"} ${created} vocabularies`);
    console.log(`  han characters: ${hanCreated} created, ${hanUpdated} updated`);

    // Samples
    console.log("\n-- samples --");
    for (const c of candidates.slice(0, 8)) {
        console.log(
            `  ${c.trad}${c.simp !== c.trad ? `/${c.simp}` : ""} | ${c.pinyin} | HSK ${c.e.hsk} | mwr=${c.e.mwr ?? "-"} bwr=${c.e.bwr ?? "-"} boost=${c.e.b ?? "-"}`,
        );
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
