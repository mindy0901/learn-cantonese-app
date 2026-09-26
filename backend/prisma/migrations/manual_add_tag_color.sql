-- Tag: thêm cột màu do admin chọn (thay màu random) — 2026-09-27
-- Nullable + ADD COLUMN (thuần thêm, KHÔNG ảnh hưởng dữ liệu hiện có).
ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "color" VARCHAR(16);
