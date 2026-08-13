-- Supabase schema — mirrors backend/prisma/schema.prisma (public schema)
-- Run in Supabase Dashboard → SQL Editor → New query → Run

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

-- ── han_characters ──
create table if not exists public.han_characters (
  id uuid primary key,
  sino_vietnamese text[],
  han_simplified text,
  pinyin text[],
  han_traditional text not null,
  jyutping text[],
  hsk_level text,
  search_key text,
  frequency int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, han_simplified, han_traditional)
);
create index if not exists han_characters_jyutping_pinyin_idx on public.han_characters (jyutping, pinyin);

-- ── vocabularies ──
create table if not exists public.vocabularies (
  id uuid primary key,
  sino_vietnamese text,
  han_simplified text,
  pinyin text,
  han_traditional text not null,
  jyutping text,
  hsk_level text,
  search_key text,
  viet_meanings text,
  eng_meanings text,
  viet_examples text,
  pos text,
  frequency int,
  radical text,
  classifiers text,
  pinyin_numeric text,
  movie_word_rank int,
  book_word_rank int,
  related_words jsonb,
  han_characters jsonb,
  boost real,
  search_pinyin text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists vocabularies_search_idx on public.vocabularies (search_key, hsk_level);

-- ── vocabulary_meanings ──
create table if not exists public.vocabulary_meanings (
  id uuid primary key,
  vocabulary_id uuid not null references public.vocabularies(id) on delete cascade,
  category text,
  viet_meanings text,
  eng_meanings text,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── vocabulary_examples ──
create table if not exists public.vocabulary_examples (
  id uuid primary key,
  vocabulary_id uuid not null references public.vocabularies(id) on delete cascade,
  meaning_id uuid references public.vocabulary_meanings(id) on delete set null,
  han_example text,
  jyutping_example text,
  pinyin_example text,
  viet_examples text,
  eng_examples text,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── vocabulary_characters ──
create table if not exists public.vocabulary_characters (
  id uuid primary key,
  vocabulary_id uuid not null references public.vocabularies(id) on delete cascade,
  han_character_id uuid not null references public.han_characters(id) on delete cascade,
  position smallint not null,
  unique (vocabulary_id, han_character_id),
  unique (vocabulary_id, position)
);
create index if not exists vocabulary_characters_han_character_id_idx on public.vocabulary_characters (han_character_id);

-- ── grammars ──
create table if not exists public.grammars (
  id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null default '',
  content text not null default '',
  details text[] not null default '{}',
  notes text[] not null default '{}',
  structure text,
  hsk_level text,
  important boolean not null default false,
  mastered boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create index if not exists grammars_user_id_idx on public.grammars (user_id);

-- ── grammar_examples ──
create table if not exists public.grammar_examples (
  id uuid primary key,
  grammar_id uuid not null references public.grammars(id) on delete cascade,
  han_example text,
  jyutping_example text,
  pinyin_example text,
  viet_example text,
  eng_example text,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── user_vocabularies ──
create table if not exists public.user_vocabularies (
  id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  vocabulary_id uuid not null references public.vocabularies(id) on delete cascade,
  important boolean not null default false,
  mastered boolean not null default false,
  study_progress smallint not null default 0,
  study_progress_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, vocabulary_id)
);
create index if not exists user_vocabularies_user_id_idx on public.user_vocabularies (user_id);
create index if not exists user_vocabularies_vocabulary_id_idx on public.user_vocabularies (vocabulary_id);

-- ── sentence_patterns ──
create table if not exists public.sentence_patterns (
  id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  han_traditional text not null default '',
  han_simplified text,
  jyutping text,
  pinyin text,
  vietnamese text not null default '',
  english text not null default '',
  word_ids uuid[] not null default '{}',
  important boolean not null default false,
  mastered boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create index if not exists sentence_patterns_user_id_idx on public.sentence_patterns (user_id);

-- ── flashcard_decks ──
create table if not exists public.flashcard_decks (
  id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null default '',
  description text,
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create index if not exists flashcard_decks_user_id_idx on public.flashcard_decks (user_id);

-- ── flashcard_deck_vocabularies ──
create table if not exists public.flashcard_deck_vocabularies (
  id uuid primary key,
  deck_id uuid not null references public.flashcard_decks(id) on delete cascade,
  vocabulary_id uuid not null references public.vocabularies(id) on delete cascade,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (deck_id, vocabulary_id)
);
create index if not exists flashcard_deck_vocabularies_vocabulary_id_idx on public.flashcard_deck_vocabularies (vocabulary_id);

-- ── RLS: enable on all tables (app uses service role for backup) ──
alter table public.users enable row level security;
alter table public.han_characters enable row level security;
alter table public.vocabularies enable row level security;
alter table public.vocabulary_meanings enable row level security;
alter table public.vocabulary_examples enable row level security;
alter table public.vocabulary_characters enable row level security;
alter table public.grammars enable row level security;
alter table public.grammar_examples enable row level security;
alter table public.user_vocabularies enable row level security;
alter table public.sentence_patterns enable row level security;
alter table public.flashcard_decks enable row level security;
alter table public.flashcard_deck_vocabularies enable row level security;
