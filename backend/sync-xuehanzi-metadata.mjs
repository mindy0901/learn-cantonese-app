/**
 * sync-xuehanzi-metadata.mjs
 * Sync 7 lexicon metadata fields from backend/data/xue-hanzi-dictionary.json
 * (Hiểu Chữ Hán dictionary) into the vocabularies table.
 *
 * Fields written (overwrite — approved by user):
 *   pt  → pinyin_numeric     (pinyin with tone numbers, e.g. "qu3xiao1")
 *   mwr → movie_word_rank
 *   bwr → book_word_rank
 *   tw  → related_words      (JSONB: [{ word, trad, gloss, share }])
 *   b   → boost              (REAL ranking score)
 *   sp  → search_pinyin      (tone-less pinyin for search)
 *
 * NOTE: `etym` (etymology) is intentionally NOT synced anymore — user decided
 * to drop etymology from the database (cleared 2026-08-03).
 *
 * Matching: by hanTraditional (t) and/or hanSimplified (s). When a Han form
 * has multiple readings, the entry whose `pt` matches the DB pinyin_numeric
 * (normalized: strip spaces, lowercase) is preferred. pinyin_numeric is only
 * overwritten when the reading is confirmed to avoid corrupting it.
 *
 * Usage: node sync-xuehanzi-metadata.mjs [--dry]
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

const dict = JSON.parse(readFileSync(resolve(__dirname, "data", "xue-hanzi-dictionary.json"), "utf-8"));

function normKey(s) {
    return String(s ?? "")
        .replace(/\s+/g, "")
        .toLowerCase();
}

// Index entries by traditional & simplified form.
const byTrad = new Map();
const bySimp = new Map();
for (const e of dict) {
    const t = (e.t || "").trim();
    const s = (e.s || "").trim();
    if (t) {
        if (!byTrad.has(t)) byTrad.set(t, []);
        byTrad.get(t).push(e);
    }
    if (s) {
        if (!bySimp.has(s)) bySimp.set(s, []);
        bySimp.get(s).push(e);
    }
}

/**
 * Choose the best xue-hanzi entry for a vocab row.
 * Prefers an entry whose pinyin matches the DB reading.
 */
function pickEntry(vocab) {
    const trad = (vocab.hanTraditional || "").trim();
    const simp = (vocab.hanSimplified || "").trim();
    const dbPyN = normKey(vocab.pinyinNumeric);
    const dbPy = normKey(vocab.pinyin);

    const poolSet = new Map(); // entry -> weight
    const add = (arr) => {
        for (const e of arr || []) poolSet.set(e, (poolSet.get(e) ?? 0) + 1);
    };
    if (trad) add(byTrad.get(trad));
    if (simp) add(bySimp.get(simp));
    const pool = [...poolSet.keys()];
    if (pool.length === 0) return null;

    // 1) exact reading match (numeric pinyin)
    if (dbPyN) {
        const hit = pool.find((e) => normKey(e.pt) === dbPyN);
        if (hit) return hit;
    }
    // 2) exact reading match (tone-marked pinyin vs searchable pinyin of entry)
    if (dbPy) {
        const hit = pool.find((e) => normKey(e.sp) === dbPy);
        if (hit) return hit;
    }
    // 3) single candidate
    if (pool.length === 1) return pool[0];
    // 4) prefer entry with matching traditional AND simplified (weight >= 2)
    const strong = pool.filter((e) => poolSet.get(e) >= 2);
    if (strong.length === 1) return strong[0];
    // 5) first (most common form) as fallback
    return pool[0];
}

async function main() {
    const vocabs = await prisma.vocabulary.findMany({
        select: {
            id: true,
            hanTraditional: true,
            hanSimplified: true,
            pinyin: true,
            pinyinNumeric: true,
        },
        orderBy: { hanTraditional: "asc" },
    });
    console.log("📖 vocabularies:", vocabs.length);

    let matched = 0;
    let noMatch = 0;
    let pyUpdated = 0;
    const BATCH = 200;
    const updates = [];

    for (const v of vocabs) {
        const e = pickEntry(v);
        if (!e) {
            noMatch++;
            continue;
        }
        matched++;

        const data = {
            movieWordRank: e.mwr ?? null,
            bookWordRank: e.bwr ?? null,
            relatedWords: e.tw ?? null,
            boost: e.b ?? null,
            searchPinyin: (e.sp || "").trim() || null,
        };
        // pinyin_numeric only when the reading is confirmed (pt matches or single candidate)
        if (e.pt && normKey(e.pt) !== normKey(v.pinyinNumeric)) {
            data.pinyinNumeric = normKey(e.pt);
            pyUpdated++;
        }
        updates.push({ id: v.id, data });
    }

    console.log(`✅ matched: ${matched} | ❌ no match: ${noMatch} | 🔢 pinyin_numeric updates: ${pyUpdated}`);
    if (DRY) {
        console.log(`(DRY — no writes; ${updates.length} rows would be updated)`);
    } else {
        const now = new Date();
        for (let i = 0; i < updates.length; i += BATCH) {
            const batch = updates.slice(i, i + BATCH);
            await prisma.$transaction(
                batch.map(({ id, data }) =>
                    prisma.vocabulary.update({
                        where: { id },
                        data: { ...data, updatedAt: now },
                    }),
                ),
            );
        }
        console.log(`✔ wrote ${updates.length} rows`);
    }

    // Sample output (from pending payload so DRY mode is accurate)
    const samples = [];
    for (const u of updates.slice(0, 6)) {
        const v = vocabs.find((x) => x.id === u.id);
        samples.push({ han: v?.hanTraditional, ...u.data });
    }
    console.log("\n-- samples --");
    for (const s of samples) {
        console.log(
            `\n${s.han} | pyN=${s.pinyinNumeric} | mwr=${s.movieWordRank} | bwr=${s.bookWordRank} | boost=${s.boost} | sp=${s.searchPinyin}`,
        );
        if (s.relatedWords) console.log(`   tw: ${JSON.stringify(s.relatedWords).slice(0, 200)}`);
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
