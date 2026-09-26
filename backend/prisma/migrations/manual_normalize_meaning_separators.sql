-- manual_normalize_meaning_separators.sql (2026-09-01)
-- Chuẩn hoá meaning/example: thay `;`/`；`/`、` → `, ` (giữ nguyên case) trước khi backup cloud.
-- Quy tắc khớp `normalizeGlossSeparators` (frontend WordEditFields + backend full-sync).
-- Idempotent: WHERE chỉ bắt row còn chứa separator cũ.

BEGIN;

-- ── Mandarin meanings: vi / en / zh ──
UPDATE mandarin_vocabulary_meanings
SET vi = btrim(regexp_replace(regexp_replace(regexp_replace(vi, '[;；、]', ',', 'g'), '\s*,\s*', ', ', 'g'), '\s{2,}', ' ', 'g'))
WHERE vi ~ '[;；、]';

UPDATE mandarin_vocabulary_meanings
SET en = btrim(regexp_replace(regexp_replace(regexp_replace(en, '[;；、]', ',', 'g'), '\s*,\s*', ', ', 'g'), '\s{2,}', ' ', 'g'))
WHERE en ~ '[;；、]';

UPDATE mandarin_vocabulary_meanings
SET zh = btrim(regexp_replace(regexp_replace(regexp_replace(zh, '[;；、]', ',', 'g'), '\s*,\s*', ', ', 'g'), '\s{2,}', ' ', 'g'))
WHERE zh ~ '[;；、]';

-- ── Cantonese meanings: vi / en ──
UPDATE cantonese_vocabulary_meanings
SET vi = btrim(regexp_replace(regexp_replace(regexp_replace(vi, '[;；、]', ',', 'g'), '\s*,\s*', ', ', 'g'), '\s{2,}', ' ', 'g'))
WHERE vi ~ '[;；、]';

UPDATE cantonese_vocabulary_meanings
SET en = btrim(regexp_replace(regexp_replace(regexp_replace(en, '[;；、]', ',', 'g'), '\s*,\s*', ', ', 'g'), '\s{2,}', ' ', 'g'))
WHERE en ~ '[;；、]';

-- ── Examples: mandarin vi / en ──
UPDATE mandarin_vocabulary_examples
SET vi = btrim(regexp_replace(regexp_replace(regexp_replace(vi, '[;；、]', ',', 'g'), '\s*,\s*', ', ', 'g'), '\s{2,}', ' ', 'g'))
WHERE vi ~ '[;；、]';

UPDATE mandarin_vocabulary_examples
SET en = btrim(regexp_replace(regexp_replace(regexp_replace(en, '[;；、]', ',', 'g'), '\s*,\s*', ', ', 'g'), '\s{2,}', ' ', 'g'))
WHERE en ~ '[;；、]';

-- ── Examples: cantonese vi / en ──
UPDATE cantonese_vocabulary_examples
SET vi = btrim(regexp_replace(regexp_replace(regexp_replace(vi, '[;；、]', ',', 'g'), '\s*,\s*', ', ', 'g'), '\s{2,}', ' ', 'g'))
WHERE vi ~ '[;；、]';

UPDATE cantonese_vocabulary_examples
SET en = btrim(regexp_replace(regexp_replace(regexp_replace(en, '[;；、]', ',', 'g'), '\s*,\s*', ', ', 'g'), '\s{2,}', ' ', 'g'))
WHERE en ~ '[;；、]';

COMMIT;

-- ── Verify: còn lại bao nhiêu? ──
SELECT 'man_vi' src, count(*) FILTER (WHERE vi LIKE '%;%' OR vi LIKE '%；%' OR vi LIKE '%、%') FROM mandarin_vocabulary_meanings
UNION ALL SELECT 'man_en', count(*) FILTER (WHERE en LIKE '%;%' OR en LIKE '%；%' OR en LIKE '%、%') FROM mandarin_vocabulary_meanings
UNION ALL SELECT 'man_zh', count(*) FILTER (WHERE zh LIKE '%;%' OR zh LIKE '%；%' OR zh LIKE '%、%') FROM mandarin_vocabulary_meanings
UNION ALL SELECT 'can_vi', count(*) FILTER (WHERE vi LIKE '%;%' OR vi LIKE '%；%' OR vi LIKE '%、%') FROM cantonese_vocabulary_meanings
UNION ALL SELECT 'can_en', count(*) FILTER (WHERE en LIKE '%;%' OR en LIKE '%；%' OR en LIKE '%、%') FROM cantonese_vocabulary_meanings
UNION ALL SELECT 'man_ex_vi', count(*) FILTER (WHERE vi LIKE '%;%' OR vi LIKE '%；%' OR vi LIKE '%、%') FROM mandarin_vocabulary_examples
UNION ALL SELECT 'man_ex_en', count(*) FILTER (WHERE en LIKE '%;%' OR en LIKE '%；%' OR en LIKE '%、%') FROM mandarin_vocabulary_examples
UNION ALL SELECT 'can_ex_vi', count(*) FILTER (WHERE vi LIKE '%;%' OR vi LIKE '%；%' OR vi LIKE '%、%') FROM cantonese_vocabulary_examples
UNION ALL SELECT 'can_ex_en', count(*) FILTER (WHERE en LIKE '%;%' OR en LIKE '%；%' OR en LIKE '%、%') FROM cantonese_vocabulary_examples;
