-- Tags dùng chung (admin quản lý) — 2026-09-27
-- `tags`         : danh mục tag (name unique, admin tạo/đổi tên/xóa).
-- `vocabulary_tags`: gán tag cho từ vựng ĐÃ CÓ trong app (theo ngôn ngữ + vocabulary_id).
--   ⚠️ Giống pattern user_favorite_vocabularies: KHÔNG FK tới 2 bảng vocab riêng biệt
--   (mandarin/cantonese) — chỉ FK tới `tags` (onDelete CASCADE để xóa tag là gỡ hết liên kết).
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");

CREATE TABLE "vocabulary_tags" (
    "id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "language" VARCHAR(16) NOT NULL,
    "vocabulary_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vocabulary_tags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vocabulary_tags_tag_id_language_vocabulary_id_key" ON "vocabulary_tags"("tag_id", "language", "vocabulary_id");
CREATE INDEX "vocabulary_tags_tag_id_idx" ON "vocabulary_tags"("tag_id");
CREATE INDEX "idx_vt_vocabulary_id" ON "vocabulary_tags"("vocabulary_id");

ALTER TABLE "vocabulary_tags" ADD CONSTRAINT "vocabulary_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
