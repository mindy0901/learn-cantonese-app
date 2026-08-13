#!/usr/bin/env node
/**
 * merge-top-examples.mjs — Chuyển top-level `examples` vào meanings[0].examples.
 *
 * Sau khi bỏ key `examples` (top-level, không thuộc meaning) khỏi shape
 * romanization/meanings, các example đứng độc lập sẽ bị mất. Script này
 * gắn chúng vào meaning đầu tiên (meanings[0].examples) của cùng entry.
 *
 * Chỉ xử lý các vocab có romanization_json[].examples / meanings_json.examples
 * không rỗng. Xóa key `examples` sau khi đã gắn.
 *
 * Usage:
 *   node /app/merge-top-examples.mjs --dry
 *   node /app/merge-top-examples.mjs --apply
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "..", "..", ".env.dev") });

const pool = new pg.Pool({ connectionString: process.env["DATABASE_URL"] });
const dry = process.argv.includes("--dry");

function mergeEntryExamples(entry) {
    const topExamples = Array.isArray(entry?.examples) ? entry.examples : [];
    if (topExamples.length === 0) return { changed: false, entry };
    // Gắn vào meaning đầu tiên (tạo nếu chưa có)
    const meanings = Array.isArray(entry.meanings) ? entry.meanings.map((m) => ({ ...m })) : [];
    if (meanings.length === 0) {
        meanings.push({ category: "", vietMeanings: "", engMeanings: "", examples: [] });
    }
    const first = { ...meanings[0], examples: [...(meanings[0]?.examples ?? []), ...topExamples] };
    meanings[0] = first;
    const next = { ...entry, meanings, examples: [] };
    return { changed: true, entry: next };
}

async function main() {
    const rows = await pool.query(
        `SELECT id, han_traditional, romanization_json, meanings_json FROM vocabularies
         WHERE EXISTS (
             SELECT 1 FROM jsonb_array_elements(COALESCE(romanization_json, '[]'::jsonb)) r
             WHERE jsonb_array_length(COALESCE(r->'examples', '[]'::jsonb)) > 0
         )
         OR EXISTS (
             SELECT 1 FROM jsonb_array_elements(COALESCE(meanings_json->'examples', '[]'::jsonb)) e
         )`,
    );
    console.log(`vocab có top-level examples: ${rows.rows.length}`);

    let updated = 0;
    for (const row of rows.rows) {
        const rom = Array.isArray(row.romanization_json) ? row.romanization_json : [];
        let romChanged = false;
        const nextRom = rom.map((r) => {
            const res = mergeEntryExamples(r);
            if (res.changed) romChanged = true;
            return res.entry;
        });

        // meanings_json top-level examples → meanings[0]
        const mj = row.meanings_json ?? {};
        const mjTop = Array.isArray(mj.examples) ? mj.examples : [];
        let mjChanged = false;
        let nextMj = mj;
        if (mjTop.length > 0) {
            const meanings = Array.isArray(mj.meanings) ? mj.meanings.map((m) => ({ ...m })) : [];
            if (meanings.length === 0) {
                meanings.push({ category: "", vietMeanings: "", engMeanings: "", examples: [] });
            }
            meanings[0] = { ...meanings[0], examples: [...(meanings[0]?.examples ?? []), ...mjTop] };
            nextMj = { ...mj, meanings, examples: [] };
            mjChanged = true;
        }

        if (dry) {
            const changed = romChanged || mjChanged;
            console.log(
                `  [dry] ${row.han_traditional}: ${changed ? "có top-level examples → sẽ gắn vào meanings[0]" : "không đổi"}`,
            );
            if (changed) updated++;
            continue;
        }
        if (!romChanged && !mjChanged) continue;

        await pool.query(
            `UPDATE vocabularies SET romanization_json = $2::jsonb, meanings_json = $3::jsonb, updated_at = now()
             WHERE id = $1::uuid`,
            [row.id, JSON.stringify(nextRom), JSON.stringify(nextMj)],
        );
        updated++;
    }

    console.log(`\nđã xử lý: ${updated}`);
    if (dry) console.log("[dry] chạy lại với --apply để ghi DB");
    await pool.end();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
