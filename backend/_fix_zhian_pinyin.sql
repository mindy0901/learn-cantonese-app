-- Fix 治安 pinyin error (2026-08-11)
BEGIN;

-- 1. Fix romanization_json reading 1: pinyin "ān" -> "zhì'ān"
UPDATE vocabularies
SET romanization_json = jsonb_set(romanization_json, '{0,pinyin}', '"zhì''ān"'::jsonb)
WHERE id = '6fffc0c7-497b-4137-96d0-60817ba8e0ed';

-- 2. Fix flat pinyin column
UPDATE vocabularies
SET pinyin = 'zhì''ān / zhì''ān'
WHERE id = '6fffc0c7-497b-4137-96d0-60817ba8e0ed';

-- 3. Fix han_characters breakdown: 治->zhì, 安->ān
UPDATE vocabularies
SET han_characters = jsonb_set(
    jsonb_set(han_characters, '{0,pinyin}', '"zhì"'::jsonb),
    '{1,pinyin}', '"ān"'::jsonb
)
WHERE id = '6fffc0c7-497b-4137-96d0-60817ba8e0ed';

-- 4. Clean polluted readings in han_characters table
UPDATE han_characters SET pinyin = ARRAY['zhì'] WHERE han_traditional = '治';
UPDATE han_characters SET pinyin = ARRAY['ān'] WHERE han_traditional = '安';

COMMIT;
