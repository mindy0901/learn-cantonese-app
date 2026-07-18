-- Fix: drop actual constraint names (from table recreation) and re-add with 0-4 range

alter table public.words
  drop constraint if exists words_new_popularity_check;

alter table public.words
  drop constraint if exists words_popularity_check;

alter table public.words
  add constraint words_popularity_check
  check (popularity is null or (popularity >= 0 and popularity <= 4));

alter table public.han_characters
  drop constraint if exists han_characters_new_popularity_check;

alter table public.han_characters
  drop constraint if exists han_characters_popularity_check;

alter table public.han_characters
  add constraint han_characters_popularity_check
  check (popularity is null or (popularity >= 0 and popularity <= 4));
