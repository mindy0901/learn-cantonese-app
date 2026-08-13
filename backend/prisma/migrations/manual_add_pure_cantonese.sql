-- Add pure_cantonese flag to vocabularies (marker for pure Cantonese words)
ALTER TABLE "vocabularies" ADD COLUMN IF NOT EXISTS "pure_cantonese" BOOLEAN DEFAULT false;
