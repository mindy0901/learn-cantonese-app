-- Add JSONB column for per-character breakdown of a vocabulary.
ALTER TABLE "vocabularies" ADD COLUMN IF NOT EXISTS "han_characters" JSONB;
