/**
 * analyze-ccc-full.mjs — Dry analysis: how many vocabularies would be affected
 * if we apply the FULL CC-Canto treatment (all entries / all readings, grouped
 * by jyutping reading) across the whole bank.
 *
 * Reports counts only — no DB writes.
 */
import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "..", ".env.dev") });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const DATA = resolve(__dirname, "data");

async function main() {
    let toSimp = (s) => s,
        toTrad = (s) => s;
    try {
        const OpenCC = await import("opencc-js");
        toSimp = OpenCC.Converter({ from: "hk", to: "cn" });
        toTrad = OpenCC.Converter({ from: "cn", to: "hk" });
    } catch {
        /* self */
    }

    const ccc = JSON.parse(readFileSync(resolve(DATA, "cccanto.json"), "utf8"));
    // index: form (s or t) -> array of ALL entries (keep every sense/reading)
    const byForm = new Map();
    for (const e of ccc) {
        for (const k of new Set([e.s, e.t].filter(Boolean))) {
            if (!byForm.has(k)) byForm.set(k, []);
            byForm.get(k).push(e);
        }
    }
    const matchesFor = (vocab) => {
        const forms = new Set();
        if (vocab.han_traditional) {
            forms.add(vocab.han_traditional);
            forms.add(toSimp(vocab.han_traditional));
        }
        if (vocab.han_simplified) {
            forms.add(vocab.han_simplified);
            forms.add(toTrad(vocab.han_simplified));
        }
        const entries = new Map(); // dedupe by entry object identity
        for (const f of forms) {
            for (const e of byForm.get(f) ?? []) entries.set(e, e);
        }
        return [...entries.values()];
    };

    const { rows } = await pool.query(
        `SELECT id, han_simplified, han_traditional, pure_cantonese, viet_meanings, eng_meanings
         FROM vocabularies`,
    );

    let withCcc = 0,
        multiEntry = 0,
        wouldChange = 0,
        pureCcChange = 0,
        nonPureWithCcc = 0;
    const pc = rows.filter((r) => r.pure_cantonese).length;

    for (const r of rows) {
        const entries = matchesFor(r);
        if (entries.length === 0) continue;
        withCcc++;
        if (entries.length > 1) multiEntry++;
        // combined full english from all entries
        const fullEn = [...new Set(entries.flatMap((e) => e.en ?? []))]
            .filter((x) => x && x !== "# adapted from cc-cedict")
            .join("; ");
        const curEn = (r.eng_meanings || "").trim();
        const norm = (s) => s.replace(/\s+/g, " ").toLowerCase();
        if (norm(fullEn) !== norm(curEn)) {
            wouldChange++;
            if (r.pure_cantonese) pureCcChange++;
        }
        if (!r.pure_cantonese) nonPureWithCcc++;
    }

    console.log("=== FULL CC-Canto treatment — dry analysis ===");
    console.log(`Total vocabularies              : ${rows.length}`);
    console.log(`  pureCantonese                 : ${pc}`);
    console.log(`Matched ≥1 CC-Canto entry       : ${withCcc}`);
    console.log(`  non-pureCantonese with match  : ${nonPureWithCcc}`);
    console.log(`Matched ≥2 CC-Canto entries     : ${multiEntry}  (would get grouped readings)`);
    console.log(`Current eng differs from full CC-Canto (would change): ${wouldChange}`);
    console.log(`  of which pureCantonese        : ${pureCcChange}`);
    console.log("(CC-Canto local data has no example field — nothing to add for examples)");
    await pool.end();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
