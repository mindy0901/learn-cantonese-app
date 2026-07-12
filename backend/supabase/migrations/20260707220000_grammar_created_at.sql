alter table public.grammar_bank
  add column if not exists created_at timestamptz;

update public.grammar_bank
set created_at = updated_at
where created_at is null;

alter table public.grammar_bank
  alter column created_at set default now(),
  alter column created_at set not null;

create index if not exists grammar_bank_user_created_at_idx on public.grammar_bank (user_id, created_at desc);
