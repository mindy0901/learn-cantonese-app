-- Add jyutping column to han_characters table

alter table public.han_characters
  add column if not exists jyutping text;

comment on column public.han_characters.jyutping is 'Cantonese Jyutping reading for this character (from CC-Canto)';
