-- ⚠️ 2026-08-22 — BỎ `yue` hoàn toàn khỏi Cantonese (chỉ còn vi/en — meaning & example)
--     + BỎ `hanzi_simplified` khỏi cantonese_vocabularies (chỉ còn hanziTraditionalHk).
--     Nguyên nhân: pipeline translate không hỗ trợ `yue` → gloss bị fill nhầm English.
--     User yêu cầu xóa khỏi database (đã backup CSV: backend/_backup_remove_yue_2026-08-22/).
-- ⚠️ Phải chạy kèm: regenerate Prisma client + sửa code (prismaServiceSplit/ocr/frontend).
ALTER TABLE "cantonese_vocabulary_meanings" DROP COLUMN IF EXISTS "yue";
ALTER TABLE "cantonese_vocabulary_examples" DROP COLUMN IF EXISTS "yue";
ALTER TABLE "cantonese_vocabularies" DROP COLUMN IF EXISTS "hanzi_simplified";
