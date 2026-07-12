-- Rename kanji → han (legacy DBs only; initial schema already uses han)
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'words'
      and column_name = 'kanji'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'words'
      and column_name = 'han'
  ) then
    alter table public.words rename column kanji to han;
  end if;
end $$;
