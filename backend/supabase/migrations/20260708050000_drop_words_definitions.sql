-- Remove CC-Canto multi-sense definitions column
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
    coalesce(w.vietnamese_detail, '')
  );
$$;

alter table public.words drop column if exists definitions;

update public.words w
set search_key = public.words_build_search_key(w);
