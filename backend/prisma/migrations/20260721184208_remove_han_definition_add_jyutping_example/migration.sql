/*
  Warnings:

  - You are about to drop the column `han_definition` on the `vocabulary_meanings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "vocabulary_examples" ADD COLUMN     "jyutping_example" VARCHAR DEFAULT '';

-- AlterTable
ALTER TABLE "vocabulary_meanings" DROP COLUMN "han_definition";
