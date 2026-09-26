-- ═══════════════════════════════════════════════════════════════════════
-- manual_add_popularity_level.sql  (2026-09-05)
-- ═══════════════════════════════════════════════════════════════════════
-- Mục đích: chuyển cơ chế "độ phổ biến" từ SỐ (popularity Float, percentile
-- tạm thời ở frontend) sang LƯU THẲNG 5 MỨC (popularity_level smallint 1–5):
--   1 = Hiếm (hiếm nhất) → 5 = Rất cao (phổ biến nhất), theo quintile
--   20/40/60/80 của cột `popularity` HIỆN TẠI trong TỪNG bank (mandarin/cantonese).
--
-- KHÔNG drop cột `popularity` (giữ nguồn raw cho sync/backup); chỉ thêm cột mới.
-- Áp dụng:  docker compose -f docker-compose.dev.yml exec -T db psql -U cantonese -d cantonese < manual_add_popularity_level.sql
-- Sau đó (trong container backend): cd /app && npx prisma generate
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Thêm cột level (nullable) — 2 bank
ALTER TABLE mandarin_vocabularies ADD COLUMN IF NOT EXISTS popularity_level smallint;
ALTER TABLE cantonese_vocabularies ADD COLUMN IF NOT EXISTS popularity_level smallint;

-- 2. Backfill Mandarin: quintile (ntile 5) theo `popularity` tăng dần.
--    popularity NULL → level NULL (giữ "Đang cập nhật").
WITH ranked AS (
    SELECT id,
           ntile(5) OVER (ORDER BY popularity) AS lvl
    FROM mandarin_vocabularies
    WHERE popularity IS NOT NULL
)
UPDATE mandarin_vocabularies m
SET popularity_level = ranked.lvl
FROM ranked
WHERE m.id = ranked.id;

-- 3. Backfill Cantonese: tương tự
WITH ranked AS (
    SELECT id,
           ntile(5) OVER (ORDER BY popularity) AS lvl
    FROM cantonese_vocabularies
    WHERE popularity IS NOT NULL
)
UPDATE cantonese_vocabularies c
SET popularity_level = ranked.lvl
FROM ranked
WHERE c.id = ranked.id;

-- 4. Verify phân bố
\echo '== Mandarin popularity_level =='
SELECT popularity_level AS level, count(*) FROM mandarin_vocabularies GROUP BY popularity_level ORDER BY popularity_level;
\echo '== Cantonese popularity_level =='
SELECT popularity_level AS level, count(*) FROM cantonese_vocabularies GROUP BY popularity_level ORDER BY popularity_level;
