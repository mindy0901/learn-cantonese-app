-- 2026-08-30: bỏ hẳn group/category meaning (user chốt) — nghĩa phẳng.
-- Xóa cột category khỏi 2 bảng meaning (dữ liệu từ loại cũ sẽ mất).
ALTER TABLE "mandarin_vocabulary_meanings" DROP COLUMN IF EXISTS "category";
ALTER TABLE "cantonese_vocabulary_meanings" DROP COLUMN IF EXISTS "category";
