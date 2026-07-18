-- Add important and mastered flags to han_characters
alter table public.han_characters
  add column if not exists important boolean not null default false,
  add column if not exists mastered boolean not null default false;
