-- Cantonese app: words, grammar bank, lessons (per-user with RLS)
-- Run in Supabase Dashboard → SQL Editor, or: supabase db push

create table if not exists public.words (
  id uuid primary key,
  user_id uuid references auth.users (id) on delete cascade not null,
  english text not null default '',
  han text not null default '',
  vietnamese text not null default '',
  han_viet text,
  jyutping text,
  important boolean not null default false,
  mastered boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.grammar_bank (
  id uuid primary key,
  user_id uuid references auth.users (id) on delete cascade not null,
  title text not null default '',
  content text not null default '',
  important boolean not null default false,
  mastered boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.lessons (
  id uuid primary key,
  user_id uuid references auth.users (id) on delete cascade not null,
  name text not null default '',
  word_ids uuid[] not null default '{}',
  grammar jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists words_user_id_idx on public.words (user_id);
create index if not exists grammar_bank_user_id_idx on public.grammar_bank (user_id);
create index if not exists lessons_user_id_idx on public.lessons (user_id);

alter table public.words enable row level security;
alter table public.grammar_bank enable row level security;
alter table public.lessons enable row level security;

grant select, insert, update, delete on public.words to authenticated;
grant select, insert, update, delete on public.grammar_bank to authenticated;
grant select, insert, update, delete on public.lessons to authenticated;

-- words
drop policy if exists "words_select_own" on public.words;
create policy "words_select_own" on public.words
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "words_insert_own" on public.words;
create policy "words_insert_own" on public.words
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "words_update_own" on public.words;
create policy "words_update_own" on public.words
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "words_delete_own" on public.words;
create policy "words_delete_own" on public.words
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- grammar_bank
drop policy if exists "grammar_select_own" on public.grammar_bank;
create policy "grammar_select_own" on public.grammar_bank
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "grammar_insert_own" on public.grammar_bank;
create policy "grammar_insert_own" on public.grammar_bank
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "grammar_update_own" on public.grammar_bank;
create policy "grammar_update_own" on public.grammar_bank
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "grammar_delete_own" on public.grammar_bank;
create policy "grammar_delete_own" on public.grammar_bank
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- lessons
drop policy if exists "lessons_select_own" on public.lessons;
create policy "lessons_select_own" on public.lessons
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "lessons_insert_own" on public.lessons;
create policy "lessons_insert_own" on public.lessons
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "lessons_update_own" on public.lessons;
create policy "lessons_update_own" on public.lessons
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "lessons_delete_own" on public.lessons;
create policy "lessons_delete_own" on public.lessons
  for delete to authenticated
  using ((select auth.uid()) = user_id);
