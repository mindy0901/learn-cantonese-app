/**
 * filter-vocab.mjs — Safely remove "pure" entries from vocabularies:
 *  1. variant-pure: meaning is ONLY "Variant of / Erhua variant / Old variant..." (no ';' = no other sense)
 *  2. surname-pure: meaning is ONLY "Surname X" / "A surname"
 *  3. city-pure:    meaning is ONLY a city/province description (no other sense)
 * Rows with additional real senses (contain ';' or extra text) are KEPT.
 * Deletes related user_vocabularies / vocabulary_characters / meanings / examples / flashcard links.
 * --dry preview (default), --apply deletes.
 */
import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "..", ".env.dev") });
const APPLY = process.argv.includes("--apply");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

function isVariantPure(en) {
    const s = String(en ?? "")
        .trim()
        .toLowerCase();
    return /^(variant of|erhua variant|old variant|variant:)/.test(s) && !s.includes(";");
}
function isSurnamePure(en) {
    const s = String(en ?? "").trim();
    if (s.includes(";")) return false;
    return /^(surname\s|a surname|surnames?\s)/i.test(s);
}
function isCityPure(en) {
    const s = String(en ?? "")
        .trim()
        .toLowerCase();
    if (s.includes(";")) return false;
    if (/^ancient city|^old city|^ancient towns?/.test(s)) return false; // 古城 = "ancient city", a concept
    return /(capital of|prefecture|subprovincial|municipality|provincial capital|city in|city of|prefecture-level)/.test(
        s,
    );
}

async function main() {
    const { rows } = await pool.query(
        "SELECT id, han_traditional, han_simplified, eng_meanings, viet_meanings FROM vocabularies",
    );
    const variant = [],
        surname = [],
        city = [];
    for (const r of rows) {
        if (isVariantPure(r.eng_meanings) || isVariantPure(r.viet_meanings)) variant.push(r);
        else if (isSurnamePure(r.eng_meanings)) surname.push(r);
        else if (isCityPure(r.eng_meanings)) city.push(r);
    }
    console.log(`MODE: ${APPLY ? "APPLY (DELETES)" : "DRY (preview)"}`);
    console.log(`  variant-pure:  ${variant.length}`);
    console.log(`  surname-pure:  ${surname.length}`);
    console.log(`  city-pure:     ${city.length}`);
    console.log(`  TOTAL to delete: ${variant.length + surname.length + city.length}`);
    console.log("\n--- variant samples ---");
    for (const r of variant.slice(0, 10)) console.log(`  ${r.han_traditional} | ${r.eng_meanings}`);
    console.log("\n--- surname samples ---");
    for (const r of surname.slice(0, 10)) console.log(`  ${r.han_traditional} | ${r.eng_meanings}`);
    console.log("\n--- city samples ---");
    for (const r of city.slice(0, 15)) console.log(`  ${r.han_traditional} | ${r.eng_meanings}`);

    if (APPLY) {
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const all = [...variant, ...surname, ...city];
            let n = 0;
            for (const r of all) {
                await client.query("DELETE FROM user_vocabularies WHERE vocabulary_id=$1", [r.id]);
                await client.query("DELETE FROM vocabulary_characters WHERE vocabulary_id=$1", [r.id]);
                await client.query("DELETE FROM vocabulary_meanings WHERE vocabulary_id=$1", [r.id]);
                await client.query("DELETE FROM vocabulary_examples WHERE vocabulary_id=$1", [r.id]);
                await client.query("DELETE FROM flashcard_deck_vocabularies WHERE vocabulary_id=$1", [r.id]);
                await client.query("DELETE FROM vocabularies WHERE id=$1", [r.id]);
                n++;
            }
            await client.query("COMMIT");
            console.log(`\n✔ DELETED ${n} rows`);
        } catch (e) {
            await client.query("ROLLBACK");
            console.error("ROLLED BACK:", e.message);
            process.exitCode = 1;
        } finally {
            client.release();
        }
    } else {
        console.log("\n(dry run — run with --apply to delete)");
    }
    await pool.end();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
