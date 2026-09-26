-- ⚠️ 2026-09-02: tiến độ "mastered" theo từ (progress 0-100%) cho mọi user.
-- Khó +5 / Trung bình +10 / Dễ +25; Lại nữa → reset 0; Đã nắm → 100 (mastered).
-- Pattern giống user_important_vocabularies (FK tới users, unique user+lang+vocab).

CREATE TABLE IF NOT EXISTS user_vocabulary_mastery (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID        NOT NULL,
    language       VARCHAR(16) NOT NULL DEFAULT 'cantonese',
    vocabulary_id  UUID        NOT NULL,
    progress       INTEGER     NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_vocabulary_mastery_user_lang_vocab_key
    ON user_vocabulary_mastery (user_id, language, vocabulary_id);

CREATE INDEX IF NOT EXISTS user_vocabulary_mastery_user_id_idx
    ON user_vocabulary_mastery (user_id);
