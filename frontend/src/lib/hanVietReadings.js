import { HAN_VIET_NONE, isHanVietNone } from './hanVietMarkers.js'

/** Placeholder for Han characters without a known Hán–Việt reading yet. */
export const HAN_VIET_PLACEHOLDER = '•'
/** Previous placeholder kept for reading legacy synced values. */
export const HAN_VIET_PLACEHOLDER_LEGACY = '·'

/** Separator between alternative readings for the same Han character. */
export const HAN_VIET_ALT_SEP = '/'

function stripTrailingPunctuation(value) {
  const TRAILING_PUNCT_RE = /(?:\.{2,}|[\s.,?!…:;，。！？、])+$/u
  let s = String(value ?? '').trim()
  while (s.length > 0) {
    const next = s.replace(TRAILING_PUNCT_RE, '').trim()
    if (next === s) break
    s = next
  }
  return s
}

function titleCaseSegment(segment) {
  if (!segment) return segment
  const lower = segment.toLocaleLowerCase('vi')
  return lower.charAt(0).toLocaleUpperCase('vi') + lower.slice(1)
}

function titleCaseToken(token) {
  return token.split('-').map(titleCaseSegment).join('-')
}

function toDisplayCase(value) {
  return String(value ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(titleCaseToken)
    .join(' ')
}

export function isHanVietPlaceholder(token) {
  return token === HAN_VIET_PLACEHOLDER || token === HAN_VIET_PLACEHOLDER_LEGACY
}

/** Alternative readings for one Han character slot, e.g. "Phạn/Bàn" → ["Phạn", "Bàn"]. */
export function parseHanVietSlotReadings(slot) {
  return String(slot ?? '')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
}

function normalizeHanVietSlot(slot) {
  const readings = parseHanVietSlotReadings(slot)
  if (readings.length === 0) return ''

  const normalized = readings.map((reading) => {
    if (isHanVietPlaceholder(reading) || /^_+$/.test(reading)) return reading
    return toDisplayCase(stripTrailingPunctuation(reading))
  })

  const seen = new Set()
  const unique = []
  for (const reading of normalized) {
    const key = reading.toLocaleLowerCase('vi')
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(reading)
  }

  return unique.join(HAN_VIET_ALT_SEP)
}

/** Normalize full Hán–Việt string (spaces = characters, slashes = alternative readings). */
export function normalizeHanVietValue(hanViet) {
  const text = String(hanViet ?? '').trim()
  if (!text) return ''
  if (isHanVietNone(text)) return HAN_VIET_NONE

  return text
    .split(/\s+/)
    .filter(Boolean)
    .map(normalizeHanVietSlot)
    .filter(Boolean)
    .join(' ')
}

function formatHanVietSlotForDisplay(slot) {
  return parseHanVietSlotReadings(slot)
    .map((reading) => (isHanVietPlaceholder(reading) ? HAN_VIET_PLACEHOLDER : reading))
    .join(' / ')
}

/** Show Hán–Việt with placeholders and alternative readings. */
export function displayHanViet(hanViet) {
  if (hanViet == null || hanViet === '') return hanViet
  if (isHanVietNone(hanViet)) return HAN_VIET_NONE

  const tokens = String(hanViet).split(/\s+/).filter(Boolean)
  const displayed = []
  let pendingUnderscore = false

  for (const token of tokens) {
    if (/^_+$/.test(token)) {
      pendingUnderscore = true
      continue
    }
    if (pendingUnderscore) {
      displayed.push(HAN_VIET_NONE)
      pendingUnderscore = false
    }
    displayed.push(formatHanVietSlotForDisplay(token))
  }

  if (pendingUnderscore) displayed.push(HAN_VIET_NONE)
  return displayed.join(' ')
}

export function parseHanVietTokens(hanViet) {
  return String(hanViet ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

/** Per-syllable marker for unknown / no Hán–Việt reading (already synced). */
export function isHanVietUnresolvedToken(token) {
  const readings = parseHanVietSlotReadings(token)
  if (readings.length === 0) return true
  return readings.every((reading) => isHanVietPlaceholder(reading) || /^_+$/.test(reading))
}

/** True when the word already has at least one real Hán–Việt reading (not placeholder-only). */
export function hasFilledHanViet(hanViet) {
  if (!String(hanViet ?? '').trim()) return false
  if (isHanVietNone(hanViet)) return false

  return parseHanVietTokens(hanViet).some((token) => {
    const readings = parseHanVietSlotReadings(token)
    return readings.some((reading) => !isHanVietUnresolvedToken(reading))
  })
}

const HAN_RE = /\p{Script=Han}/u

function extractHanCharacters(han) {
  return [...String(han ?? '').trim()].filter((ch) => HAN_RE.test(ch))
}

function alignHanVietTokens(tokens, charCount) {
  const aligned = [...tokens]
  while (aligned.length > charCount) {
    aligned.splice(0, 1)
  }
  while (aligned.length < charCount) {
    aligned.push(HAN_VIET_PLACEHOLDER)
  }
  return aligned
}

/** True when at least one Han character slot is still placeholder-only. */
export function hasUnresolvedHanVietSlots(han, hanViet) {
  const chars = extractHanCharacters(han)
  if (chars.length === 0) return false
  const tokens = alignHanVietTokens(parseHanVietTokens(hanViet), chars.length)
  return tokens.some((token) => isHanVietUnresolvedToken(token))
}
