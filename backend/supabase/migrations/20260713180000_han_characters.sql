-- Han Characters table: individual Chinese characters with Sino-Vietnamese readings
-- Run in Supabase Dashboard → SQL Editor, or: supabase db push

create table if not exists public.han_characters (
  id uuid primary key,
  user_id uuid references auth.users (id) on delete cascade not null,
  character text not null default '',
  han_viet text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists han_characters_user_id_idx on public.han_characters (user_id);

alter table public.han_characters enable row level security;

grant select, insert, update, delete on public.han_characters to authenticated;

-- select own
drop policy if exists "han_characters_select_own" on public.han_characters;
create policy "han_characters_select_own" on public.han_characters
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- insert own
drop policy if exists "han_characters_insert_own" on public.han_characters;
create policy "han_characters_insert_own" on public.han_characters
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- update own
drop policy if exists "han_characters_update_own" on public.han_characters;
create policy "han_characters_update_own" on public.han_characters
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- delete own
drop policy if exists "han_characters_delete_own" on public.han_characters;
create policy "han_characters_delete_own" on public.han_characters
  for delete to authenticated
  using ((select auth.uid()) = user_id);
