-- ═══════════════════════════════════════════════════════════════════════
-- supabase-update-2026-09-19.sql — Đồng bộ schema Supabase = local (phần CÒN THIẾU)
-- ═══════════════════════════════════════════════════════════════════════
-- Đã verify (read-only, verify-supabase.mjs --check): Supabase CHỈ thiếu 4 mục dưới đây;
-- 17 bảng còn lại đã đủ cột. Không drop gì, chỉ ADD COLUMN / CREATE TABLE IF NOT EXISTS.
--
-- Cách chạy: Supabase Dashboard → SQL Editor → New query → dán toàn bộ file → Run.
-- (Hoặc: npx supabase db query --linked --file backend/supabase-update-2026-09-19.sql)
-- ═══════════════════════════════════════════════════════════════════════

-- 1) popularity_level (2026-09-05) — 2 bank từ vựng
alter table public.mandarin_vocabularies add column if not exists popularity_level smallint;
alter table public.cantonese_vocabularies add column if not exists popularity_level smallint;

-- 2) user_important_vocabularies (2026-09-02) — đánh dấu "quan trọng" (star) theo user
--    ⚠️ KHÔNG FK tới users (giống local / user_checkins)
create table if not exists public.user_important_vocabularies (
  id uuid primary key,
  user_id uuid not null,
  language varchar(16) not null,
  vocabulary_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, language, vocabulary_id)
);
create index if not exists user_important_vocabularies_user_id_idx
  on public.user_important_vocabularies (user_id);

-- 3) user_vocabulary_mastery (2026-09-02) — tiến độ mastered 0-100% theo user
create table if not exists public.user_vocabulary_mastery (
  id uuid primary key,
  user_id uuid not null,
  language varchar(16) not null default 'cantonese',
  vocabulary_id uuid not null,
  progress integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, language, vocabulary_id)
);
create index if not exists user_vocabulary_mastery_user_id_idx
  on public.user_vocabulary_mastery (user_id);

-- 4) RLS (an toàn: service role vẫn ghi được, anon/authenticated bị chặn)
alter table public.user_important_vocabularies enable row level security;
alter table public.user_vocabulary_mastery enable row level security;

-- 5) INDEX còn thiếu (local có 23 index phụ, cloud gần như không có).
--    ⚠️ BẮT BUỘC về cả HIỆU NĂNG & để backup chạy được: không có index trên
--    cột FK → xóa bảng cha (meanings) phải seq-scan bảng con (examples, 55k dòng)
--    cho MỖI dòng xóa → "canceling statement due to statement timeout".
create index if not exists idx_mv_simp on public.mandarin_vocabularies (hanzi_simplified);
create index if not exists idx_mv_trad on public.mandarin_vocabularies (hanzi_traditional);
create index if not exists idx_mv_hsk on public.mandarin_vocabularies (hsk_level);
create index if not exists idx_mvr_vocab on public.mandarin_vocabulary_romanizations (mandarin_vocabulary_id);
create index if not exists idx_mvm_roman on public.mandarin_vocabulary_meanings (mandarin_vocabulary_romanization_id);
create index if not exists idx_mve_meaning on public.mandarin_vocabulary_examples (mandarin_vocabulary_meaning_id);
create index if not exists idx_cv_hk on public.cantonese_vocabularies (hanzi_traditional_hk);
create index if not exists idx_cv_pure on public.cantonese_vocabularies (pure_cantonese);
create index if not exists idx_cvr_vocab on public.cantonese_vocabulary_romanizations (cantonese_vocabulary_id);
create index if not exists idx_cvm_roman on public.cantonese_vocabulary_meanings (cantonese_vocabulary_romanization_id);
create index if not exists idx_cve_meaning on public.cantonese_vocabulary_examples (cantonese_vocabulary_meaning_id);
create index if not exists idx_fdmv_vocab on public.flashcard_deck_mandarin_vocabularies (mandarin_vocabulary_id);
create index if not exists idx_fdcv_vocab on public.flashcard_deck_cantonese_vocabularies (cantonese_vocabulary_id);
create index if not exists idx_vsmv_vocab on public.vocabulary_set_mandarin_vocabularies (mandarin_vocabulary_id);
create index if not exists idx_vscv_vocab on public.vocabulary_set_cantonese_vocabularies (cantonese_vocabulary_id);
create index if not exists user_checkins_user_id_idx on public.user_checkins (user_id);

-- 6) PostgREST nạp lại schema cache để REST API thấy cột/bảng mới
notify pgrst, 'reload schema';

-- 7) Kiểm tra nhanh
select
  (select count(*) from information_schema.columns
     where table_name = 'mandarin_vocabularies' and column_name = 'popularity_level') as m_pop_level,
  (select count(*) from information_schema.columns
     where table_name = 'cantonese_vocabularies' and column_name = 'popularity_level') as c_pop_level,
  (select count(*) from information_schema.tables
     where table_schema = 'public' and table_name = 'user_important_vocabularies') as t_important,
  (select count(*) from information_schema.tables
     where table_schema = 'public' and table_name = 'user_vocabulary_mastery') as t_mastery,
  (select count(*) from pg_indexes
     where schemaname = 'public' and indexname like 'idx_%') as idx_cnt;
-- Kết quả mong đợi: 1 | 1 | 1 | 1 | 15
