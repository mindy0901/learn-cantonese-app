-- User important vocabularies (2026-09-02) — bảng đánh dấu "quan trọng" cho mọi user đã đăng nhập.
-- Mỗi dòng = 1 user đánh dấu 1 từ (theo ngôn ngữ) là quan trọng. Vocabulary id unique toàn cục (uuid).
-- ⚠️ KHÔNG tạo FK tới users (bảng users không có PK/unique trên id — pattern giống user_checkins).
CREATE TABLE "user_important_vocabularies" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "language" VARCHAR(16) NOT NULL,
    "vocabulary_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_important_vocabularies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_important_vocabularies_user_id_language_vocabulary_id_key" ON "user_important_vocabularies"("user_id", "language", "vocabulary_id");
CREATE INDEX "user_important_vocabularies_user_id_idx" ON "user_important_vocabularies"("user_id");
