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
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vocabularies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VocabularyMeaning" (
    "id" UUID NOT NULL,
    "vocabulary_id" UUID NOT NULL,
    "viet_meanings" VARCHAR DEFAULT '',
    "eng_meanings" VARCHAR DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VocabularyMeaning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VocabularyExample" (
    "id" UUID NOT NULL,
    "vocabulary_id" UUID NOT NULL,
    "viet_examples" VARCHAR DEFAULT '',
    "eng_examples" VARCHAR DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VocabularyExample_pkey" PRIMARY KEY ("id")
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
    "hsk_level" VARCHAR DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grammars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
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

-- CreateIndex
CREATE INDEX "han_characters_jyutping_pinyin_idx" ON "han_characters"("jyutping", "pinyin");

-- CreateIndex
CREATE UNIQUE INDEX "han_characters_id_han_simplified_han_traditional_key" ON "han_characters"("id", "han_simplified", "han_traditional");

-- CreateIndex
CREATE INDEX "vocabularies_search_key_hsk_level_idx" ON "vocabularies"("search_key", "hsk_level");

-- CreateIndex
CREATE UNIQUE INDEX "vocabularies_han_simplified_han_traditional_key" ON "vocabularies"("han_simplified", "han_traditional");

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

-- AddForeignKey
ALTER TABLE "VocabularyMeaning" ADD CONSTRAINT "VocabularyMeaning_vocabulary_id_fkey" FOREIGN KEY ("vocabulary_id") REFERENCES "vocabularies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabularyExample" ADD CONSTRAINT "VocabularyExample_vocabulary_id_fkey" FOREIGN KEY ("vocabulary_id") REFERENCES "vocabularies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocabulary_characters" ADD CONSTRAINT "vocabulary_characters_vocabulary_id_fkey" FOREIGN KEY ("vocabulary_id") REFERENCES "vocabularies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocabulary_characters" ADD CONSTRAINT "vocabulary_characters_han_character_id_fkey" FOREIGN KEY ("han_character_id") REFERENCES "han_characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_vocabularies" ADD CONSTRAINT "user_vocabularies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_vocabularies" ADD CONSTRAINT "user_vocabularies_vocabulary_id_fkey" FOREIGN KEY ("vocabulary_id") REFERENCES "vocabularies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
