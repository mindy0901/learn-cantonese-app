/**
 * fill-jyutping.mjs — Fill jyutping for ALL vocabularies missing it.
 * 3-tier priority (same as sync-jyutping.mjs):
 *   1. cantowords (words.hk) full-word
 *   2. CC-Canto full-word (trad/simp)
 *   3. to-jyutping (context-aware full-word romanization)
 * --dry preview (default), --apply writes.
 */
import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import pg from "pg";
import ToJyutping from "to-jyutping";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "..", ".env.dev") });
const APPLY = process.argv.includes("--apply");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const DATA = resolve(__dirname, "data");

// 1. cantowords full-word
const cantowordsMap = new Map();
{
    const raw = JSON.parse(readFileSync(resolve(DATA, "cantowords-jyutping-words.json"), "utf8"));
    for (const [word, readings] of Object.entries(raw)) {
        const jp = Array.isArray(readings) && readings.length ? String(readings[0]).trim() : "";
        if (word && jp) cantowordsMap.set(word, jp);
    }
}
// 2. CC-Canto
const cantoMap = new Map();
{
    const raw = JSON.parse(readFileSync(resolve(DATA, "cccanto.json"), "utf8"));
    for (const e of raw) {
        if (!e.jp) continue;
        if (!cantoMap.has(e.t)) cantoMap.set(e.t, e.jp);
        if (e.s && !cantoMap.has(e.s)) cantoMap.set(e.s, e.jp);
    }
}

async function main() {
    console.log(`cantowords: ${cantowordsMap.size}, cc-canto: ${cantoMap.size}`);
    const { rows } = await pool.query("SELECT id, han_traditional, han_simplified, pinyin, jyutping FROM vocabularies");
    let t1 = 0,
        t2 = 0,
        t3 = 0,
        none = 0,
        skippedPure = 0,
        keptExisting = 0;
    const updates = [];
    for (const v of rows) {
        const trad = (v.han_traditional || "").trim();
        const simp = (v.han_simplified || "").trim();
        const isPureCantonese = v.jyutping && v.jyutping.trim() && (!v.pinyin || !v.pinyin.trim());
        if (isPureCantonese) {
            // never overwrite pure-Cantonese jyutping
            skippedPure++;
            continue;
        }
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
        if (src === "cantowords") t1++;
        else if (src === "cc-canto") t2++;
        else t3++;
        const normalized = jp.trim().toLowerCase();
        if (v.jyutping && v.jyutping.trim() === normalized) {
            keptExisting++; // unchanged
            continue;
        }
        updates.push({ id: v.id, jyutping: normalized, src });
    }
    console.log(`MODE: ${APPLY ? "APPLY" : "DRY"}  total: ${rows.length}`);
    console.log(`  overwrite: ${updates.length} (cantowords: ${t1} | cc-canto: ${t2} | to-jyutping: ${t3})`);
    console.log(`  skipped pure-Cantonese: ${skippedPure} | already same: ${keptExisting} | none: ${none}`);
    for (const u of updates.slice(0, 12)) console.log(`  ${u.src}: ${u.jyutping}`);

    if (APPLY) {
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            let n = 0;
            for (const u of updates) {
                await client.query("UPDATE vocabularies SET jyutping=$1, updated_at=now() WHERE id=$2", [
                    u.jyutping,
                    u.id,
                ]);
                n++;
            }
            await client.query("COMMIT");
            console.log(`\n✔ WROTE ${n} rows`);
        } catch (e) {
            await client.query("ROLLBACK");
            console.error("ROLLED BACK:", e.message);
            process.exitCode = 1;
        } finally {
            client.release();
        }
    } else {
        console.log("\n(dry run — run with --apply to write)");
    }
    await pool.end();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
