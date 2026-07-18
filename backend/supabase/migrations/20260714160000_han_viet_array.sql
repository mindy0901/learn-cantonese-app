-- Change han_viet from single text to text array (supports multiple readings per character)
-- Existing single readings are migrated to single-element arrays.

begin;

-- 1. Add new array column
alter table public.han_characters
  add column if not exists han_viet_arr text[];

-- 2. Migrate existing data: wrap single readings in arrays, skip null/empty
update public.han_characters
set han_viet_arr = array[han_viet]
where han_viet is not null and han_viet != '';

-- 3. Drop old column
alter table public.han_characters
  drop column if exists han_viet;

-- 4. Rename new column to han_viet
alter table public.han_characters
  rename column han_viet_arr to han_viet;

-- 5. Rebuild search_key (normalize all readings, deduplicate in app code for future writes)
update public.han_characters
set search_key = lower(translate(
  coalesce(character, '') || ' ' || coalesce(array_to_string(han_viet, ' '), ''),
  'àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừữửựỳýỷỹỵđÀÁẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÈÉẺẼẸÊẾỀỂỄỆÌÍỈĨỊÒÓỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÙÚỦŨỤƯỨỪỬỮỰỲÝỶỸỴĐ',
  'aaaaaaaaaaaaaaaaadeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyydaaaaaaaaaaaaaaaaadeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd'
))
where han_viet is not null and array_length(han_viet, 1) > 0;

commit;
