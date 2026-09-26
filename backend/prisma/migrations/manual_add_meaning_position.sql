-- 2026-09-20 — Thêm cột `position` cho 2 bảng meanings (lưu THỨ TỰ hiển thị meaning trong 1 reading).
-- Lý do: UI edit từ vựng cho phép user đổi thứ tự meaning; trước đây không có cột nào lưu thứ tự
-- ⇒ đọc lên Postgres trả thứ tự tuỳ ý (thiếu ORDER BY).
-- Áp dụng (Supabase — cloud): npx supabase db query --linked -f backend/prisma/migrations/manual_add_meaning_position.sql
-- Sau đó: docker compose -f docker-compose.dev.yml exec -T backend npx prisma generate
--          docker compose -f docker-compose.dev.yml restart backend

ALTER TABLE mandarin_vocabulary_meanings ADD COLUMN IF NOT EXISTS position smallint NOT NULL DEFAULT 0;
ALTER TABLE cantonese_vocabulary_meanings ADD COLUMN IF NOT EXISTS position smallint NOT NULL DEFAULT 0;

-- Backfill theo THỨ TỰ VẬT LÝ hiện tại (ctid) của từng reading — giữ nguyên thứ tự đang hiển thị.
UPDATE mandarin_vocabulary_meanings m
SET position = s.rn
FROM (
    SELECT id,
           (row_number() OVER (PARTITION BY mandarin_vocabulary_romanization_id ORDER BY ctid) - 1)::smallint AS rn
    FROM mandarin_vocabulary_meanings
) s
WHERE m.id = s.id
  AND m.position <> s.rn;

UPDATE cantonese_vocabulary_meanings m
SET position = s.rn
FROM (
    SELECT id,
           (row_number() OVER (PARTITION BY cantonese_vocabulary_romanization_id ORDER BY ctid) - 1)::smallint AS rn
    FROM cantonese_vocabulary_meanings
) s
WHERE m.id = s.id
  AND m.position <> s.rn;
