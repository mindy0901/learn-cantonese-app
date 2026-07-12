/** Marks a word as intentionally having no Hán–Việt reading (e.g. pure Cantonese). */
export const HAN_VIET_NONE = '#'

export function isHanVietNone(hanViet) {
  const text = String(hanViet ?? '').trim()
  if (!text) return false
  if (text === HAN_VIET_NONE) return true
  const tokens = text.split(/\s+/).filter(Boolean)
  return tokens.length > 0 && tokens.every((token) => /^_+$/.test(token))
}
