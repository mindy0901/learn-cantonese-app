-- Add han_simplified column to han_characters

alter table public.han_characters
  add column if not exists han_simplified text;

comment on column public.han_characters.han_simplified is 'Simplified Chinese variant of the character (from OpenCC)';
