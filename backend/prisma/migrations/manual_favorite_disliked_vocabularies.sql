-- Favorite / Disliked vocabularies (2026-09-20) — cặp đánh dấu theo user (thay "important"):
--   ❤️ user_favorite_vocabularies  = "yêu thích" (giữ nguyên dữ liệu của bảng important cũ)
--   🚫 user_disliked_vocabularies  = "không muốn học" → KHÔNG vào flashcard random
-- 2 trạng thái LOẠI TRỪ NHAU (bật cái này tự bỏ cái kia). Vocabulary id unique toàn cục (uuid).
-- ⚠️ KHÔNG tạo FK tới users (bảng users không có PK/unique trên id — pattern giống user_checkins).

-- 1) Rename bảng "quan trọng" cũ sang "yêu thích" (giữ dữ liệu + chỉnh tên constraint/index).
ALTER TABLE "user_important_vocabularies" RENAME TO "user_favorite_vocabularies";
ALTER TABLE "user_favorite_vocabularies" RENAME CONSTRAINT "user_important_vocabularies_pkey" TO "user_favorite_vocabularies_pkey";
ALTER INDEX "user_important_vocabularies_user_id_language_vocabulary_id_key" RENAME TO "user_favorite_vocabularies_user_id_language_vocabulary_id_key";
ALTER INDEX "user_important_vocabularies_user_id_idx" RENAME TO "user_favorite_vocabularies_user_id_idx";

-- 2) Bảng "không muốn học" (mới).
CREATE TABLE "user_disliked_vocabularies" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "language" VARCHAR(16) NOT NULL,
    "vocabulary_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_disliked_vocabularies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_disliked_vocabularies_user_id_language_vocabulary_id_key" ON "user_disliked_vocabularies"("user_id", "language", "vocabulary_id");
CREATE INDEX "user_disliked_vocabularies_user_id_idx" ON "user_disliked_vocabularies"("user_id");
-- FK index cho cột vocabulary_id (dùng khi xóa/lọc theo từ) — pattern giống index cloud 2026-09-19.
CREATE INDEX "idx_udv_vocabulary_id" ON "user_disliked_vocabularies"("vocabulary_id");

-- 3) Index vocabulary_id cho bảng favorite (bảng cũ chưa có) — cùng lý do.
CREATE INDEX IF NOT EXISTS "idx_ufv_vocabulary_id" ON "user_favorite_vocabularies"("vocabulary_id");
