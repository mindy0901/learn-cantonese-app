-- Merge duplicate readings for 治安, keep TRỊ AN (first), remove TRÌ AN (second)
BEGIN;

-- Keep only the first romanization (TRỊ AN), drop the second (TRÌ AN)
UPDATE vocabularies
SET romanization_json = romanization_json->0
WHERE id = '6fffc0c7-497b-4137-96d0-60817ba8e0ed';

-- Flat pinyin: keep single reading
UPDATE vocabularies
SET pinyin = 'zhì''ān'
WHERE id = '6fffc0c7-497b-4137-96d0-60817ba8e0ed';

COMMIT;
