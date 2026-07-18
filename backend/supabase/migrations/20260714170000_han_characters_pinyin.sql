-- Add pinyin column to han_characters table

alter table public.han_characters
  add column if not exists pinyin text;

comment on column public.han_characters.pinyin is 'Mandarin pinyin reading for this character';
