-- Full CC-Canto senses for detail view (english, vietnamese, example per sense)
alter table public.words
  add column if not exists definitions jsonb not null default '[]'::jsonb;

comment on column public.words.definitions is
  'Array of { english, vietnamese, example? } — table shows short summary from first 1–2 senses';
