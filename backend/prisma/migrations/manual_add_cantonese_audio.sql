-- ⚠️ 2026-08-22 — thêm cột audio (R2 public URL) cho Cantonese vocab + example (import CC101).
-- Cần regenerate Prisma client sau khi chạy.
ALTER TABLE "cantonese_vocabularies" ADD COLUMN IF NOT EXISTS "hanzi_audio" VARCHAR;
ALTER TABLE "cantonese_vocabularies" ADD COLUMN IF NOT EXISTS "english_audio" VARCHAR;
ALTER TABLE "cantonese_vocabulary_examples" ADD COLUMN IF NOT EXISTS "hanzi_audio" VARCHAR;
ALTER TABLE "cantonese_vocabulary_examples" ADD COLUMN IF NOT EXISTS "english_audio" VARCHAR;
