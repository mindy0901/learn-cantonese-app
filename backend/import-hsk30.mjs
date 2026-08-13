/**
 * import-hsk30.mjs — Import HSK 3.0 (2025) word list from krmanik/HSK-3.0 repo
 * into the local DB. Data files: backend/data/hsk30/HSK_Level_{1..6,7-9}_words.txt
 * Format per line: count \t level \t word \t pinyin \t pos
 *
 * Rules:
 *  - Take MAIN level = first number before （ in the level column.
 *  - Merge all 7 files, dedupe by (word, normPinyin), keep LOWEST level.
 *  - Match existing rows: hanSimplified==word OR hanTraditional==word OR
 *    hanTraditional==OpenCC(s2t, word), AND normPinyin matches.
 *  - Matched rows: UPDATE hsk_level (overwrite, per user request) + pos if empty.
 *  - New words: CREATE (hanSimplified=word, hanTraditional=OpenCC trad,
 *    pinyin lowercase, hsk_level="HSK {level}", pos). No meanings/jyutping/SV yet.
 *  - hsk level format: "HSK 1".."HSK 6", "HSK 7-9".
 *
 * Safety: --dry preview only (default). --apply writes.
 * WRITES to DB — run only after explicit user confirmation.
 */
import dotenv from "dotenv";
import { createHash } from "crypto";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "..", ".env.dev") });

const DATA_DIR = resolve(__dirname, "data", "hsk30");
const APPLY = process.argv.includes("--apply");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const LEVELS = ["1", "2", "3", "4", "5", "6", "7-9"];

function normPy(s) {
    return String(s ?? "")
        .replace(/\s+/g, "")
        .toLowerCase();
}

/**
 * Strong pinyin normalization for MATCHING: take first reading (before , ;),
 * strip tone marks, keep only a-z letters, lowercase.
 * "bù kè qi" == "bú kèqi" == "bukeqi"; "dōng xī, dōng xi" == "dongxi".
 */
function normPyMatch(s) {
    const first = String(s ?? "").split(/[,;/]/)[0];
    return first
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z]/gi, "")
        .toLowerCase();
}

