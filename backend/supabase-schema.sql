-- Supabase schema — mirrors backend/prisma/schema.prisma (public schema) — SPLIT MANDARIN/CANTONESE (2026-08-17)
-- Run in Supabase Dashboard → SQL Editor → New query → Run
--
-- ⚠️ Xóa bảng cũ KHÔNG còn trên local (mirror = local; bảng đã drop 2026-08-16/08-31):

drop table if exists public.sentence_patterns cascade;
drop table if exists public.user_vocabularies cascade;
drop table if exists public.vocabulary_characters cascade;
drop table if exists public.vocabulary_examples cascade;
drop table if exists public.vocabulary_meanings cascade;
drop table if exists public.vocabularies cascade;
drop table if exists public.han_characters cascade;
drop table if exists public.flashcard_deck_vocabularies cascade;

-- ── users ──
create table if not exists public.users (
  id uuid primary key,
  email text unique not null,
  password text,
  name text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── radicals (214 bộ thủ) ──
create table if not exists public.radicals (
  id uuid primary key,
  number int unique not null,
  "char" varchar not null,
  name varchar not null,
  "desc" text,
  pinyin varchar,
  variants varchar[] not null default '{}',
  stroke_count int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Mandarin ──
create table if not exists public.mandarin_vocabularies (
  id uuid primary key,
  hanzi_simplified varchar,
  hanzi_traditional varchar,
  hanzi_characters jsonb,
  hsk_level varchar,
  popularity real,
  popularity_level smallint,
  related_words jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mandarin_vocabulary_romanizations (
  id uuid primary key,
  mandarin_vocabulary_id uuid not null references public.mandarin_vocabularies(id) on delete cascade,
  pinyin varchar not null,
  sino_vietnamese varchar not null
);

create table if not exists public.mandarin_vocabulary_meanings (
  id uuid primary key,
  mandarin_vocabulary_romanization_id uuid not null references public.mandarin_vocabulary_romanizations(id) on delete cascade,
  zh varchar not null default '',
  vi text not null default '',
  en text not null default '',
  position smallint not null default 0
);

create table if not exists public.mandarin_vocabulary_examples (
  id uuid primary key,
  mandarin_vocabulary_meaning_id uuid not null references public.mandarin_vocabulary_meanings(id) on delete cascade,
  zh varchar not null default '',
  romanization varchar not null default '',
  vi text not null default '',
  en text not null default ''
);

-- ── Cantonese ──
create table if not exists public.cantonese_vocabularies (
  id uuid primary key,
  hanzi_traditional_hk varchar,
  pure_cantonese boolean not null default false,
  popularity real,
  popularity_level smallint,
  hanzi_characters jsonb,
  related_words jsonb,
  hanzi_audio varchar,
  english_audio varchar,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cantonese_vocabulary_romanizations (
  id uuid primary key,
  cantonese_vocabulary_id uuid not null references public.cantonese_vocabularies(id) on delete cascade,
  jyutping varchar not null,
  sino_vietnamese varchar not null
);

create table if not exists public.cantonese_vocabulary_meanings (
  id uuid primary key,
  cantonese_vocabulary_romanization_id uuid not null references public.cantonese_vocabulary_romanizations(id) on delete cascade,
  vi text not null default '',
  en text not null default '',
  position smallint not null default 0
);

create table if not exists public.cantonese_vocabulary_examples (
  id uuid primary key,
  cantonese_vocabulary_meaning_id uuid not null references public.cantonese_vocabulary_meanings(id) on delete cascade,
  yue varchar not null default '',
  romanization varchar not null default '',
  vi text not null default '',
  en text not null default '',
  hanzi_audio varchar,
  english_audio varchar
);

-- ── grammars ──
create table if not exists public.grammars (
  id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  title varchar not null default '',
  content text not null default '',
  details varchar[] not null default '{}',
  notes varchar[] not null default '{}',
  structure text,
  hsk_level varchar,
  important boolean not null default false,
  mastered boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.grammar_examples (
  id uuid primary key,
  grammar_id uuid not null references public.grammars(id) on delete cascade,
  han_example text,
  jyutping_example varchar,
  pinyin_example varchar,
  viet_example varchar,
  eng_example varchar,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── flashcard_decks + joins ──
create table if not exists public.flashcard_decks (
  id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  name varchar not null default '',
  description text,
  color varchar,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.flashcard_deck_mandarin_vocabularies (
  id uuid primary key,
  deck_id uuid not null references public.flashcard_decks(id) on delete cascade,
  mandarin_vocabulary_id uuid not null references public.mandarin_vocabularies(id) on delete cascade,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (deck_id, mandarin_vocabulary_id)
);

create table if not exists public.flashcard_deck_cantonese_vocabularies (
  id uuid primary key,
  deck_id uuid not null references public.flashcard_decks(id) on delete cascade,
  cantonese_vocabulary_id uuid not null references public.cantonese_vocabularies(id) on delete cascade,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (deck_id, cantonese_vocabulary_id)
);

-- ── vocabulary_sets + joins ──
create table if not exists public.vocabulary_sets (
  id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  name varchar not null default '',
  description text,
  color varchar,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.vocabulary_set_mandarin_vocabularies (
  id uuid primary key,
  set_id uuid not null references public.vocabulary_sets(id) on delete cascade,
  mandarin_vocabulary_id uuid not null references public.mandarin_vocabularies(id) on delete cascade,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (set_id, mandarin_vocabulary_id)
);

create table if not exists public.vocabulary_set_cantonese_vocabularies (
  id uuid primary key,
  set_id uuid not null references public.vocabulary_sets(id) on delete cascade,
  cantonese_vocabulary_id uuid not null references public.cantonese_vocabularies(id) on delete cascade,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (set_id, cantonese_vocabulary_id)
);

-- ── user_checkins (KHÔNG FK tới users — local users không có PK chuẩn) ──
create table if not exists public.user_checkins (
  id uuid primary key,
  user_id uuid not null,
  checkin_date date not null,
  created_at timestamptz not null default now(),
  unique (user_id, checkin_date)
);

-- ── user_favorite_vocabularies / user_disliked_vocabularies (2026-09-20) — cặp ❤️ yêu thích / 🚫 không muốn học theo user ──
create table if not exists public.user_favorite_vocabularies (
  id uuid primary key,
  user_id uuid not null,
  language varchar(16) not null,
  vocabulary_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, language, vocabulary_id)
);
create index if not exists user_favorite_vocabularies_user_id_idx on public.user_favorite_vocabularies (user_id);

create table if not exists public.user_disliked_vocabularies (
  id uuid primary key,
  user_id uuid not null,
  language varchar(16) not null,
  vocabulary_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, language, vocabulary_id)
);
create index if not exists user_disliked_vocabularies_user_id_idx on public.user_disliked_vocabularies (user_id);

-- ── tags + vocabulary_tags (2026-09-27) — tag dùng chung (admin quản lý), gán cho từ vựng ──
create table if not exists public.tags (
  id uuid primary key,
  name varchar(64) not null,
  color varchar(16),
  created_at timestamptz not null default now(),
  unique (name)
);

create table if not exists public.vocabulary_tags (
  id uuid primary key,
  tag_id uuid not null references public.tags (id) on delete cascade,
  language varchar(16) not null,
  vocabulary_id uuid not null,
  created_at timestamptz not null default now(),
  unique (tag_id, language, vocabulary_id)
);
create index if not exists vocabulary_tags_tag_id_idx on public.vocabulary_tags (tag_id);
create index if not exists idx_vt_vocabulary_id on public.vocabulary_tags (vocabulary_id);

-- ── user_vocabulary_mastery (2026-09-02) — tiến độ mastered 0-100% theo user ──
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
create index if not exists user_vocabulary_mastery_user_id_idx on public.user_vocabulary_mastery (user_id);

-- ⚠️ 2026-09-19: 2 ALTER này phải nằm SAU khi 2 bảng vocab đã được tạo (project MỚI tạo
-- cần thứ tự đúng; project cũ đã có bảng nên không lộ lỗi). `create table if not exists`
-- KHÔNG thêm cột vào bảng đã tồn tại → vẫn cần ALTER cho DB cũ.
alter table public.mandarin_vocabularies add column if not exists popularity_level smallint;
alter table public.cantonese_vocabularies add column if not exists popularity_level smallint;

-- ── INDEX (mirror local — FK + cột tra cứu) ──
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
create index if not exists idx_ufv_vocabulary_id on public.user_favorite_vocabularies (vocabulary_id);
create index if not exists idx_udv_vocabulary_id on public.user_disliked_vocabularies (vocabulary_id);

-- ── RLS: enable on all tables (app uses service role for backup) ──
alter table public.users enable row level security;
alter table public.radicals enable row level security;
alter table public.mandarin_vocabularies enable row level security;
alter table public.mandarin_vocabulary_romanizations enable row level security;
alter table public.mandarin_vocabulary_meanings enable row level security;
alter table public.mandarin_vocabulary_examples enable row level security;
alter table public.cantonese_vocabularies enable row level security;
alter table public.cantonese_vocabulary_romanizations enable row level security;
alter table public.cantonese_vocabulary_meanings enable row level security;
alter table public.cantonese_vocabulary_examples enable row level security;
alter table public.grammars enable row level security;
alter table public.grammar_examples enable row level security;
alter table public.flashcard_decks enable row level security;
alter table public.flashcard_deck_mandarin_vocabularies enable row level security;
alter table public.flashcard_deck_cantonese_vocabularies enable row level security;
alter table public.vocabulary_sets enable row level security;
alter table public.vocabulary_set_mandarin_vocabularies enable row level security;
alter table public.vocabulary_set_cantonese_vocabularies enable row level security;
alter table public.user_checkins enable row level security;
alter table public.user_favorite_vocabularies enable row level security;
alter table public.user_disliked_vocabularies enable row level security;
alter table public.user_vocabulary_mastery enable row level security;
alter table public.tags enable row level security;
alter table public.vocabulary_tags enable row level security;

notify pgrst, 'reload schema';
