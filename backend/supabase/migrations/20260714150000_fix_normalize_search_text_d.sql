-- Fix normalize_search_text: PostgreSQL unaccent does NOT handle đ/Đ
-- (U+0111/U+0110 - d with stroke) because they are base letters, not letters
-- with combining diacritics. Add explicit đ→d mapping.
-- Re-backfill words.search_key and han_characters.search_key.

begin;

create or replace function public.normalize_search_text(input text)
returns text
language sql
immutable
parallel safe
as $$
  select trim(both from regexp_replace(
    lower(replace(extensions.unaccent(coalesce(input, '')), 'đ', 'd')),
    '\s+', ' ', 'g'
  ));
$$;

-- Re-backfill words.search_key
update public.words w
set search_key = public.words_build_search_key(w)
where w.search_key ~ 'đ';

-- Re-backfill han_characters.search_key (JS-side generation may also miss đ)
update public.han_characters
set search_key = lower(translate(
  coalesce(character, '') || ' ' || coalesce(han_viet, ''),
  'àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừữửựỳýỷỹỵđÀÁẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÈÉẺẼẸÊẾỀỂỄỆÌÍỈĨỊÒÓỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÙÚỦŨỤƯỨỪỬỮỰỲÝỶỸỴĐ',
  'aaaaaaaaaaaaaaaaadeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyydaaaaaaaaaaaaaaaaadeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd'
))
where search_key ~ 'đ';

commit;
