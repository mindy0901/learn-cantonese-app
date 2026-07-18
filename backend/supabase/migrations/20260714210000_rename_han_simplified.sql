-- Rename han_simplified to han_traditional (it stores HK traditional, not simplified)

alter table public.han_characters rename column han_simplified to han_traditional;

comment on column public.han_characters.han_traditional is 'Traditional Chinese variant (HK) of the character (from OpenCC s2hk)';
