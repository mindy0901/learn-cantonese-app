/**
 * fill-hanchar-freq.mjs — Fill han_characters.frequency from cantowords-freq-chars.json.
 * Data: char -> count (filter to hanzi only).
 * Updates by matching han_traditional OR han_simplified.
 * --dry preview (default), --apply writes.
 */
import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "..", ".env.dev") });
const APPLY = process.argv.includes("--apply");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

function isHan(s) {
    return /[\u4e00-\u9fff]/.test(s);
}

async function main() {
    const freq = JSON.parse(readFileSync(resolve(__dirname, "data", "cantowords-freq-chars.json"), "utf8"));
    const hanzi = Object.entries(freq).filter(([c]) => isHan(c));
    console.log(`freq-chars entries: ${Object.keys(freq).length}, hanzi: ${hanzi.length}`);

    const { rows } = await pool.query("SELECT id, han_traditional, han_simplified FROM han_characters");
    let matched = 0,
        samples = [];
    for (const r of rows) {
        const f = freq[r.han_traditional] ?? (r.han_simplified && freq[r.han_simplified]);
        if (f == null) continue;
        matched++;
        if (samples.length < 8) samples.push({ c: r.han_traditional, f });
        if (APPLY) {
            await pool.query("UPDATE han_characters SET frequency=$1, updated_at=now() WHERE id=$2", [f, r.id]);
        }
    }
    console.log(`MODE: ${APPLY ? "APPLY" : "DRY"}  han_characters matched: ${matched}/${rows.length}`);
    console.log("samples:", JSON.stringify(samples));
    console.log(APPLY ? "✔ DONE" : "(dry run — run with --apply to write)");
    await pool.end();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
