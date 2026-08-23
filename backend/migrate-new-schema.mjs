/**
 * Migration schema MỚI (2026-08-16) — bỏ `romanization_json` (JSONB).
 *
 * Chuẩn hóa vocab thành bảng quan hệ (khớp `_zhang_proposed.json`):
 *   vocabularies      id, han_simplified, han_traditional, han_hongkong, hsk_level,
 *                     frequency, movie_word_rank, book_word_rank, boost, han_characters,
 *                     created_at, updated_at
 *   vocabulary_readings   ← mandarin + cantonese (system = "pinyin" | "jyutping")
 *   vocabulary_meanings
 *   vocabulary_examples
 *
 * DROP cột: romanization_json, pure_cantonese, search_key, part_of_speech,
 *           radical, classifiers, related_words, characters.
 * (GIỮ `boost` = popularity; GIỮ `han_characters` — user chốt.)
 *
 * Chạy: docker compose -f docker-compose.dev.yml exec -T backend \
 *         node /app/migrate-new-schema.mjs --dry|--apply
 */
import pg from "pg";
import { randomUUID } from "crypto";

const DRY = process.argv.includes("--dry");
const APPLY = process.argv.includes("--apply");
const LIMIT = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] || 0);

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const CREATE_TABLES = `
CREATE TABLE IF NOT EXISTS vocabulary_readings (
    id               uuid PRIMARY KEY,
    vocabulary_id    uuid NOT NULL REFERENCES vocabularies(id) ON DELETE CASCADE,
    system           varchar NOT NULL,
    romanization     varchar NOT NULL,
    sino_vietnamese  varchar NOT NULL DEFAULT '',
    position         int NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_vocab_readings_vocab ON vocabulary_readings(vocabulary_id);
CREATE INDEX IF NOT EXISTS idx_vocab_readings_roman ON vocabulary_readings(romanization);

CREATE TABLE IF NOT EXISTS vocabulary_meanings (
    id          uuid PRIMARY KEY,
    reading_id  uuid NOT NULL REFERENCES vocabulary_readings(id) ON DELETE CASCADE,
    position    int NOT NULL DEFAULT 0,
    category    varchar NOT NULL DEFAULT '',
    zh          varchar NOT NULL DEFAULT '',
    yue         varchar NOT NULL DEFAULT '',
    vi          text NOT NULL DEFAULT '',
    en          text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_vocab_meanings_reading ON vocabulary_meanings(reading_id);

CREATE TABLE IF NOT EXISTS vocabulary_examples (
    id           uuid PRIMARY KEY,
    meaning_id   uuid NOT NULL REFERENCES vocabulary_meanings(id) ON DELETE CASCADE,
    position     int NOT NULL DEFAULT 0,
    zh           varchar NOT NULL DEFAULT '',
    yue          varchar NOT NULL DEFAULT '',
    romanization varchar NOT NULL DEFAULT '',
    vi           text NOT NULL DEFAULT '',
    en           text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_vocab_examples_meaning ON vocabulary_examples(meaning_id);
`;

const DROP_COLUMNS = [
    "romanization_json",
    "pure_cantonese",
    "search_key",
    "part_of_speech",
    "radical",
    "classifiers",
    "related_words",
    "characters",
];

