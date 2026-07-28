/*
  Warnings:

  - You are about to drop the column `group_title` on the `vocabulary_meanings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "vocabulary_meanings" DROP COLUMN "group_title",
ADD COLUMN     "category" VARCHAR DEFAULT '';
