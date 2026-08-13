-- Custom vocabulary sets (user-created groups of vocabularies)
CREATE TABLE "vocabulary_sets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR DEFAULT '',
    "description" TEXT DEFAULT '',
    "color" VARCHAR DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vocabulary_sets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "vocabulary_set_vocabularies" (
    "id" UUID NOT NULL,
    "set_id" UUID NOT NULL,
    "vocabulary_id" UUID NOT NULL,
    "position" SMALLINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vocabulary_set_vocabularies_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "vocabulary_sets" ADD CONSTRAINT "vocabulary_sets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vocabulary_set_vocabularies" ADD CONSTRAINT "vocabulary_set_vocabularies_set_id_fkey" FOREIGN KEY ("set_id") REFERENCES "vocabulary_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vocabulary_set_vocabularies" ADD CONSTRAINT "vocabulary_set_vocabularies_vocabulary_id_fkey" FOREIGN KEY ("vocabulary_id") REFERENCES "vocabularies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "vocabulary_sets_id_user_id_key" ON "vocabulary_sets"("id", "user_id");
CREATE INDEX "vocabulary_sets_user_id_idx" ON "vocabulary_sets"("user_id");
CREATE UNIQUE INDEX "vocabulary_set_vocabularies_set_id_vocabulary_id_key" ON "vocabulary_set_vocabularies"("set_id", "vocabulary_id");
CREATE INDEX "vocabulary_set_vocabularies_vocabulary_id_idx" ON "vocabulary_set_vocabularies"("vocabulary_id");
