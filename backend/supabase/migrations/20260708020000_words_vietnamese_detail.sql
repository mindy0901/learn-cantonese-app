-- Optional longer Vietnamese explanation — shown in word detail only, not in table
alter table public.words
  add column if not exists vietnamese_detail text;

comment on column public.words.vietnamese_detail is
  'Optional Vietnamese detail/explanation — detail popup only';
