-- 2026-08-22: thêm cột related_words (JSONB) cho mandarin_vocabularies + cantonese_vocabularies
-- Lưu từ ghép / đồng nghĩa / trái nghĩa từ Hanzii (map theo pinyin):
--   { "<pinyin>": { compound: string[], synonyms: string[], antonyms: string[] } }
-- (Tạo thủ công thay vì prisma migrate — schema này drift so với migration history,
--  prisma migrate dev sẽ reset DB mất data.)
ALTER TABLE mandarin_vocabularies ADD COLUMN IF NOT EXISTS related_words JSONB;
ALTER TABLE cantonese_vocabularies ADD COLUMN IF NOT EXISTS related_words JSONB;
