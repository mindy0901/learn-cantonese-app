-- Align naming with han_simp / hanSimplified: han_traditional / hanTraditional
alter table public.words rename column han_trad to han_traditional;

create or replace function public.words_build_search_key(w public.words)
returns text
language sql
immutable
as $$
  select public.normalize_search_text(
    coalesce(w.han_traditional, '') || ' ' ||
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

comment on column public.words.han_traditional is
  'Traditional Chinese (Hong Kong). Primary display form; pairs with han_simp.';
