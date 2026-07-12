-- Add dialect tagging and Mandarin pronunciation for Mandarin/Cantonese filters.
-- han_traditional / han_simplified remain script variants (may be identical).

begin;

alter table public.words
  add column if not exists dialect text not null default 'cantonese'
    check (dialect in ('cantonese', 'mandarin', 'both')),
  add column if not exists pinyin text;

create index if not exists words_user_dialect_idx on public.words (user_id, dialect);

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
    coalesce(w.pinyin, '') || ' ' ||
    coalesce(w.vietnamese, '') || ' ' ||
    coalesce(w.vietnamese_detail, '') || ' ' ||
    coalesce(w.english, '')
  );
$$;

update public.words w
set search_key = public.words_build_search_key(w);

comment on column public.words.dialect is
  'Vocabulary dialect: cantonese, mandarin, or both (shared). Used for word-bank filters.';
comment on column public.words.pinyin is
  'Mandarin pronunciation (Hanyu Pinyin). Pairs with jyutping for Cantonese.';
comment on column public.words.han_simplified is
  'Simplified Chinese script. Equals han_traditional when the character has no simplified form.';
comment on column public.words.han_traditional is
  'Traditional Chinese script (HK). Equals han_simplified when the character has no traditional variant.';

commit;
