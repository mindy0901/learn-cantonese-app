-- Sentence patterns (mẫu câu): complete example sentences linked to vocabulary

create table if not exists public.sentence_patterns (
  id uuid primary key,
  user_id uuid references auth.users (id) on delete cascade not null,
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
  updated_at timestamptz not null default now()
);

create index if not exists sentence_patterns_user_id_idx on public.sentence_patterns (user_id);
create index if not exists sentence_patterns_word_ids_idx on public.sentence_patterns using gin (word_ids);

alter table public.sentence_patterns enable row level security;

grant select, insert, update, delete on public.sentence_patterns to authenticated;

drop policy if exists "sentence_patterns_select_own" on public.sentence_patterns;
create policy "sentence_patterns_select_own" on public.sentence_patterns
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "sentence_patterns_insert_own" on public.sentence_patterns;
create policy "sentence_patterns_insert_own" on public.sentence_patterns
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "sentence_patterns_update_own" on public.sentence_patterns;
create policy "sentence_patterns_update_own" on public.sentence_patterns
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "sentence_patterns_delete_own" on public.sentence_patterns;
create policy "sentence_patterns_delete_own" on public.sentence_patterns
  for delete to authenticated
  using ((select auth.uid()) = user_id);
