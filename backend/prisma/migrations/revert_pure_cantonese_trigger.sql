-- Revert the Pure Cantonese enforce trigger (user decided not to force NULL).
DROP TRIGGER IF EXISTS trg_enforce_pure_cantonese ON vocabularies;
DROP FUNCTION IF EXISTS enforce_pure_cantonese();

-- Restore the 12 han_simplified values that the earlier backfill had nulled.
UPDATE vocabularies SET han_simplified = '說明' WHERE han_traditional = '説明' AND pure_cantonese = true AND han_simplified IS NULL;
UPDATE vocabularies SET han_simplified = '說話' WHERE han_traditional = '説話' AND pure_cantonese = true AND han_simplified IS NULL;
UPDATE vocabularies SET han_simplified = '檯' WHERE han_traditional = '枱' AND pure_cantonese = true AND han_simplified IS NULL;
UPDATE vocabularies SET han_simplified = '話晒' WHERE han_traditional = '話曬' AND pure_cantonese = true AND han_simplified IS NULL;
UPDATE vocabularies SET han_simplified = '伙記' WHERE han_traditional = '夥記' AND pure_cantonese = true AND han_simplified IS NULL;
UPDATE vocabularies SET han_simplified = '搵' WHERE han_traditional = '揾' AND pure_cantonese = true AND han_simplified IS NULL;
UPDATE vocabularies SET han_simplified = '搵食' WHERE han_traditional = '揾食' AND pure_cantonese = true AND han_simplified IS NULL;
UPDATE vocabularies SET han_simplified = '說' WHERE han_traditional = '説' AND pure_cantonese = true AND han_simplified IS NULL;
UPDATE vocabularies SET han_simplified = '爲' WHERE han_traditional = '為' AND pure_cantonese = true AND han_simplified IS NULL;
UPDATE vocabularies SET han_simplified = '小說' WHERE han_traditional = '小説' AND pure_cantonese = true AND han_simplified IS NULL;
UPDATE vocabularies SET han_simplified = '說服' WHERE han_traditional = '説服' AND pure_cantonese = true AND han_simplified IS NULL;
UPDATE vocabularies SET han_simplified = '傳說' WHERE han_traditional = '傳説' AND pure_cantonese = true AND han_simplified IS NULL;
