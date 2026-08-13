/*
  Warnings:

  - You are about to drop the `VocabularyExample` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `VocabularyMeaning` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "VocabularyExample" DROP CONSTRAINT "VocabularyExample_vocabulary_id_fkey";

-- DropForeignKey
ALTER TABLE "VocabularyMeaning" DROP CONSTRAINT "VocabularyMeaning_vocabulary_id_fkey";

-- AlterTable
ALTER TABLE "vocabularies" ADD COLUMN     "eng_meanings" VARCHAR DEFAULT '',
ADD COLUMN     "viet_examples" TEXT DEFAULT '',
ADD COLUMN     "viet_meanings" VARCHAR DEFAULT '';

-- DropTable
DROP TABLE "VocabularyExample";

-- DropTable
DROP TABLE "VocabularyMeaning";

-- CreateTable
CREATE TABLE "vocabulary_meanings" (
    "id" UUID NOT NULL,
    "vocabulary_id" UUID NOT NULL,
    "viet_meanings" VARCHAR DEFAULT '',
    "eng_meanings" VARCHAR DEFAULT '',
    "han_definition" TEXT DEFAULT '',
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
    "pinyin_example" VARCHAR DEFAULT '',
    "viet_examples" VARCHAR DEFAULT '',
    "eng_examples" VARCHAR DEFAULT '',
    "position" SMALLINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vocabulary_examples_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "vocabulary_meanings" ADD CONSTRAINT "vocabulary_meanings_vocabulary_id_fkey" FOREIGN KEY ("vocabulary_id") REFERENCES "vocabularies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocabulary_examples" ADD CONSTRAINT "vocabulary_examples_vocabulary_id_fkey" FOREIGN KEY ("vocabulary_id") REFERENCES "vocabularies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocabulary_examples" ADD CONSTRAINT "vocabulary_examples_meaning_id_fkey" FOREIGN KEY ("meaning_id") REFERENCES "vocabulary_meanings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
