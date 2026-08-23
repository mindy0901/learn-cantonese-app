/**
 * Migration TÁCH MANDARIN / CANTONESE (2026-08-17).
 *
 * Chia dữ liệu cũ (1 bảng `vocabularies` + `vocabulary_readings/meanings/examples`
 * dùng cột `system`) thành 2 hệ bảng độc lập, bỏ hẳn cột `system`:
 *
 *   mandarin_vocabularies
 *     └─ mandarin_vocabulary_romanizations (pinyin)
 *          └─ mandarin_vocabulary_meanings (zh / vi / en)
 *               └─ mandarin_vocabulary_examples (zh / romanization / vi / en)
 *   mandarin_vocabulary_characters
 *   flashcard_deck_mandarin_vocabularies / vocabulary_set_mandarin_vocabularies
 *
 *   cantonese_vocabularies
 *     └─ cantonese_vocabulary_romanizations (jyutping)
 *          └─ cantonese_vocabulary_meanings (yue / vi / en)
 *               └─ cantonese_vocabulary_examples (yue / romanization / vi / en)
 *   cantonese_vocabulary_characters
 *   flashcard_deck_cantonese_vocabularies / vocabulary_set_cantonese_vocabularies
 *
 * Quy tắc tách:
 *   - 1 vocab cũ → 1 row mandarin (nếu có pinyin) + 1 row cantonese (luôn có jyutping),
 *     id MỚI (randomUUID) — 2 bên không share id.
 *   - meaning/example: bên mandarin GIỮ `zh` (bỏ `yue`); bên cantonese GIỮ `yue` (bỏ `zh`).
 *   - `vocabulary_characters` + `flashcard_deck_vocabularies` + `vocabulary_set_vocabularies`
 *     → DUPLICATE sang cả 2 bên (vocab cũ mang cả 2 ngôn ngữ).
 *   - `user_vocabularies` → BỎ HẲN (user chốt không lưu lịch sử).
 *
 * ⚠️ Script này KHÔNG drop bảng cũ — chạy `--drop` riêng sau khi đã kiểm tra dữ liệu mới.
 *
 * Chạy: docker compose -f docker-compose.dev.yml exec -T backend \
 *         node /app/migrate-split-lang.mjs --dry|--apply
 */
import pg from "pg";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

