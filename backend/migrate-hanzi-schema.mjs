/**
 * migrate-hanzi-schema.mjs (2026-08-16)
 * Áp dụng schema Prisma MỚI (user tự sửa schema.prisma):
 *   vocabularies:
 *     han_simplified   → hanzi_simplified
 *     han_traditional  → hanzi_traditional
 *     han_hongkong     → hanzi_traditional_hk   (dữ liệu giữ nguyên)
 *     + thêm hanzi_simplified_hk varchar ''      (để trống, chưa dùng)
 *     boost            → popularity
 *     frequency        Int → Float (double precision)
 *     DROP movie_word_rank, book_word_rank
 *   vocabulary_meanings:
 *     reading_id       → romanization_id
 *   vocabulary_characters:
 *     han_character_id → hanzi_character_id
 *
 * Chạy: docker compose -f docker-compose.dev.yml exec -T backend \
 *         node /app/migrate-hanzi-schema.mjs --dry|--apply
 */
import pg from "pg";

const DRY = process.argv.includes("--dry");
const APPLY = process.argv.includes("--apply");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const STEPS = [
    ["vocabularies", 'ALTER TABLE vocabularies RENAME COLUMN "han_simplified" TO "hanzi_simplified"'],
    ["vocabularies", 'ALTER TABLE vocabularies RENAME COLUMN "han_traditional" TO "hanzi_traditional"'],
    ["vocabularies", 'ALTER TABLE vocabularies RENAME COLUMN "han_hongkong" TO "hanzi_traditional_hk"'],
    [
        "vocabularies",
        "ALTER TABLE vocabularies ADD COLUMN IF NOT EXISTS \"hanzi_simplified_hk\" VARCHAR NOT NULL DEFAULT ''",
    ],
    ["vocabularies", 'ALTER TABLE vocabularies RENAME COLUMN "boost" TO "popularity"'],
    [
        "vocabularies",
        'ALTER TABLE vocabularies ALTER COLUMN "frequency" TYPE double precision USING frequency::double precision',
    ],
    ["vocabularies", 'ALTER TABLE vocabularies DROP COLUMN IF EXISTS "movie_word_rank"'],
    ["vocabularies", 'ALTER TABLE vocabularies DROP COLUMN IF EXISTS "book_word_rank"'],
    ["vocabulary_meanings", 'ALTER TABLE vocabulary_meanings RENAME COLUMN "reading_id" TO "romanization_id"'],
    [
        "vocabulary_characters",
        'ALTER TABLE vocabulary_characters RENAME COLUMN "han_character_id" TO "hanzi_character_id"',
    ],
];

async function main() {
    if (!DRY && !APPLY) {
        console.error("Dùng --dry (preview) hoặc --apply.");
        process.exit(1);
    }
    const mode = DRY ? "DRY" : "APPLY";
    for (const [table, sql] of STEPS) {
        // Kiểm tra cột cần có tồn tại trước khi rename (trừ ADD/DROP IF NOT EXISTS)
        const isRename = /RENAME COLUMN/.test(sql);
        const fromCol = sql.match(/"([a-z_]+)"/)?.[1];
        let ok = true;
        if (isRename && fromCol) {
            const r = await pool.query(
                `SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name=$2`,
                [table, fromCol],
            );
            ok = r.rows.length > 0;
        }
        console.log(`[${mode}] ${ok ? "OK " : "SKIP"} ${table}: ${sql}`);
        if (APPLY && ok) await pool.query(sql);
    }
    if (DRY) console.log(`[${mode}] preview xong — chạy --apply.`);
    else {
        // Verify
        for (const t of ["vocabularies", "vocabulary_meanings", "vocabulary_characters"]) {
            const r = await pool.query(
                `SELECT column_name FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position`,
                [t],
            );
            console.log(`[${mode}] ${t}: ${r.rows.map((x) => x.column_name).join(", ")}`);
        }
    }
    await pool.end();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
