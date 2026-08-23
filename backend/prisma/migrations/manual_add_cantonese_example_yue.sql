-- ⚠️ 2026-08-22 — thêm lại cột yue (chữ Hán câu ví dụ) cho Cantonese example (import CC101).
-- Lúc bỏ yue toàn bộ Cantonese đã drop luôn cột này → ví dụ mất chữ Hán của câu.
-- Cần regenerate Prisma client sau khi chạy.
ALTER TABLE "cantonese_vocabulary_examples" ADD COLUMN IF NOT EXISTS "yue" VARCHAR NOT NULL DEFAULT '';
