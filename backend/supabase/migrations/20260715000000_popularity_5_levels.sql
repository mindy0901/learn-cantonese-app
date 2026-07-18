-- Extend popularity scale from 0-3 to 0-4 across both tables
-- 0=hiếm (rare), 1=thấp (low), 2=trung bình (medium), 3=cao (high), 4=rất cao (very high)

alter table public.words
  drop constraint if exists words_popularity_check;

alter table public.words
  add constraint words_popularity_check
  check (popularity is null or (popularity >= 0 and popularity <= 4));

alter table public.han_characters
  drop constraint if exists han_characters_popularity_check;

alter table public.han_characters
  add constraint han_characters_popularity_check
  check (popularity is null or (popularity >= 0 and popularity <= 4));
