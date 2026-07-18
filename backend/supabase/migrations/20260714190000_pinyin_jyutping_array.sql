-- Change pinyin and jyutping from single text to text array (supports multiple readings per character)

begin;

-- === pinyin ===
alter table public.han_characters add column if not exists pinyin_arr text[];
update public.han_characters set pinyin_arr = string_to_array(pinyin, ' ') where pinyin is not null and pinyin != '';
alter table public.han_characters drop column if exists pinyin;
alter table public.han_characters rename column pinyin_arr to pinyin;

-- === jyutping ===
alter table public.han_characters add column if not exists jyutping_arr text[];
update public.han_characters set jyutping_arr = string_to_array(jyutping, ' ') where jyutping is not null and jyutping != '';
alter table public.han_characters drop column if exists jyutping;
alter table public.han_characters rename column jyutping_arr to jyutping;

-- Rebuild search_key
update public.han_characters
set search_key = lower(translate(
  coalesce(character, '') || ' ' ||
  coalesce(array_to_string(han_viet, ' '), '') || ' ' ||
  coalesce(array_to_string(pinyin, ' '), '') || ' ' ||
  coalesce(array_to_string(jyutping, ' '), ''),
  'àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừữửựỳýỷỹỵđÀÁẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÈÉẺẼẸÊẾỀỂỄỆÌÍỈĨỊÒÓỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÙÚỦŨỤƯỨỪỬỮỰỲÝỶỸỴĐ',
  'aaaaaaaaaaaaaaaaadeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyydaaaaaaaaaaaaaaaaadeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd'
))
where han_viet is not null or pinyin is not null or jyutping is not null;

commit;