async function main() {
    if (!DRY && !APPLY) {
        console.error("Dùng --dry (preview) hoặc --apply (ghi DB).");
        process.exit(1);
    }

    const mode = DRY ? "DRY" : "APPLY";

    // ── 1) Tạo bảng (apply) / báo hiện trạng (dry) ──
    const tablesExist = {};
    for (const t of ["vocabulary_readings", "vocabulary_meanings", "vocabulary_examples"]) {
        const r = await pool.query(
            `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
            [t],
        );
        tablesExist[t] = r.rows.length > 0;
    }
    console.log(`[${mode}] bảng mới:`, tablesExist);
    if (!DRY) {
        await pool.query(CREATE_TABLES);
        console.log(`[${mode}] đã tạo/đảm bảo 3 bảng mới.`);
    }

    // ── 2) Đọc vocab + parse blocks ──
    const baseSql = `SELECT id, han_simplified, han_traditional, han_hongkong, romanization_json
                     FROM vocabularies
                     WHERE romanization_json IS NOT NULL ORDER BY id`;
    const rows = LIMIT > 0 ? (await pool.query(`${baseSql} LIMIT $1`, [LIMIT])).rows : (await pool.query(baseSql)).rows;

    let totalReadings = 0;
    let totalMeanings = 0;
    let totalExamples = 0;
    const readingRows = [];
    const meaningRows = [];
    const exampleRows = [];

    // id trong JSONB là stable theo content/romanization → có thể TRÙNG giữa các
    // vocab (JSONB chấp nhận). Bảng quan hệ cần id duy nhất toàn cục → mỗi ROW
    // sinh UUID riêng; meaning/example tham chiếu trực tiếp id của row cha.
    for (const row of rows) {
        let rj = row.romanization_json;
        if (typeof rj === "string") rj = JSON.parse(rj);
        // Legacy typed-array → blocks (dùng logic chuẩn hoá nội bộ)
        let blocks;
        try {
            const { blocksFromRow } = await import("./lib/vocabModel.js");
            blocks = blocksFromRow({
                hanSimplified: row.han_simplified,
                hanTraditional: row.han_traditional,
                hanHongKong: row.han_hongkong,
                romanizationJson: rj,
            });
        } catch (e) {
            console.error("Lỗi parse blocks", row.id, e.message);
            continue;
        }
        for (const [side, block] of [
            ["mandarin", blocks.mandarin],
            ["cantonese", blocks.cantonese],
        ]) {
            const system = side === "mandarin" ? "pinyin" : "jyutping";
            (block?.readings ?? []).forEach((r, ri) => {
                const readingId = randomUUID();
                readingRows.push([readingId, row.id, system, r.romanization, r.sino_vietnamese ?? "", ri]);
                totalReadings++;
                (r.meanings ?? []).forEach((m, mi) => {
                    const meaningId = randomUUID();
                    meaningRows.push([
                        meaningId,
                        readingId,
                        m.position ?? mi,
                        m.category ?? "",
                        m.zh ?? "",
                        m.yue ?? "",
                        m.vi ?? "",
                        m.en ?? "",
                    ]);
                    totalMeanings++;
                    (m.examples ?? []).forEach((ex, ei) => {
                        exampleRows.push([
                            randomUUID(),
                            meaningId,
                            ex.position ?? ei,
                            ex.zh ?? "",
                            ex.yue ?? "",
                            ex.romanization ?? "",
                            ex.vi ?? "",
                            ex.en ?? "",
                        ]);
                        totalExamples++;
                    });
                });
            });
        }
    }

    console.log(
        `[${mode}] vocab nguồn: ${rows.length} | readings: ${totalReadings} | meanings: ${totalMeanings} | examples: ${totalExamples}`,
    );

    if (DRY) {
        console.log(`[${mode}] preview xong — chạy --apply để ghi.`);
        await pool.end();
        return;
    }

    // ── 3) Ghi data (trong transaction) ──
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await client.query("DELETE FROM vocabulary_examples");
        await client.query("DELETE FROM vocabulary_meanings");
        await client.query("DELETE FROM vocabulary_readings");

        const insReading = `INSERT INTO vocabulary_readings (id, vocabulary_id, system, romanization, sino_vietnamese, position)
                            VALUES ($1,$2,$3,$4,$5,$6)`;
        const insMeaning = `INSERT INTO vocabulary_meanings (id, reading_id, position, category, zh, yue, vi, en)
                            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`;
        const insExample = `INSERT INTO vocabulary_examples (id, meaning_id, position, zh, yue, romanization, vi, en)
                            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`;

        // Batch 500
        for (let i = 0; i < readingRows.length; i += 500) {
            const batch = readingRows.slice(i, i + 500);
            for (const r of batch) await client.query(insReading, r);
        }
        for (let i = 0; i < meaningRows.length; i += 500) {
            const batch = meaningRows.slice(i, i + 500);
            for (const r of batch) await client.query(insMeaning, r);
        }
        for (let i = 0; i < exampleRows.length; i += 500) {
            const batch = exampleRows.slice(i, i + 500);
            for (const r of batch) await client.query(insExample, r);
        }

        await client.query("COMMIT");
        console.log(`[${mode}] đã insert readings/meanings/examples.`);
    } catch (e) {
        await client.query("ROLLBACK");
        console.error("Lỗi insert:", e.message);
        await client.end();
        process.exit(1);
    } finally {
        client.release();
    }

    // ── 4) Verify counts ──
    for (const t of ["vocabulary_readings", "vocabulary_meanings", "vocabulary_examples"]) {
        const r = await pool.query(`SELECT COUNT(*)::int AS c FROM ${t}`);
        console.log(`[${mode}] count ${t}: ${r.rows[0].c}`);
    }

    // ── 5) Drop cột cũ ──
    for (const col of DROP_COLUMNS) {
        const has = await pool.query(
            `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='vocabularies' AND column_name=$1`,
            [col],
        );
        if (has.rows.length > 0) {
            await pool.query(`ALTER TABLE vocabularies DROP COLUMN IF EXISTS "${col}"`);
            console.log(`[${mode}] đã drop cột ${col}`);
        }
    }

    console.log(`[${mode}] DONE.`);
    await pool.end();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