/** stable UUID = MD5(hanTraditional | hanSimplified | normPinyin | normJyutping) */
function stableUUID(hanTraditional, hanSimplified, normPinyin, normJyutping) {
    const s = `${hanTraditional}|${hanSimplified ?? ""}|${normPinyin}|${normJyutping ?? ""}`;
    const h = createHash("md5").update(s).digest("hex");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function mainLevel(levelCol) {
    const m = String(levelCol).match(/^(\d+(?:-\d+)?)/);
    return m ? m[1] : String(levelCol);
}

// strip homograph trailing digits e.g. 本1 -> 本, 两1 -> 两
function cleanWord(w) {
    return String(w).replace(/\d+$/, "").trim();
}

async function loadWords() {
    const map = new Map(); // key: word|normPy -> {word, py, pos, level}
    for (const lvl of LEVELS) {
        const path = resolve(DATA_DIR, `HSK_Level_${lvl}_words.txt`);
        const raw = readFileSync(path, "utf8");
        for (const line of raw.split(/\r?\n/)) {
            if (!line.trim()) continue;
            const parts = line.split("\t");
            if (parts.length < 4) continue;
            const word = cleanWord(parts[2]);
            const py = String(parts[3]).trim();
            const pos = parts[4] ? String(parts[4]).trim() : "";
            const level = mainLevel(parts[1]);
            if (!word || !py) continue;
            if (word.includes("（") || word.includes("）")) continue; // ambiguous HSK notation, skip
            const key = `${word}|${normPyMatch(py)}`;
            const existing = map.get(key);
            // keep LOWEST level (priority order: 1 < 2 < ... < 7-9)
            const rank = (lv) => (lv === "7-9" ? 7 : Number(lv));
            if (!existing || rank(level) < rank(existing.level)) {
                map.set(key, { word, py, pos, level });
            }
        }
    }
    return [...map.values()];
}

async function main() {
    const words = await loadWords();
    console.log(`HSK 3.0 (2025) parsed unique words: ${words.length}`);

    // OpenCC for traditional
    let toTrad = (s) => s;
    try {
        const OpenCC = await import("opencc-js");
        toTrad = OpenCC.Converter({ from: "cn", to: "hk" });
    } catch (e) {
        console.log("OpenCC unavailable — hanTraditional = simplified for new rows");
    }

    const { rows: all } = await pool.query(
        `SELECT id, han_simplified, han_traditional, pinyin, hsk_level, part_of_speech FROM vocabularies`,
    );
    // index by candidates
    const bySimp = new Map(); // normPy|simplified
    const byTrad = new Map(); // normPy|traditional
    const byTradConv = new Map(); // normPy|toTrad(word)
    for (const r of all) {
        const np = normPyMatch(r.pinyin);
        if (r.han_simplified) bySimp.set(`${np}|${r.han_simplified}`, r);
        if (r.han_traditional) {
            byTrad.set(`${np}|${r.han_traditional}`, r);
            byTradConv.set(`${np}|${toTrad(r.han_simplified || r.han_traditional)}`, r);
        }
    }

    let update = 0,
        create = 0,
        noLevelChange = 0,
        ambiguous = 0;
    const samplesU = [],
        samplesN = [];

    const client = await pool.connect();
    try {
        if (APPLY) await client.query("BEGIN");
        for (const w of words) {
            const np = normPyMatch(w.py);
            const trad = toTrad(w.word);
            const hsk = `HSK ${w.level}`;
            // try matches in priority order
            const match =
                bySimp.get(`${np}|${w.word}`) ||
                byTrad.get(`${np}|${w.word}`) ||
                byTradConv.get(`${np}|${w.word}`) ||
                byTrad.get(`${np}|${trad}`);
            if (match) {
                if (match.hsk_level === hsk) {
                    noLevelChange++;
                    continue;
                }
                update++;
                if (samplesU.length < 8)
                    samplesU.push({
                        word: w.word,
                        py: w.py,
                        old: match.hsk_level,
                        next: hsk,
                        pos_old: match.part_of_speech,
                        pos_new: w.pos,
                    });
                if (APPLY) {
                    const posUpdate =
                        (!match.part_of_speech || match.part_of_speech === "") && w.pos ? w.pos : match.part_of_speech;
                    await client.query(
                        "UPDATE vocabularies SET hsk_level=$1, part_of_speech=$2, updated_at=now() WHERE id=$3",
                        [hsk, posUpdate, match.id],
                    );
                }
            } else {
                // check if maybe exists with different pinyin spelling → count as ambiguous/new
                create++;
                if (samplesN.length < 8) samplesN.push({ word: w.word, trad, py: w.py, hsk });
                if (APPLY) {
                    const simp = w.word === trad ? null : w.word;
                    const id = stableUUID(trad, simp, normPy(w.py), "");
                    await client.query(
                        `INSERT INTO vocabularies (id, han_traditional, han_simplified, pinyin, hsk_level, part_of_speech, created_at, updated_at)
                         SELECT $1,$2,$3,$4,$5,$6, now(), now()
                         WHERE NOT EXISTS (SELECT 1 FROM vocabularies WHERE id=$1)`,
                        [id, trad, simp, w.py.toLowerCase(), hsk, w.pos || null],
                    );
                }
            }
        }
        if (APPLY) await client.query("COMMIT");
    } catch (e) {
        if (APPLY) await client.query("ROLLBACK");
        throw e;
    } finally {
        client.release();
    }

    console.log(`MODE: ${APPLY ? "APPLY (WRITES)" : "DRY (preview)"}`);
    console.log(`  update hsk_level:        ${update}`);
    console.log(`  create new:              ${create}`);
    console.log(`  no level change:         ${noLevelChange}`);
    console.log("\n--- update samples ---");
    for (const s of samplesU)
        console.log(`  ${s.word} ${s.py} : "${s.old}" -> "${s.next}" (pos: "${s.pos_old}" -> "${s.pos_new}")`);
    console.log("\n--- create samples ---");
    for (const s of samplesN) console.log(`  ${s.word} (${s.trad}) ${s.py} -> ${s.hsk}`);
    console.log(`\n${APPLY ? "✔ DONE" : "(dry run — run with --apply to write)"}`);
    await pool.end();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
