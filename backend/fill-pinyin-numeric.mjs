#!/usr/bin/env node
/**
 * fill-pinyin-numeric.mjs — Fill `pinyin_numeric` for every vocabulary that has
 * pinyin, converting tone marks to trailing tone numbers (yī yí yì → y1 y2 y4).
 *
 * Syllable-aware: handles connected syllables (yíxià → y2 xia4) and nasal codas
 * (yīng → ying1). Used as a stable sort key (tone order 1→2→3→4).
 *
 * Usage:
 *   node /app/fill-pinyin-numeric.mjs [--dry]
 */
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "..", "..", ".env.dev") });

const pool = new pg.Pool({ connectionString: process.env["DATABASE_URL"] });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const dry = process.argv.includes("--dry");

// Tone-marked vowels → (baseVowel, tone). ü with tones included.
const TONE_MAP = {
    ā: ["a", 1],
    á: ["a", 2],
    ǎ: ["a", 3],
    à: ["a", 4],
    ē: ["e", 1],
    é: ["e", 2],
    ě: ["e", 3],
    è: ["e", 4],
    ī: ["i", 1],
    í: ["i", 2],
    ǐ: ["i", 3],
    ì: ["i", 4],
    ō: ["o", 1],
    ó: ["o", 2],
    ǒ: ["o", 3],
    ò: ["o", 4],
    ū: ["u", 1],
    ú: ["u", 2],
    ǔ: ["u", 3],
    ù: ["u", 4],
    ǖ: ["v", 1],
    ǘ: ["v", 2],
    ǚ: ["v", 3],
    ǜ: ["v", 4],
    ü: ["v", 5],
};

function isToneMarked(ch) {
    return Object.prototype.hasOwnProperty.call(TONE_MAP, ch);
}

/**
 * Convert pinyin with tone marks to per-syllable "base+tone" numbers,
 * preserving word/space structure (yíxià → y2 xia4, yīng → ying1).
 */
export function pinyinToNumeric(pinyin) {
    if (!pinyin) return "";
    // Split on spaces/separators first, then within each token split syllables.
    return String(pinyin)
        .trim()
        .split(/[\s·]+/)
        .filter(Boolean)
        .map(tokenToNumeric)
        .join(" ");
}

function tokenToNumeric(token) {
    const syllables = [];
    let cur = ""; // current syllable (initials + medial/base vowels, no tone)
    let i = 0;
    const len = token.length;
    const isVowel = (c) => /[aoeiuü]/.test(c);
    while (i < len) {
        const ch = token[i];
        if (Object.prototype.hasOwnProperty.call(TONE_MAP, ch)) {
            const [base, tone] = TONE_MAP[ch];
            cur += base;
            i++;
            // Consume trailing coda of the SAME syllable: plain vowels (ao/ou/iu
            // → o/u after the tone-marked main vowel) and nasal codas n / ng.
            while (i < len) {
                const c = token[i];
                if (isVowel(c)) {
                    cur += c;
                    i++;
                } else if (c === "n") {
                    cur += "n";
                    i++;
                    if (i < len && token[i] === "g") {
                        cur += "g";
                        i++;
                    }
                } else {
                    break;
                }
            }
            syllables.push(cur + tone);
            cur = "";
        } else if (ch === "'") {
            // apostrophe separator (yī'àn style) — flush current syllable if any.
            if (cur) syllables.push(cur + "5");
            cur = "";
            i++;
        } else {
            cur += ch;
            i++;
        }
    }
    if (cur) syllables.push(cur + "5"); // neutral tone
    return syllables.join(" ");
}

async function main() {
    const rows = await prisma.vocabulary.findMany({
        where: { pinyin: { not: null, not: "" } },
        select: { id: true, pinyin: true, pinyinNumeric: true },
    });
    console.log(`with pinyin: ${rows.length}`);

    let toFill = 0;
    let unchanged = 0;
    const updates = [];
    for (const r of rows) {
        const num = pinyinToNumeric(r.pinyin);
        if (!num) continue;
        if (r.pinyinNumeric === num) {
            unchanged++;
            continue;
        }
        updates.push({ id: r.id, pinyinNumeric: num });
        toFill++;
    }
    console.log(`to update: ${toFill}, already correct: ${unchanged}`);

    if (dry) {
        console.log(
            `[dry] samples: ${updates
                .slice(0, 8)
                .map((u) => `${u.id.slice(0, 6)}:${u.pinyinNumeric}`)
                .join(" | ")}`,
        );
        await prisma.$disconnect();
        return;
    }

    const BATCH = 500;
    for (let i = 0; i < updates.length; i += BATCH) {
        const chunk = updates.slice(i, i + BATCH);
        await prisma.$transaction(
            chunk.map((u) =>
                prisma.vocabulary.update({
                    where: { id: u.id },
                    data: { pinyinNumeric: u.pinyinNumeric },
                }),
            ),
        );
        console.log(`  ... ${Math.min(i + BATCH, updates.length)}/${updates.length} updated`);
    }

    const total = await prisma.vocabulary.count({ where: { pinyinNumeric: { not: null, not: "" } } });
    console.log(`DONE: updated=${toFill}, hasPinyinNumeric=${total}`);
    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
