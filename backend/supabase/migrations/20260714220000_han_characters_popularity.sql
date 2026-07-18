-- User-rated character commonness: 0=low (thấp), 1=medium (trung bình), 2=high (cao), 3=very high (rất cao)
-- Same scale as words.popularity for consistent sorting
alter table public.han_characters
  add column if not exists popularity smallint
  check (popularity is null or (popularity >= 0 and popularity <= 3));

comment on column public.han_characters.popularity is
  'User vote: 0 low, 1 medium, 2 high, 3 very high';