const DRY = process.argv.includes("--dry");
const APPLY = process.argv.includes("--apply");
const DROP = process.argv.includes("--drop");
const LIMIT = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] || 0);

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// ────────────────────────── DDL (14 bảng mới) ──────────────────────────
const CREATE_SQL = `
CREATE TABLE IF NOT EXISTS mandarin_vocabularies (
    id               uuid PRIMARY KEY,
    hanzi_simplified varchar NOT NULL DEFAULT '',
    hanzi_traditional varchar NOT NULL DEFAULT '',
    hanzi_characters jsonb,
    hsk_level        varchar NOT NULL DEFAULT '',
    popularity       real,
    created_at       timestamp NOT NULL DEFAULT now(),
    updated_at       timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mv_hsk  ON mandarin_vocabularies(hsk_level);
CREATE INDEX IF NOT EXISTS idx_mv_simp ON mandarin_vocabularies(hanzi_simplified);
CREATE INDEX IF NOT EXISTS idx_mv_trad ON mandarin_vocabularies(hanzi_traditional);

CREATE TABLE IF NOT EXISTS mandarin_vocabulary_romanizations (
    id                       uuid PRIMARY KEY,
    mandarin_vocabulary_id   uuid NOT NULL REFERENCES mandarin_vocabularies(id) ON DELETE CASCADE,
    pinyin                   varchar NOT NULL DEFAULT '',
    sino_vietnamese          varchar NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_mvr_vocab ON mandarin_vocabulary_romanizations(mandarin_vocabulary_id);

CREATE TABLE IF NOT EXISTS mandarin_vocabulary_meanings (
    id                                 uuid PRIMARY KEY,
    mandarin_vocabulary_romanization_id uuid NOT NULL REFERENCES mandarin_vocabulary_romanizations(id) ON DELETE CASCADE,
    category                           varchar NOT NULL DEFAULT '',
    zh                                 varchar NOT NULL DEFAULT '',
    vi                                 text NOT NULL DEFAULT '',
    en                                 text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_mvm_roman ON mandarin_vocabulary_meanings(mandarin_vocabulary_romanization_id);

CREATE TABLE IF NOT EXISTS mandarin_vocabulary_examples (
    id                             uuid PRIMARY KEY,
    mandarin_vocabulary_meaning_id uuid NOT NULL REFERENCES mandarin_vocabulary_meanings(id) ON DELETE CASCADE,
    zh                             varchar NOT NULL DEFAULT '',
    romanization                   varchar NOT NULL DEFAULT '',
    vi                             text NOT NULL DEFAULT '',
    en                             text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_mve_meaning ON mandarin_vocabulary_examples(mandarin_vocabulary_meaning_id);

CREATE TABLE IF NOT EXISTS mandarin_vocabulary_characters (
    id                     uuid PRIMARY KEY,
    mandarin_vocabulary_id uuid NOT NULL REFERENCES mandarin_vocabularies(id) ON DELETE CASCADE,
    hanzi_character_id     uuid NOT NULL REFERENCES han_characters(id) ON DELETE CASCADE,
    position               smallint NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mvc_vocab_char ON mandarin_vocabulary_characters(mandarin_vocabulary_id, hanzi_character_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mvc_vocab_pos  ON mandarin_vocabulary_characters(mandarin_vocabulary_id, position);
CREATE INDEX IF NOT EXISTS idx_mvc_char            ON mandarin_vocabulary_characters(hanzi_character_id);

CREATE TABLE IF NOT EXISTS flashcard_deck_mandarin_vocabularies (
    id                     uuid PRIMARY KEY,
    deck_id                uuid NOT NULL REFERENCES flashcard_decks(id) ON DELETE CASCADE,
    mandarin_vocabulary_id uuid NOT NULL REFERENCES mandarin_vocabularies(id) ON DELETE CASCADE,
    position               smallint NOT NULL DEFAULT 0,
    created_at             timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fdmv_deck_vocab ON flashcard_deck_mandarin_vocabularies(deck_id, mandarin_vocabulary_id);
CREATE INDEX IF NOT EXISTS idx_fdmv_vocab            ON flashcard_deck_mandarin_vocabularies(mandarin_vocabulary_id);

CREATE TABLE IF NOT EXISTS vocabulary_set_mandarin_vocabularies (
    id                     uuid PRIMARY KEY,
    set_id                 uuid NOT NULL REFERENCES vocabulary_sets(id) ON DELETE CASCADE,
    mandarin_vocabulary_id uuid NOT NULL REFERENCES mandarin_vocabularies(id) ON DELETE CASCADE,
    position               smallint NOT NULL DEFAULT 0,
    created_at             timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_vsmv_set_vocab ON vocabulary_set_mandarin_vocabularies(set_id, mandarin_vocabulary_id);
CREATE INDEX IF NOT EXISTS idx_vsmv_vocab           ON vocabulary_set_mandarin_vocabularies(mandarin_vocabulary_id);

CREATE TABLE IF NOT EXISTS cantonese_vocabularies (
    id                  uuid PRIMARY KEY,
    hanzi_simplified    varchar NOT NULL DEFAULT '',
    hanzi_traditional_hk varchar NOT NULL DEFAULT '',
    pure_cantonese      boolean NOT NULL DEFAULT false,
    popularity          real,
    hanzi_characters    jsonb,
    created_at          timestamp NOT NULL DEFAULT now(),
    updated_at          timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cv_hk  ON cantonese_vocabularies(hanzi_traditional_hk);
CREATE INDEX IF NOT EXISTS idx_cv_pure ON cantonese_vocabularies(pure_cantonese);

CREATE TABLE IF NOT EXISTS cantonese_vocabulary_romanizations (
    id                      uuid PRIMARY KEY,
    cantonese_vocabulary_id uuid NOT NULL REFERENCES cantonese_vocabularies(id) ON DELETE CASCADE,
    jyutping                varchar NOT NULL DEFAULT '',
    sino_vietnamese         varchar NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_cvr_vocab ON cantonese_vocabulary_romanizations(cantonese_vocabulary_id);

CREATE TABLE IF NOT EXISTS cantonese_vocabulary_meanings (
    id                                  uuid PRIMARY KEY,
    cantonese_vocabulary_romanization_id uuid NOT NULL REFERENCES cantonese_vocabulary_romanizations(id) ON DELETE CASCADE,
    category                            varchar NOT NULL DEFAULT '',
    yue                                 varchar NOT NULL DEFAULT '',
    vi                                  text NOT NULL DEFAULT '',
    en                                  text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_cvm_roman ON cantonese_vocabulary_meanings(cantonese_vocabulary_romanization_id);

CREATE TABLE IF NOT EXISTS cantonese_vocabulary_examples (
    id                              uuid PRIMARY KEY,
    cantonese_vocabulary_meaning_id uuid NOT NULL REFERENCES cantonese_vocabulary_meanings(id) ON DELETE CASCADE,
    yue                             varchar NOT NULL DEFAULT '',
    romanization                    varchar NOT NULL DEFAULT '',
    vi                              text NOT NULL DEFAULT '',
    en                              text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_cve_meaning ON cantonese_vocabulary_examples(cantonese_vocabulary_meaning_id);

CREATE TABLE IF NOT EXISTS cantonese_vocabulary_characters (
    id                      uuid PRIMARY KEY,
    cantonese_vocabulary_id uuid NOT NULL REFERENCES cantonese_vocabularies(id) ON DELETE CASCADE,
    hanzi_character_id      uuid NOT NULL REFERENCES han_characters(id) ON DELETE CASCADE,
    position                smallint NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cvc_vocab_char ON cantonese_vocabulary_characters(cantonese_vocabulary_id, hanzi_character_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cvc_vocab_pos  ON cantonese_vocabulary_characters(cantonese_vocabulary_id, position);
CREATE INDEX IF NOT EXISTS idx_cvc_char            ON cantonese_vocabulary_characters(hanzi_character_id);

CREATE TABLE IF NOT EXISTS flashcard_deck_cantonese_vocabularies (
    id                      uuid PRIMARY KEY,
    deck_id                 uuid NOT NULL REFERENCES flashcard_decks(id) ON DELETE CASCADE,
    cantonese_vocabulary_id uuid NOT NULL REFERENCES cantonese_vocabularies(id) ON DELETE CASCADE,
    position                smallint NOT NULL DEFAULT 0,
    created_at              timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fdcv_deck_vocab ON flashcard_deck_cantonese_vocabularies(deck_id, cantonese_vocabulary_id);
CREATE INDEX IF NOT EXISTS idx_fdcv_vocab            ON flashcard_deck_cantonese_vocabularies(cantonese_vocabulary_id);

CREATE TABLE IF NOT EXISTS vocabulary_set_cantonese_vocabularies (
    id                      uuid PRIMARY KEY,
    set_id                  uuid NOT NULL REFERENCES vocabulary_sets(id) ON DELETE CASCADE,
    cantonese_vocabulary_id uuid NOT NULL REFERENCES cantonese_vocabularies(id) ON DELETE CASCADE,
    position                smallint NOT NULL DEFAULT 0,
    created_at              timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vscv_set_vocab ON vocabulary_set_cantonese_vocabularies(set_id, cantonese_vocabulary_id);
CREATE INDEX IF NOT EXISTS idx_vscv_vocab            ON vocabulary_set_cantonese_vocabularies(cantonese_vocabulary_id);
`;

