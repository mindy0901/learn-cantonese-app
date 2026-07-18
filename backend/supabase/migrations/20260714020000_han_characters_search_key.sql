-- Add search_key column for accent-insensitive Vietnamese search on han_characters
-- Mirrors the pattern used in words table (migration 20260708040000)

-- 1. Add the column
alter table public.han_characters
  add column if not exists search_key text;

-- 2. Backfill existing rows: normalize character + han_viet (strip Vietnamese diacritics)
-- PostgreSQL translate() maps each diacritic character to its base form.
update public.han_characters
set search_key = lower(translate(
  coalesce(character, '') || ' ' || coalesce(han_viet, ''),
  'àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừữửựỳýỷỹỵđÀÁẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÈÉẺẼẸÊẾỀỂỄỆÌÍỈĨỊÒÓỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÙÚỦŨỤƯỨỪỬỮỰỲÝỶỸỴĐ',
  'aaaaaaaaaaaaaaaaadeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyydaaaaaaaaaaaaaaaaadeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd'
))
where search_key is null;

comment on column public.han_characters.search_key is
  'Normalized concatenation of character and han_viet for accent-insensitive lookup';
