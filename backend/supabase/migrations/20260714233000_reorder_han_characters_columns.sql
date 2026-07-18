-- Reorder public.han_characters columns to match words table layout
-- Data, indexes, RLS are preserved

begin;

-- Create new table with correct column order
create table public.han_characters_new (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  han_simplified text not null default '',
  han_traditional text,
  han_viet text[],
  jyutping text[],
  pinyin text[],
  popularity smallint check (popularity is null or (popularity >= 0 and popularity <= 3)),
  important boolean not null default false,
  mastered boolean not null default false,
  search_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.han_characters_new (
  id,
  user_id,
  han_simplified,
  han_traditional,
  han_viet,
  jyutping,
  pinyin,
  popularity,
  important,
  mastered,
  search_key,
  created_at,
  updated_at
)
select
  id,
  user_id,
  han_simplified,
  han_traditional,
  han_viet,
  jyutping,
  pinyin,
  popularity,
  important,
  mastered,
  search_key,
  created_at,
  updated_at
from public.han_characters;

drop table public.han_characters;

alter table public.han_characters_new rename to han_characters;

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

commit;
