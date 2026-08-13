-- Bộ thủ (214 radicals) — nguồn: https://nhaihsk.com/radicals (2026-08-10)
-- Áp dụng thủ công qua psql (theo convention của project, tránh reset DB).
-- Tạo bảng radicals + liên kết han_characters.radical_id → radicals.id.

CREATE TABLE IF NOT EXISTS "radicals" (
    "id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "char" VARCHAR NOT NULL,
    "name" VARCHAR NOT NULL,
    "desc" TEXT,
    "pinyin" VARCHAR,
    "variants" VARCHAR[] NOT NULL,
    "stroke_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "radicals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "radicals_number_key" ON "radicals"("number");

ALTER TABLE "han_characters" ADD COLUMN IF NOT EXISTS "radical_id" UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'han_characters_radical_id_fkey'
    ) THEN
        ALTER TABLE "han_characters"
            ADD CONSTRAINT "han_characters_radical_id_fkey"
            FOREIGN KEY ("radical_id") REFERENCES "radicals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "han_characters_radical_id_idx" ON "han_characters"("radical_id");
