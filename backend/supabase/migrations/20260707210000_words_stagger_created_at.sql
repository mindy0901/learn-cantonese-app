-- Ensure bulk-imported words have distinct created_at for date sorting
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
