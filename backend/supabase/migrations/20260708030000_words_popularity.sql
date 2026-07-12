-- User-rated word commonness: 0=low, 1=medium, 2=high, 3=very high (Hanzii-style)
alter table public.words
  add column if not exists popularity smallint
  check (popularity is null or (popularity >= 0 and popularity <= 3));

comment on column public.words.popularity is
  'User vote: 0 low, 1 medium, 2 high, 3 very high';
