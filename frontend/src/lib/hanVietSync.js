import { normWordField, normalizeWordFields } from './wordNormalize.js'
import {
  HAN_VIET_ALT_SEP,
  HAN_VIET_PLACEHOLDER,
  HAN_VIET_PLACEHOLDER_LEGACY,
  isHanVietPlaceholder,
  isHanVietUnresolvedToken,
  hasFilledHanViet,
  hasUnresolvedHanVietSlots,
  normalizeHanVietValue,
  parseHanVietSlotReadings,
  parseHanVietTokens,
} from './hanVietReadings.js'
import { isHanVietNone } from './hanVietMarkers.js'

export { HAN_VIET_NONE, isHanVietNone } from './hanVietMarkers.js'
export {
  HAN_VIET_PLACEHOLDER,
  HAN_VIET_PLACEHOLDER_LEGACY,
  HAN_VIET_ALT_SEP,
  displayHanViet,
  normalizeHanVietValue,
  parseHanVietSlotReadings,
  parseHanVietTokens,
  isHanVietPlaceholder,
  isHanVietUnresolvedToken,
  hasFilledHanViet,
  hasUnresolvedHanVietSlots,
} from './hanVietReadings.js'

const HAN_RE = /\p{Script=Han}/u

export function extractHanCharacters(han) {
  return [...String(han ?? '').trim()].filter((ch) => HAN_RE.test(ch))
}

const UNRESOLVED_TOKEN_KEY = '\0unresolved'

function canonicalHanVietToken(token) {
  if (isHanVietUnresolvedToken(token)) return UNRESOLVED_TOKEN_KEY
  return normWordField(token)
}

function canonicalHanVietSlot(token) {
  return parseHanVietSlotReadings(token)
    .map(canonicalHanVietToken)
    .filter((reading) => reading !== UNRESOLVED_TOKEN_KEY)
    .sort()
    .join('|')
}

export function alignHanVietTokens(tokens, charCount) {
  const aligned = [...tokens]
  while (aligned.length > charCount) {
    if (
      aligned.length >= 2 &&
      isHanVietUnresolvedToken(aligned[0]) &&
      isHanVietUnresolvedToken(aligned[1])
    ) {
      aligned.splice(0, 1)
    } else {
      aligned.splice(0, 1)
    }
  }
  while (aligned.length < charCount) {
    aligned.push(HAN_VIET_PLACEHOLDER)
  }
  return aligned
}

export function hanVietReadingsEqual(han, a, b) {
  const charCount = extractHanCharacters(han).length
  if (charCount === 0) {
    const tokensA = parseHanVietTokens(a).map(canonicalHanVietSlot)
    const tokensB = parseHanVietTokens(b).map(canonicalHanVietSlot)
    if (tokensA.length !== tokensB.length) return false
    return tokensA.every((token, index) => token === tokensB[index])
  }

  const tokensA = alignHanVietTokens(parseHanVietTokens(a), charCount).map(canonicalHanVietSlot)
  const tokensB = alignHanVietTokens(parseHanVietTokens(b), charCount).map(canonicalHanVietSlot)
  return tokensA.every((token, index) => token === tokensB[index])
}

export function buildCharHanVietMap(words) {
  const votes = new Map()

  for (const word of words ?? []) {
    if (isHanVietNone(word.hanViet)) continue
    const chars = extractHanCharacters(word.hanTraditional)
    const tokens = parseHanVietTokens(word.hanViet)
    if (chars.length === 0 || chars.length !== tokens.length) continue

    for (let i = 0; i < chars.length; i++) {
      const readings = parseHanVietSlotReadings(tokens[i])
      for (const reading of readings) {
        if (isHanVietPlaceholder(reading) || /^_+$/.test(reading)) continue
        const ch = chars[i]
        if (!votes.has(ch)) votes.set(ch, new Map())
        const charVotes = votes.get(ch)
        charVotes.set(reading, (charVotes.get(reading) ?? 0) + 1)
      }
    }
  }

  const map = new Map()
  for (const [ch, charVotes] of votes) {
    const sorted = [...charVotes.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'vi'),
    )
    const unique = []
    const seen = new Set()
    for (const [reading] of sorted) {
      const key = reading.toLocaleLowerCase('vi')
      if (seen.has(key)) continue
      seen.add(key)
      unique.push(reading)
    }
    if (unique.length) map.set(ch, unique.join(HAN_VIET_ALT_SEP))
  }
  return map
}

export function deriveHanViet(han, charMap, placeholder = HAN_VIET_PLACEHOLDER) {
  const chars = extractHanCharacters(han)
  if (chars.length === 0) return ''
  return chars.map((ch) => charMap.get(ch) ?? placeholder).join(' ')
}

/** Fill only placeholder slots; keep readings the user or a prior sync already set. */
export function mergeHanVietFromCharMap(han, prev, charMap, placeholder = HAN_VIET_PLACEHOLDER) {
  const chars = extractHanCharacters(han)
  if (chars.length === 0) return ''
  const prevTokens = alignHanVietTokens(parseHanVietTokens(prev), chars.length)
  return chars
    .map((ch, index) => {
      const existing = prevTokens[index]
      if (existing && !isHanVietUnresolvedToken(existing)) return existing
      return charMap.get(ch) ?? placeholder
    })
    .join(' ')
}

export function computeHanVietSyncUpdates(words, charMap, { placeholder = HAN_VIET_PLACEHOLDER } = {}) {
  const updates = []

  for (const word of words ?? []) {
    const chars = extractHanCharacters(word.hanTraditional)
    if (chars.length === 0) continue
    if (isHanVietNone(word.hanViet)) continue

    const prev = String(word.hanViet ?? '').trim()
    if (prev && hasFilledHanViet(prev) && !hasUnresolvedHanVietSlots(word.hanTraditional, prev)) {
      continue
    }

    if (!chars.some((ch) => charMap.has(ch))) continue

    const derived =
      prev && hasFilledHanViet(prev)
        ? mergeHanVietFromCharMap(word.hanTraditional, prev, charMap, placeholder)
        : deriveHanViet(word.hanTraditional, charMap, placeholder)
    const normalized = normalizeHanVietValue(normalizeWordFields({ ...word, hanViet: derived }).hanViet ?? '')
    if (prev && hanVietReadingsEqual(word.hanTraditional, prev, normalized)) continue

    updates.push({
      id: word.id,
      hanTraditional: word.hanTraditional,
      hanViet: normalized,
      prevHanViet: prev,
    })
  }

  return updates
}

export function previewHanVietSync(words) {
  const charMap = buildCharHanVietMap(words)
  const updates = computeHanVietSyncUpdates(words, charMap)
  return {
    charMap,
    updates,
    mappedCharCount: charMap.size,
  }
}
