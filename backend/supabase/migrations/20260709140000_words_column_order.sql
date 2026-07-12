-- Reorder public.words columns for readable Supabase Table Editor layout.
-- Data, indexes, RLS, and search trigger are preserved.

begin;

drop trigger if exists words_search_key_trg on public.words;

drop function if exists public.words_set_search_key();
drop function if exists public.words_build_search_key(public.words);

create table public.words_new (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  han_simplified text,
  han_traditional text not null default '',
  han_viet text,
  jyutping text,
  vietnamese text not null default '',
  vietnamese_detail text,
  english text not null default '',
  popularity smallint check (popularity is null or (popularity >= 0 and popularity <= 3)),
  important boolean not null default false,
  mastered boolean not null default false,
  search_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.words_new (
  id,
  user_id,
  han_simplified,
  han_traditional,
  han_viet,
  jyutping,
  vietnamese,
  vietnamese_detail,
  english,
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
  vietnamese,
  vietnamese_detail,
  english,
  popularity,
  important,
  mastered,
  search_key,
  created_at,
  updated_at
from public.words;

drop table public.words;

alter table public.words_new rename to words;

create index if not exists words_user_id_idx on public.words (user_id);
create index if not exists words_user_created_at_idx on public.words (user_id, created_at desc);

alter table public.words enable row level security;

grant select, insert, update, delete on public.words to authenticated;

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

create or replace function public.words_build_search_key(w public.words)
returns text
language sql
immutable
as $$
  select public.normalize_search_text(
    coalesce(w.han_traditional, '') || ' ' ||
    coalesce(w.han_simplified, '') || ' ' ||
    coalesce(w.han_viet, '') || ' ' ||
    coalesce(w.jyutping, '') || ' ' ||
    coalesce(w.vietnamese, '') || ' ' ||
    coalesce(w.vietnamese_detail, '') || ' ' ||
    coalesce(w.english, '')
  );
$$;

create or replace function public.words_set_search_key()
returns trigger
language plpgsql
as $$
begin
  new.search_key := public.words_build_search_key(new);
  return new;
end;
$$;

create trigger words_search_key_trg
  before insert or update on public.words
  for each row
  execute function public.words_set_search_key();

update public.words w
set search_key = public.words_build_search_key(w);

comment on column public.words.han_simplified is
  'Simplified Chinese (Mainland Mandarin). Pairs with han_traditional.';
comment on column public.words.han_traditional is
  'Traditional Chinese (Hong Kong). Primary display form; pairs with han_simplified.';
comment on column public.words.vietnamese_detail is
  'Optional Vietnamese detail/explanation — detail popup only';
comment on column public.words.popularity is
  'User vote: 0 low, 1 medium, 2 high, 3 very high';
comment on column public.words.search_key is
  'Normalized concatenation of searchable fields for accent-insensitive lookup';

commit;