const OLD_TABLES = [
    "vocabularies",
    "vocabulary_readings",
    "vocabulary_meanings",
    "vocabulary_examples",
    "vocabulary_characters",
    "user_vocabularies",
    "flashcard_deck_vocabularies",
    "vocabulary_set_vocabularies",
];

// ────────────────────────── helpers ──────────────────────────
async function backupCsv(client, table, dir) {
    const file = path.join(dir, `${table}.csv`);
    const r = await client.query(`COPY (SELECT * FROM "${table}") TO STDOUT WITH (FORMAT csv, HEADER true)`);
    const text = r.rows.map((row) => Object.values(row)[0]).join("\n") + "\n";
    fs.writeFileSync(file, text, "utf8");
    return file;
}

async function count(pool, table) {
    const r = await pool.query(`SELECT COUNT(*)::int AS c FROM "${table}"`);
    return r.rows[0].c;
}

// ────────────────────────── main ──────────────────────────
async function main() {
    if (DROP) {
        // ── DROP bảng cũ (riêng, cần xác nhận user) ──
        const mode = "DROP";
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            // xóa theo thứ tự ngược FK
            await client.query("DROP TABLE IF EXISTS vocabulary_set_vocabularies");
            await client.query("DROP TABLE IF EXISTS flashcard_deck_vocabularies");
            await client.query("DROP TABLE IF EXISTS user_vocabularies");
            await client.query("DROP TABLE IF EXISTS vocabulary_characters");
            await client.query("DROP TABLE IF EXISTS vocabulary_examples");
            await client.query("DROP TABLE IF EXISTS vocabulary_meanings");
            await client.query("DROP TABLE IF EXISTS vocabulary_readings");
            await client.query("DROP TABLE IF EXISTS vocabularies");
            await client.query("COMMIT");
            console.log(`[${mode}] đã drop 8 bảng cũ.`);
        } catch (e) {
            await client.query("ROLLBACK");
            console.error(`[${mode}] Lỗi drop:`, e.message);
            process.exit(1);
        } finally {
            client.release();
        }
        await pool.end();
        return;
    }

    if (!DRY && !APPLY) {
        console.error("Dùng --dry (preview) / --apply (ghi DB) / --drop (xóa bảng cũ).");
        process.exit(1);
    }
    const mode = DRY ? "DRY" : "APPLY";

    // ── 1) Đọc toàn bộ dữ liệu cũ (chỉ SELECT) ──
    const [vocabRows, readingRows, meaningRows, exampleRows, charRows, deckRows, setRows] = await Promise.all([
        pool.query(
            `SELECT id, hanzi_simplified, hanzi_traditional, hanzi_simplified_hk, hanzi_traditional_hk,
                    hsk_level, han_characters, popularity, pure_cantonese, created_at, updated_at
             FROM vocabularies ORDER BY id`,
        ),
        pool.query(
            `SELECT id, vocabulary_id, system, romanization, sino_vietnamese, position
             FROM vocabulary_readings ORDER BY vocabulary_id, position`,
        ),
        pool.query(
            `SELECT id, romanization_id, position, category, zh, yue, vi, en
             FROM vocabulary_meanings ORDER BY romanization_id, position`,
        ),
        pool.query(
            `SELECT id, meaning_id, position, zh, yue, romanization, vi, en
             FROM vocabulary_examples ORDER BY meaning_id, position`,
        ),
        pool.query(
            `SELECT vocabulary_id, hanzi_character_id, position FROM vocabulary_characters ORDER BY vocabulary_id, position`,
        ),
        pool.query(`SELECT deck_id, vocabulary_id, position, created_at FROM flashcard_deck_vocabularies`),
        pool.query(`SELECT set_id, vocabulary_id, position, created_at FROM vocabulary_set_vocabularies`),
    ]);

    // ── 2) Xây bản đồ: vocab cũ → id mới (mandarin/cantonese) ──
    const withPinyin = new Set(readingRows.rows.filter((r) => r.system === "pinyin").map((r) => r.vocabulary_id));
    const mandarinVocabId = new Map(); // old vocab id → new mandarin vocab id
    const cantoneseVocabId = new Map(); // old vocab id → new cantonese vocab id

    const mandarinVocabularies = [];
    const cantoneseVocabularies = [];

    for (const v of vocabRows.rows) {
        const hc = v.han_characters ? JSON.stringify(v.han_characters) : null;
        const ts = [v.created_at, v.updated_at];
        if (withPinyin.has(v.id)) {
            const mid = randomUUID();
            mandarinVocabId.set(v.id, mid);
            mandarinVocabularies.push([
                mid,
                v.hanzi_simplified ?? "",
                v.hanzi_traditional ?? "",
                hc,
                v.hsk_level ?? "",
                v.popularity,
                ...ts,
            ]);
        }
        const cid = randomUUID();
        cantoneseVocabId.set(v.id, cid);
        cantoneseVocabularies.push([
            cid,
            v.hanzi_simplified_hk || v.hanzi_simplified || "",
            v.hanzi_traditional_hk ?? "",
            v.pure_cantonese ?? false,
            v.popularity,
            hc,
            ...ts,
        ]);
    }

    // ── 3) Tách readings → romanizations (pinyin / jyutping) ──
    const mandarinRomanId = new Map(); // old reading id → new mandarin romanization id
    const cantoneseRomanId = new Map();
    const mandarinRomanizations = [];
    const cantoneseRomanizations = [];

    for (const r of readingRows.rows) {
        if (r.system === "pinyin") {
            const rid = randomUUID();
            mandarinRomanId.set(r.id, rid);
            mandarinRomanizations.push([
                rid,
                mandarinVocabId.get(r.vocabulary_id),
                r.romanization,
                r.sino_vietnamese ?? "",
            ]);
        } else {
            const rid = randomUUID();
            cantoneseRomanId.set(r.id, rid);
            cantoneseRomanizations.push([
                rid,
                cantoneseVocabId.get(r.vocabulary_id),
                r.romanization,
                r.sino_vietnamese ?? "",
            ]);
        }
    }

    // ── 4) Tách meanings (mandarin giữ zh / cantonese giữ yue) ──
    const mandarinMeaningId = new Map(); // old meaning id → new mandarin meaning id
    const cantoneseMeaningId = new Map();
    const mandarinMeanings = [];
    const cantoneseMeanings = [];

    for (const m of meaningRows.rows) {
        if (mandarinRomanId.has(m.romanization_id)) {
            const mid = randomUUID();
            mandarinMeaningId.set(m.id, mid);
            mandarinMeanings.push([
                mid,
                mandarinRomanId.get(m.romanization_id),
                m.category ?? "",
                m.zh ?? "",
                m.vi ?? "",
                m.en ?? "",
            ]);
        } else {
            const mid = randomUUID();
            cantoneseMeaningId.set(m.id, mid);
            cantoneseMeanings.push([
                mid,
                cantoneseRomanId.get(m.romanization_id),
                m.category ?? "",
                m.yue ?? "",
                m.vi ?? "",
                m.en ?? "",
            ]);
        }
    }

    // ── 5) Tách examples ──
    const mandarinExamples = [];
    const cantoneseExamples = [];
    for (const ex of exampleRows.rows) {
        if (mandarinMeaningId.has(ex.meaning_id)) {
            mandarinExamples.push([
                randomUUID(),
                mandarinMeaningId.get(ex.meaning_id),
                ex.zh ?? "",
                ex.romanization ?? "",
                ex.vi ?? "",
                ex.en ?? "",
            ]);
        } else {
            cantoneseExamples.push([
                randomUUID(),
                cantoneseMeaningId.get(ex.meaning_id),
                ex.yue ?? "",
                ex.romanization ?? "",
                ex.vi ?? "",
                ex.en ?? "",
            ]);
        }
    }

    // ── 6) vocabulary_characters → cả 2 bên ──
    const mandarinCharacters = [];
    const cantoneseCharacters = [];
    for (const c of charRows.rows) {
        const mId = mandarinVocabId.get(c.vocabulary_id);
        if (mId) mandarinCharacters.push([randomUUID(), mId, c.hanzi_character_id, c.position]);
        cantoneseCharacters.push([
            randomUUID(),
            cantoneseVocabId.get(c.vocabulary_id),
            c.hanzi_character_id,
            c.position,
        ]);
    }

    // ── 7) deck / set links → cả 2 bên ──
    const mandarinDeckLinks = [];
    const cantoneseDeckLinks = [];
    for (const d of deckRows.rows) {
        const mId = mandarinVocabId.get(d.vocabulary_id);
        if (mId) mandarinDeckLinks.push([randomUUID(), d.deck_id, mId, d.position, d.created_at]);
        cantoneseDeckLinks.push([
            randomUUID(),
            d.deck_id,
            cantoneseVocabId.get(d.vocabulary_id),
            d.position,
            d.created_at,
        ]);
    }
    const mandarinSetLinks = [];
    const cantoneseSetLinks = [];
    for (const s of setRows.rows) {
        const mId = mandarinVocabId.get(s.vocabulary_id);
        if (mId) mandarinSetLinks.push([randomUUID(), s.set_id, mId, s.position, s.created_at]);
        cantoneseSetLinks.push([
            randomUUID(),
            s.set_id,
            cantoneseVocabId.get(s.vocabulary_id),
            s.position,
            s.created_at,
        ]);
    }

    console.log(`[${mode}] ── TỔNG KẾT TÁCH ──`);
    console.log(`[${mode}] vocab cũ: ${vocabRows.rows.length} (có pinyin: ${withPinyin.size})`);
    console.log(`[${mode}] mandarin_vocabularies:        ${mandarinVocabularies.length}`);
    console.log(`[${mode}] mandarin romanizations:       ${mandarinRomanizations.length}`);
    console.log(`[${mode}] mandarin meanings:            ${mandarinMeanings.length}`);
    console.log(`[${mode}] mandarin examples:            ${mandarinExamples.length}`);
    console.log(`[${mode}] mandarin characters:          ${mandarinCharacters.length}`);
    console.log(`[${mode}] mandarin deck links:          ${mandarinDeckLinks.length}`);
    console.log(`[${mode}] mandarin set links:           ${mandarinSetLinks.length}`);
    console.log(`[${mode}] cantonese_vocabularies:       ${cantoneseVocabularies.length}`);
    console.log(`[${mode}] cantonese romanizations:      ${cantoneseRomanizations.length}`);
    console.log(`[${mode}] cantonese meanings:           ${cantoneseMeanings.length}`);
    console.log(`[${mode}] cantonese examples:           ${cantoneseExamples.length}`);
    console.log(`[${mode}] cantonese characters:         ${cantoneseCharacters.length}`);
    console.log(`[${mode}] cantonese deck links:         ${cantoneseDeckLinks.length}`);
    console.log(`[${mode}] cantonese set links:          ${cantoneseSetLinks.length}`);

    if (DRY) {
        console.log(`[${mode}] preview xong — chạy --apply để ghi DB.`);
        await pool.end();
        return;
    }

    // ── 8) Backup cũ → CSV ──
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const dir = `/app/_backup_split_lang_${ts}`;
    fs.mkdirSync(dir, { recursive: true });
    const client = await pool.connect();
    try {
        for (const t of OLD_TABLES) {
            try {
                const f = await backupCsv(client, t, dir);
                console.log(`[backup] ${t} → ${f}`);
            } catch (e) {
                if (/does not exist/i.test(e.message)) {
                    console.log(`[backup] ${t} — skip (bảng không tồn tại)`);
                    continue;
                }
                console.error(`[backup] Lỗi backup ${t}:`, e.message);
                process.exit(1);
            }
        }
    } catch (e) {
        console.error("[backup] Lỗi backup:", e.message);
        process.exit(1);
    } finally {
        client.release();
    }

    // ── 9) Tạo bảng + insert (transaction) ──
    const c = await pool.connect();
    try {
        await c.query("BEGIN");
        await c.query(CREATE_SQL);

        const insert = async (sql, rows, label) => {
            for (let i = 0; i < rows.length; i += 500) {
                const batch = rows.slice(i, i + 500);
                for (const r of batch) await c.query(sql, r);
            }
            console.log(`[${mode}] insert ${label}: ${rows.length}`);
        };

        await insert(
            `INSERT INTO mandarin_vocabularies (id, hanzi_simplified, hanzi_traditional, hanzi_characters, hsk_level, popularity, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            mandarinVocabularies,
            "mandarin_vocabularies",
        );
        await insert(
            `INSERT INTO mandarin_vocabulary_romanizations (id, mandarin_vocabulary_id, pinyin, sino_vietnamese) VALUES ($1,$2,$3,$4)`,
            mandarinRomanizations,
            "mandarin_vocabulary_romanizations",
        );
        await insert(
            `INSERT INTO mandarin_vocabulary_meanings (id, mandarin_vocabulary_romanization_id, category, zh, vi, en) VALUES ($1,$2,$3,$4,$5,$6)`,
            mandarinMeanings,
            "mandarin_vocabulary_meanings",
        );
        await insert(
            `INSERT INTO mandarin_vocabulary_examples (id, mandarin_vocabulary_meaning_id, zh, romanization, vi, en) VALUES ($1,$2,$3,$4,$5,$6)`,
            mandarinExamples,
            "mandarin_vocabulary_examples",
        );
        await insert(
            `INSERT INTO mandarin_vocabulary_characters (id, mandarin_vocabulary_id, hanzi_character_id, position) VALUES ($1,$2,$3,$4)`,
            mandarinCharacters,
            "mandarin_vocabulary_characters",
        );
        await insert(
            `INSERT INTO flashcard_deck_mandarin_vocabularies (id, deck_id, mandarin_vocabulary_id, position, created_at) VALUES ($1,$2,$3,$4,$5)`,
            mandarinDeckLinks,
            "flashcard_deck_mandarin_vocabularies",
        );
        await insert(
            `INSERT INTO vocabulary_set_mandarin_vocabularies (id, set_id, mandarin_vocabulary_id, position, created_at) VALUES ($1,$2,$3,$4,$5)`,
            mandarinSetLinks,
            "vocabulary_set_mandarin_vocabularies",
        );

        await insert(
            `INSERT INTO cantonese_vocabularies (id, hanzi_simplified, hanzi_traditional_hk, pure_cantonese, popularity, hanzi_characters, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            cantoneseVocabularies,
            "cantonese_vocabularies",
        );
        await insert(
            `INSERT INTO cantonese_vocabulary_romanizations (id, cantonese_vocabulary_id, jyutping, sino_vietnamese) VALUES ($1,$2,$3,$4)`,
            cantoneseRomanizations,
            "cantonese_vocabulary_romanizations",
        );
        await insert(
            `INSERT INTO cantonese_vocabulary_meanings (id, cantonese_vocabulary_romanization_id, category, yue, vi, en) VALUES ($1,$2,$3,$4,$5,$6)`,
            cantoneseMeanings,
            "cantonese_vocabulary_meanings",
        );
        await insert(
            `INSERT INTO cantonese_vocabulary_examples (id, cantonese_vocabulary_meaning_id, yue, romanization, vi, en) VALUES ($1,$2,$3,$4,$5,$6)`,
            cantoneseExamples,
            "cantonese_vocabulary_examples",
        );
        await insert(
            `INSERT INTO cantonese_vocabulary_characters (id, cantonese_vocabulary_id, hanzi_character_id, position) VALUES ($1,$2,$3,$4)`,
            cantoneseCharacters,
            "cantonese_vocabulary_characters",
        );
        await insert(
            `INSERT INTO flashcard_deck_cantonese_vocabularies (id, deck_id, cantonese_vocabulary_id, position, created_at) VALUES ($1,$2,$3,$4,$5)`,
            cantoneseDeckLinks,
            "flashcard_deck_cantonese_vocabularies",
        );
        await insert(
            `INSERT INTO vocabulary_set_cantonese_vocabularies (id, set_id, cantonese_vocabulary_id, position, created_at) VALUES ($1,$2,$3,$4,$5)`,
            cantoneseSetLinks,
            "vocabulary_set_cantonese_vocabularies",
        );

        await c.query("COMMIT");
        console.log(`[${mode}] đã insert toàn bộ.`);
    } catch (e) {
        await c.query("ROLLBACK");
        console.error(`[${mode}] Lỗi insert:`, e.message);
        await c.end();
        process.exit(1);
    } finally {
        c.release();
    }

    // ── 10) Verify counts bảng mới ──
    const newTables = [
        "mandarin_vocabularies",
        "mandarin_vocabulary_romanizations",
        "mandarin_vocabulary_meanings",
        "mandarin_vocabulary_examples",
        "mandarin_vocabulary_characters",
        "flashcard_deck_mandarin_vocabularies",
        "vocabulary_set_mandarin_vocabularies",
        "cantonese_vocabularies",
        "cantonese_vocabulary_romanizations",
        "cantonese_vocabulary_meanings",
        "cantonese_vocabulary_examples",
        "cantonese_vocabulary_characters",
        "flashcard_deck_cantonese_vocabularies",
        "vocabulary_set_cantonese_vocabularies",
    ];
    for (const t of newTables) console.log(`[verify] ${t}: ${await count(pool, t)}`);

    console.log(`[${mode}] DONE. Bảng cũ vẫn còn — chạy '--drop' sau khi kiểm tra dữ liệu mới.`);
    await pool.end();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
