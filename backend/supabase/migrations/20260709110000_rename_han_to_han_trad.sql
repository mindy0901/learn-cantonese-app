-- Align with han_simp: traditional Chinese column is han_trad
alter table public.words rename column han to han_trad;

create or replace function public.words_build_search_key(w public.words)
returns text
language sql
immutable
as $$
  select public.normalize_search_text(
    coalesce(w.han_trad, '') || ' ' ||
    coalesce(w.han_simp, '') || ' ' ||
    coalesce(w.english, '') || ' ' ||
    coalesce(w.vietnamese, '') || ' ' ||
    coalesce(w.han_viet, '') || ' ' ||
    coalesce(w.jyutping, '') || ' ' ||
    coalesce(w.vietnamese_detail, '')
  );
$$;

update public.words w
set search_key = public.words_build_search_key(w);

comment on column public.words.han_trad is
  'Traditional Chinese (Hong Kong). Primary display form; pairs with han_simp.';
