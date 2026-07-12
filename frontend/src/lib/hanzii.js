const HANZII_HL = {
  vi: 'vi',
  en: 'en',
  'zh-CN': 'zh-CN',
  'zh-TW': 'zh-TW',
}

export function hanziiHl(locale) {
  return HANZII_HL[locale] ?? 'en'
}

export function hanziiWordUrl(hanTraditional, locale) {
  const query = String(hanTraditional ?? '').trim()
  if (!query) return null
  const hl = hanziiHl(locale)
  return `https://hanzii.net/search/word/${encodeURIComponent(query)}?hl=${encodeURIComponent(hl)}`
}

export function hanziiHomeUrl(locale) {
  return `https://hanzii.net/?hl=${encodeURIComponent(hanziiHl(locale))}`
}
