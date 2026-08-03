-- Add boost (ranking score) and search_pinyin (tone-less pinyin for search) columns
-- sourced from xue-hanzi-dictionary.json (Hiểu Chữ Hán).
ALTER TABLE "vocabularies" ADD COLUMN IF NOT EXISTS "boost" REAL;
ALTER TABLE "vocabularies" ADD COLUMN IF NOT EXISTS "search_pinyin" VARCHAR DEFAULT '';
