-- Simplified Chinese (Mandarin) form alongside HK traditional in han
alter table public.words
  add column if not exists han_simp text;

comment on column public.words.han_simp is
  'Simplified Chinese (Mainland Mandarin). Canonical display uses han (HK traditional).';

-- Include han_simp in accent-insensitive search
create or replace function public.words_build_search_key(w public.words)
returns text
language sql
immutable
as $$
  select public.normalize_search_text(
    coalesce(w.han, '') || ' ' ||
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
