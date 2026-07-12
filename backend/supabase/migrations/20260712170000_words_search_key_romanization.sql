-- Index tone-less and space-less jyutping/pinyin variants for accent-insensitive lookup.

begin;

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
    coalesce(regexp_replace(coalesce(w.jyutping, ''), '\d', '', 'g'), '') || ' ' ||
    coalesce(regexp_replace(coalesce(w.jyutping, ''), '[\s\d]', '', 'g'), '') || ' ' ||
    coalesce(w.pinyin, '') || ' ' ||
    coalesce(regexp_replace(coalesce(w.pinyin, ''), '\d', '', 'g'), '') || ' ' ||
    coalesce(regexp_replace(coalesce(w.pinyin, ''), '[\s\d]', '', 'g'), '') || ' ' ||
    coalesce(w.vietnamese, '') || ' ' ||
    coalesce(w.vietnamese_detail, '') || ' ' ||
    coalesce(w.english, '')
  );
$$;

update public.words w
set search_key = public.words_build_search_key(w);

commit;
