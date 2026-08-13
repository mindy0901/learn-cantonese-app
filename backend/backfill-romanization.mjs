#!/usr/bin/env node
/**
 * backfill-romanization.mjs — Fill vocabularies.romanization_json từ flat fields.
 *
 * Các vocab 1 phiên âm (không nằm trong nhóm merge) có romanization_json = [].
 * Script này tạo romanization = [{ pinyin, jyutping, sinoVietnamese, meanings, examples }]
 * từ các cột flat (pinyin, jyutping, sino_vietnamese, meanings_json).
 *
 * Chỉ UPDATE những dòng có romanization_json rỗng / NULL.
 *
 * Usage:
 *   node /app/backfill-romanization.mjs --dry
 *   node /app/backfill-romanization.mjs --apply
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "..", "..", ".env.dev") });

const pool = new pg.Pool({ connectionString: process.env["DATABASE_URL"] });
const dry = process.argv.includes("--dry");

/** Build one romanization entry from a DB row's flat fields. */
function buildEntry(row) {
    const mj = row.meanings_json ?? {};
    const meanings = Array.isArray(mj.meanings) ? mj.meanings : [];
    const examples = Array.isArray(mj.examples) ? mj.examples : [];
    return {
        pinyin: String(row.pinyin ?? "")
            .toLowerCase()
            .trim(),
        jyutping: String(row.jyutping ?? "")
            .toLowerCase()
            .trim(),
        sinoVietnamese: row.sino_vietnamese ?? "",
        meanings: meanings.map((m, i) => ({
            id: m.id,
            category: m.category ?? "",
            vietMeanings: m.vietMeanings ?? "",
            engMeanings: m.engMeanings ?? "",
            position: m.position ?? i,
            examples: (m.examples ?? []).map((ex, j) => ({
                id: ex.id,
                hanExample: ex.hanExample ?? "",
                jyutpingExample: ex.jyutpingExample ?? "",
                pinyinExample: ex.pinyinExample ?? "",
                vietExamples: ex.vietExamples ?? "",
                engExamples: ex.engExamples ?? "",
                position: ex.position ?? j,
            })),
        })),
        examples: examples.map((ex, i) => ({
            id: ex.id,
            hanExample: ex.hanExample ?? "",
            jyutpingExample: ex.jyutpingExample ?? "",
            pinyinExample: ex.pinyinExample ?? "",
            vietExamples: ex.vietExamples ?? "",
            engExamples: ex.engExamples ?? "",
            position: ex.position ?? i,
        })),
    };
}

async function main() {
    const target = await pool.query(
        `SELECT id, pinyin, jyutping, sino_vietnamese, meanings_json
         FROM vocabularies
         WHERE romanization_json IS NULL OR jsonb_array_length(romanization_json) = 0`,
    );
    console.log(`vocab thiếu romanization: ${target.rows.length}`);

    if (dry) {
        for (const r of target.rows.slice(0, 5)) {
            const e = buildEntry(r);
            console.log(`  [dry] ${r.id} → ${e.pinyin || "-"} | ${e.jyutping || "-"} | meanings=${e.meanings.length}`);
        }
        console.log(`[dry] chạy lại với --apply để ghi DB`);
        return;
    }

    // BATCH update
    const BATCH = 500;
    let updated = 0;
    for (let i = 0; i < target.rows.length; i += BATCH) {
        const batch = target.rows.slice(i, i + BATCH);
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            for (const row of batch) {
                const entry = buildEntry(row);
                await client.query(
                    `UPDATE vocabularies SET romanization_json = $2::jsonb, updated_at = now()
                     WHERE id = $1::uuid AND (romanization_json IS NULL OR jsonb_array_length(romanization_json) = 0)`,
                    [row.id, JSON.stringify([entry])],
                );
            }
            await client.query("COMMIT");
            updated += batch.length;
        } catch (e) {
            await client.query("ROLLBACK");
            throw e;
        } finally {
            client.release();
        }
    }
    console.log(`done: updated=${updated}`);
    await pool.end();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
