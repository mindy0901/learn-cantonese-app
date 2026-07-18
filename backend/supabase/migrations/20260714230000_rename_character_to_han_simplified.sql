-- Rename character → han_simplified to match words table naming convention
alter table public.han_characters
  rename column "character" to "han_simplified";
