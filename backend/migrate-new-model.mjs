/**
 * Migration model mới (2026-08-14):
 *   1) --convert: romanization_json legacy typed array → { mandarin, cantonese } blocks
 *      (dùng blocksFromRow + flatDerivedFromBlocks — cùng logic READ path).
 *      Đồng thời recompute search_key từ blocks.
 *   2) --drop: drop các cột flat cũ (pinyin, jyutping, sino_vietnamese,
 *      viet_meanings, eng_meanings, viet_examples, pinyin_numeric, meanings_json).
 *
 * KHÔNG drop pure_cantonese (flag manual "tiếng Quảng thuần" — giữ cột).
 * Hỗ trợ --dry. Chạy: node /app/migrate-new-model.mjs --convert --dry|--apply
 *                          node /app/migrate-new-model.mjs --drop
 */
import pg from "pg";
import { blocksFromRow, flatDerivedFromBlocks } from "./lib/vocabModel.js";

const CONVERT = process.argv.includes("--convert");
const DROP = process.argv.includes("--drop");
const DRY = process.argv.includes("--dry");
const LIMIT = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] || 0);

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

if (CONVERT) {
    const baseSql = `SELECT id, han_simplified, han_traditional, han_hongkong, romanization_json, search_key
                     FROM vocabularies ORDER BY id`;
    const rows = LIMIT > 0 ? await pool.query(`${baseSql} LIMIT $1`, [LIMIT]) : await pool.query(baseSql);
    let changed = 0;
    let same = 0;
    const examples = [];
    for (const row of rows.rows) {
        const vocab = {
            id: row.id,
            hanSimplified: row.han_simplified,
            hanTraditional: row.han_traditional,
            hanHongKong: row.han_hongkong,
            romanizationJson: row.romanization_json,
        };
        const blocks = blocksFromRow(vocab);
        const newRj = JSON.stringify(blocks);
        const newSk = flatDerivedFromBlocks(blocks).searchKey ?? null;
        const oldRj = JSON.stringify(row.romanization_json);
        if (newRj === oldRj && newSk === (row.search_key ?? null)) {
            same++;
            continue;
        }
        changed++;
        if (examples.length < 20) {
            examples.push({
                simp: row.han_simplified,
                old: oldRj.slice(0, 120),
                fresh: newRj.slice(0, 120),
            });
        }
        if (!DRY) {
            await pool.query(
                `UPDATE vocabularies SET romanization_json = $1, search_key = $2, updated_at = now() WHERE id = $3`,
                [newRj, newSk, row.id],
            );
        }
    }
    console.log(
        `CONVERT total: ${rows.rowCount} | changed: ${changed} | same: ${same} | mode: ${DRY ? "DRY" : "APPLY"}`,
    );
    for (const ex of examples) {
        console.log(`  ${ex.simp}: ${ex.old} → ${ex.fresh}`);
    }
}

if (DROP) {
    const cols = [
        "sino_vietnamese",
        "pinyin",
        "jyutping",
        "viet_meanings",
        "eng_meanings",
        "viet_examples",
        "pinyin_numeric",
        "meanings_json",
    ];
    for (const c of cols) {
        await pool.query(`ALTER TABLE vocabularies DROP COLUMN IF EXISTS "${c}"`);
        console.log(`DROPPED column: ${c}`);
    }
    console.log("DROP done.");
}

await pool.end();
