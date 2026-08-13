/**
 * import-cantowords.mjs — Fill jyutping + frequency + add popular Cantonese words
 * from cantowords data into local DB.
 *
 * Data: backend/data/cantowords-freq-words.json (word -> count),
 *       backend/data/cantowords-jyutping-words.json (word -> [jyutping...])
 *
 * Steps:
 *  1. UPDATE rows already in DB that MISS jyutping/frequency but exist in cantowords
 *     (fill only when missing, never overwrite existing values).
 *  2. CREATE new Cantonese words (hanzi, frequency >= 50, not in DB):
 *     hanTraditional = OpenCC(s2t), jyutping = first reading, frequency = count.
 *     pinyin/meanings left empty (pure-Cantonese words have no pinyin).
 *
 * Safety: --dry preview (default), --apply writes. Confirm first.
 */
import dotenv from "dotenv";
import { createHash } from "crypto";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "..", ".env.dev") });
const APPLY = process.argv.includes("--apply");
const NO_CREATE = process.argv.includes("--no-create");
const MIN_FREQ = Number(process.argv.find((a) => a.startsWith("--min-freq="))?.split("=")[1] ?? 50);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const DATA = resolve(__dirname, "data");

function isHan(s) {
    return /[\u4e00-\u9fff]/.test(s);
}
function stableUUID(hanTraditional, hanSimplified, normPinyin, normJyutping) {
    const raw = `${hanTraditional}|${hanSimplified ?? ""}|${normPinyin ?? ""}|${normJyutping ?? ""}`;
    const h = createHash("md5").update(raw).digest("hex");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

async function main() {
    const freq = JSON.parse(readFileSync(resolve(DATA, "cantowords-freq-words.json"), "utf8"));
    const jy = JSON.parse(readFileSync(resolve(DATA, "cantowords-jyutping-words.json"), "utf8"));

    let toTrad = (s) => s;
    try {
        const OpenCC = await import("opencc-js");
        toTrad = OpenCC.Converter({ from: "cn", to: "hk" });
    } catch {
        /* keep self */
    }

    const { rows } = await pool.query(
        `SELECT id, han_simplified, han_traditional, jyutping, frequency FROM vocabularies`,
    );

    const fillJy = [],
        fillFr = [];
    const dbSimp = new Set(),
        dbTrad = new Set();
    for (const r of rows) {
        if (r.han_simplified) dbSimp.add(r.han_simplified);
        if (r.han_traditional) dbTrad.add(r.han_traditional);
        const inJy = (r.han_simplified && jy[r.han_simplified]) || (r.han_traditional && jy[r.han_traditional]);
        const inFr =
            (r.han_simplified && freq[r.han_simplified] != null) ||
            (r.han_traditional && freq[r.han_traditional] != null);
        if ((!r.jyutping || !r.jyutping.trim()) && inJy) {
            const w = r.han_simplified && jy[r.han_simplified] ? r.han_simplified : r.han_traditional;
            fillJy.push({ id: r.id, w, jy: jy[w][0] });
        }
        if (r.frequency == null && inFr) {
            const w = r.han_simplified && freq[r.han_simplified] != null ? r.han_simplified : r.han_traditional;
            fillFr.push({ id: r.id, w, fr: freq[w] });
        }
    }

    // CREATE: hanzi words in freq with count >= MIN_FREQ, not in DB
    const newWords = [];
    if (!NO_CREATE) {
        for (const [w, c] of Object.entries(freq)) {
            if (c < MIN_FREQ) continue;
            if (!isHan(w)) continue;
            if (dbSimp.has(w) || dbTrad.has(w)) continue;
            if (newWords.some((x) => x.w === w)) continue;
            newWords.push({ w, fr: c, jy: jy[w]?.[0] ?? null });
        }
    }

    console.log(`MODE: ${APPLY ? "APPLY (WRITES)" : "DRY (preview)"}  min-freq=${MIN_FREQ}`);
    console.log(`  fill jyutping (missing):  ${fillJy.length}`);
    console.log(`  fill frequency (missing): ${fillFr.length}`);
    console.log(`  create new cantonese:     ${newWords.length}`);
    console.log("\n--- fill jyutping samples ---");
    for (const s of fillJy.slice(0, 8)) console.log(`  ${s.w} -> ${s.jy}`);
    console.log("\n--- fill freq samples ---");
    for (const s of fillFr.slice(0, 5)) console.log(`  ${s.w} -> ${s.fr}`);
    console.log("\n--- create samples ---");
    for (const s of newWords.slice(0, 12)) console.log(`  ${s.w} (${toTrad(s.w)}) jy=${s.jy} freq=${s.fr}`);

    if (!APPLY) {
        console.log("\n(dry run — run with --apply to write)");
        await pool.end();
        return;
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        let nJ = 0;
        for (const s of fillJy) {
            await client.query(
                "UPDATE vocabularies SET jyutping=$1, updated_at=now() WHERE id=$2 AND (jyutping IS NULL OR jyutping='')",
                [s.jy, s.id],
            );
            nJ++;
        }
        let nF = 0;
        for (const s of fillFr) {
            await client.query(
                "UPDATE vocabularies SET frequency=$1, updated_at=now() WHERE id=$2 AND frequency IS NULL",
                [s.fr, s.id],
            );
            nF++;
        }
        let nC = 0;
        for (const s of newWords) {
            const trad = toTrad(s.w);
            const simp = s.w === trad ? null : s.w;
            const id = stableUUID(trad, simp, null, s.jy ? s.jy.toLowerCase() : "");
            await client.query(
                `INSERT INTO vocabularies (id, han_traditional, han_simplified, jyutping, frequency, created_at, updated_at)
                 SELECT $1,$2,$3,$4,$5, now(), now()
                 WHERE NOT EXISTS (SELECT 1 FROM vocabularies WHERE id=$1)`,
                [id, trad, simp, s.jy ? s.jy.toLowerCase() : null, s.fr],
            );
            nC++;
        }
        await client.query("COMMIT");
        console.log(`\n✔ WROTE: jyutping=${nJ}, frequency=${nF}, create=${nC}`);
    } catch (e) {
        await client.query("ROLLBACK");
        console.error("ROLLED BACK:", e.message);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
