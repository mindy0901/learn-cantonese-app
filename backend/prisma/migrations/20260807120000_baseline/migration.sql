-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "han_characters" (
    "id" UUID NOT NULL,
    "sino_vietnamese" VARCHAR[],
    "han_simplified" VARCHAR DEFAULT '',
    "pinyin" VARCHAR[],
    "han_traditional" VARCHAR NOT NULL,
    "jyutping" VARCHAR[],
    "hsk_level" VARCHAR DEFAULT '',
    "search_key" TEXT,
    "frequency" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "han_characters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vocabularies" (
    "id" UUID NOT NULL,
    "sino_vietnamese" VARCHAR DEFAULT '',
    "han_simplified" VARCHAR DEFAULT '',
    "pinyin" VARCHAR DEFAULT '',
    "han_traditional" VARCHAR NOT NULL DEFAULT '',
    "jyutping" VARCHAR DEFAULT '',
    "hsk_level" VARCHAR DEFAULT '',
    "search_key" TEXT,
    "viet_meanings" VARCHAR DEFAULT '',
    "eng_meanings" VARCHAR DEFAULT '',
    "viet_examples" TEXT DEFAULT '',
    "pos" VARCHAR DEFAULT '',
    "frequency" INTEGER,
    "radical" VARCHAR DEFAULT '',
    "classifiers" VARCHAR DEFAULT '',
    "pinyin_numeric" VARCHAR DEFAULT '',
    "movie_word_rank" INTEGER,
    "book_word_rank" INTEGER,
    "related_words" JSONB,
    "han_characters" JSONB,
    "boost" REAL,
    "search_pinyin" VARCHAR DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vocabularies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vocabulary_meanings" (
    "id" UUID NOT NULL,
    "vocabulary_id" UUID NOT NULL,
    "category" VARCHAR DEFAULT '',
    "viet_meanings" VARCHAR DEFAULT '',
    "eng_meanings" VARCHAR DEFAULT '',
    "position" SMALLINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vocabulary_meanings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vocabulary_examples" (
    "id" UUID NOT NULL,
    "vocabulary_id" UUID NOT NULL,
    "meaning_id" UUID,
    "han_example" TEXT DEFAULT '',
    "jyutping_example" VARCHAR DEFAULT '',
    "pinyin_example" VARCHAR DEFAULT '',
    "viet_examples" VARCHAR DEFAULT '',
    "eng_examples" VARCHAR DEFAULT '',
    "position" SMALLINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vocabulary_examples_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vocabulary_characters" (
    "id" UUID NOT NULL,
    "vocabulary_id" UUID NOT NULL,
    "han_character_id" UUID NOT NULL,
    "position" SMALLINT NOT NULL,

    CONSTRAINT "vocabulary_characters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grammars" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" VARCHAR NOT NULL DEFAULT '',
    "content" TEXT NOT NULL DEFAULT '',
    "details" VARCHAR[] DEFAULT ARRAY[]::VARCHAR[],
    "notes" VARCHAR[] DEFAULT ARRAY[]::VARCHAR[],
    "structure" TEXT DEFAULT '',
    "hsk_level" VARCHAR DEFAULT '',
    "important" BOOLEAN NOT NULL DEFAULT false,
    "mastered" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grammars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grammar_examples" (
    "id" UUID NOT NULL,
    "grammar_id" UUID NOT NULL,
    "han_example" TEXT DEFAULT '',
    "jyutping_example" VARCHAR DEFAULT '',
    "pinyin_example" VARCHAR DEFAULT '',
    "viet_example" VARCHAR DEFAULT '',
    "eng_example" VARCHAR DEFAULT '',
    "position" SMALLINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grammar_examples_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password" VARCHAR,
    "name" TEXT,
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_vocabularies" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "vocabulary_id" UUID NOT NULL,
    "important" BOOLEAN NOT NULL DEFAULT false,
    "mastered" BOOLEAN NOT NULL DEFAULT false,
    "study_progress" SMALLINT NOT NULL DEFAULT 0,
    "study_progress_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_vocabularies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sentence_patterns" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "han_traditional" VARCHAR NOT NULL DEFAULT '',
    "han_simplified" VARCHAR,
    "jyutping" VARCHAR,
    "pinyin" VARCHAR,
    "vietnamese" VARCHAR NOT NULL DEFAULT '',
    "english" VARCHAR NOT NULL DEFAULT '',
    "word_ids" UUID[],
    "important" BOOLEAN NOT NULL DEFAULT false,
    "mastered" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sentence_patterns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flashcard_decks" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR NOT NULL DEFAULT '',
    "description" TEXT DEFAULT '',
    "color" VARCHAR DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flashcard_decks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flashcard_deck_vocabularies" (
    "id" UUID NOT NULL,
    "deck_id" UUID NOT NULL,
    "vocabulary_id" UUID NOT NULL,
    "position" SMALLINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flashcard_deck_vocabularies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "han_characters_jyutping_pinyin_idx" ON "han_characters"("jyutping", "pinyin");

-- CreateIndex
CREATE UNIQUE INDEX "han_characters_id_han_simplified_han_traditional_key" ON "han_characters"("id", "han_simplified", "han_traditional");

-- CreateIndex
CREATE INDEX "vocabularies_search_key_hsk_level_idx" ON "vocabularies"("search_key", "hsk_level");

-- CreateIndex
CREATE INDEX "vocabulary_characters_han_character_id_idx" ON "vocabulary_characters"("han_character_id");

-- CreateIndex
CREATE UNIQUE INDEX "vocabulary_characters_vocabulary_id_han_character_id_key" ON "vocabulary_characters"("vocabulary_id", "han_character_id");

-- CreateIndex
CREATE UNIQUE INDEX "vocabulary_characters_vocabulary_id_position_key" ON "vocabulary_characters"("vocabulary_id", "position");

-- CreateIndex
CREATE INDEX "grammars_user_id_idx" ON "grammars"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "grammars_id_user_id_key" ON "grammars"("id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "user_vocabularies_user_id_idx" ON "user_vocabularies"("user_id");

-- CreateIndex
CREATE INDEX "user_vocabularies_vocabulary_id_idx" ON "user_vocabularies"("vocabulary_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_vocabularies_user_id_vocabulary_id_key" ON "user_vocabularies"("user_id", "vocabulary_id");

-- CreateIndex
CREATE INDEX "sentence_patterns_user_id_idx" ON "sentence_patterns"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sentence_patterns_id_user_id_key" ON "sentence_patterns"("id", "user_id");

-- CreateIndex
CREATE INDEX "flashcard_decks_user_id_idx" ON "flashcard_decks"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "flashcard_decks_id_user_id_key" ON "flashcard_decks"("id", "user_id");

-- CreateIndex
CREATE INDEX "flashcard_deck_vocabularies_vocabulary_id_idx" ON "flashcard_deck_vocabularies"("vocabulary_id");

-- CreateIndex
CREATE UNIQUE INDEX "flashcard_deck_vocabularies_deck_id_vocabulary_id_key" ON "flashcard_deck_vocabularies"("deck_id", "vocabulary_id");

-- AddForeignKey
ALTER TABLE "vocabulary_meanings" ADD CONSTRAINT "vocabulary_meanings_vocabulary_id_fkey" FOREIGN KEY ("vocabulary_id") REFERENCES "vocabularies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocabulary_examples" ADD CONSTRAINT "vocabulary_examples_vocabulary_id_fkey" FOREIGN KEY ("vocabulary_id") REFERENCES "vocabularies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocabulary_examples" ADD CONSTRAINT "vocabulary_examples_meaning_id_fkey" FOREIGN KEY ("meaning_id") REFERENCES "vocabulary_meanings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocabulary_characters" ADD CONSTRAINT "vocabulary_characters_vocabulary_id_fkey" FOREIGN KEY ("vocabulary_id") REFERENCES "vocabularies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocabulary_characters" ADD CONSTRAINT "vocabulary_characters_han_character_id_fkey" FOREIGN KEY ("han_character_id") REFERENCES "han_characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grammar_examples" ADD CONSTRAINT "grammar_examples_grammar_id_fkey" FOREIGN KEY ("grammar_id") REFERENCES "grammars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_vocabularies" ADD CONSTRAINT "user_vocabularies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_vocabularies" ADD CONSTRAINT "user_vocabularies_vocabulary_id_fkey" FOREIGN KEY ("vocabulary_id") REFERENCES "vocabularies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flashcard_decks" ADD CONSTRAINT "flashcard_decks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flashcard_deck_vocabularies" ADD CONSTRAINT "flashcard_deck_vocabularies_deck_id_fkey" FOREIGN KEY ("deck_id") REFERENCES "flashcard_decks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flashcard_deck_vocabularies" ADD CONSTRAINT "flashcard_deck_vocabularies_vocabulary_id_fkey" FOREIGN KEY ("vocabulary_id") REFERENCES "vocabularies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
