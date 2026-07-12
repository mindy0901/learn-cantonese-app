-- Accent-insensitive word search (e.g. Vietnamese without diacritics)
create extension if not exists unaccent with schema extensions;

create or replace function public.normalize_search_text(input text)
returns text
language sql
immutable
parallel safe
as $$
  select trim(both from regexp_replace(
    lower(extensions.unaccent(coalesce(input, ''))),
    '\s+', ' ', 'g'
  ));
$$;

create or replace function public.words_build_search_key(w public.words)
returns text
language sql
immutable
as $$
  select public.normalize_search_text(
    coalesce(w.han, '') || ' ' ||
    coalesce(w.english, '') || ' ' ||
    coalesce(w.vietnamese, '') || ' ' ||
    coalesce(w.han_viet, '') || ' ' ||
    coalesce(w.jyutping, '') || ' ' ||
    coalesce(w.vietnamese_detail, '') || ' ' ||
    coalesce(w.definitions::text, '')
  );
$$;

alter table public.words
  add column if not exists search_key text;

create or replace function public.words_set_search_key()
returns trigger
language plpgsql
as $$
begin
  new.search_key := public.words_build_search_key(new);
  return new;
end;
$$;

drop trigger if exists words_search_key_trg on public.words;
create trigger words_search_key_trg
  before insert or update on public.words
  for each row
  execute function public.words_set_search_key();

update public.words w
set search_key = public.words_build_search_key(w);

comment on column public.words.search_key is
  'Normalized concatenation of searchable fields for accent-insensitive lookup';
