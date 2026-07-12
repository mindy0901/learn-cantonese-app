-- Track when each word was first added (for sort by date added)
alter table public.words
  add column if not exists created_at timestamptz;

update public.words
set created_at = updated_at
where created_at is null;

alter table public.words
  alter column created_at set default now(),
  alter column created_at set not null;

create index if not exists words_user_created_at_idx on public.words (user_id, created_at desc);

-- Spread identical bulk-import timestamps so date sort is meaningful
with ranked as (
  select
    id,
    row_number() over (partition by user_id, updated_at order by id) as rn
  from public.words
)
update public.words w
set created_at = w.updated_at + ((r.rn - 1) * interval '1 millisecond')
from ranked r
where w.id = r.id;
