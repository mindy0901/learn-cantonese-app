-- Fix pinyin/jyutping arrays that have space-separated strings as single elements
-- (from earlier buggy migration: array['mat1 me1 mi1'] instead of array['mat1','me1','mi1'])

-- Fix pinyin: split any element containing spaces into separate array elements
update public.han_characters
set pinyin = (
  select array_agg(word order by idx)
  from unnest(pinyin) with ordinality as t(elem, idx),
       unnest(string_to_array(elem, ' ')) as word
)
where pinyin is not null
  and exists (select 1 from unnest(pinyin) as e where e like '% %');

-- Fix jyutping: split any element containing spaces
update public.han_characters
set jyutping = (
  select array_agg(word order by idx)
  from unnest(jyutping) with ordinality as t(elem, idx),
       unnest(string_to_array(elem, ' ')) as word
)
where jyutping is not null
  and exists (select 1 from unnest(jyutping) as e where e like '% %');
