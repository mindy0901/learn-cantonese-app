-- Align with han_traditional / hanTraditional naming
alter table public.words rename column han_simp to han_simplified;

create or replace function public.words_build_search_key(w public.words)
returns text
language sql
immutable
as $$
  select public.normalize_search_text(
    coalesce(w.han_traditional, '') || ' ' ||
    coalesce(w.han_simplified, '') || ' ' ||
    coalesce(w.english, '') || ' ' ||
    coalesce(w.vietnamese, '') || ' ' ||
    coalesce(w.han_viet, '') || ' ' ||
    coalesce(w.jyutping, '') || ' ' ||
    coalesce(w.vietnamese_detail, '')
  );
$$;

update public.words w
set search_key = public.words_build_search_key(w);

comment on column public.words.han_simplified is
  'Simplified Chinese (Mainland Mandarin). Pairs with han_traditional.';
