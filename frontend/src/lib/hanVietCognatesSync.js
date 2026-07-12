import { api } from './api.js'
import {
  extractHanCharacters,
  hanVietReadingsEqual,
  hasFilledHanViet,
  hasUnresolvedHanVietSlots,
  normalizeHanVietValue,
  parseHanVietSlotReadings,
  parseHanVietTokens,
  isHanVietPlaceholder,
  computeHanVietSyncUpdates,
  HAN_VIET_ALT_SEP,
} from './hanVietSync.js'
import { isHanVietNone } from './hanVietMarkers.js'
import { normalizeWordFields } from './wordNormalize.js'

/** @typedef {{ word: string, traditional: string, hanViet: string, pinyin?: string, meaning?: string }} CognateEntry */

/** Learn per-character Hán–Việt from cognate compounds (e.g. 電影 → 電=Điện, 影=Ảnh). */
export function buildCharHanVietMapFromCognates(items) {
  const votes = new Map()

  for (const item of items ?? []) {
    if (!item?.hanViet) continue

    for (const han of [item.traditional, item.word]) {
      const chars = extractHanCharacters(han)
      const tokens = parseHanVietTokens(item.hanViet)
      if (chars.length === 0 || chars.length !== tokens.length) continue

      for (let i = 0; i < chars.length; i += 1) {
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

function buildCognatesLookupMap(items) {
  /** @type {Map<string, CognateEntry>} */
  const map = new Map()
  for (const item of items ?? []) {
    for (const key of [item.traditional, item.word]) {
      if (!key || map.has(key)) continue
      map.set(key, item)
    }
  }
  return map
}

function lookupWordCognate(word, cognatesMap) {
  const keys = [
    String(word.hanTraditional ?? '').trim(),
    String(word.hanSimplified ?? '').trim(),
    String(word.han ?? '').trim(),
  ].filter(Boolean)

  for (const key of keys) {
    const match = cognatesMap.get(key)
    if (match?.hanViet) return match
  }
  return null
}

function computeHanVietCognatesWordUpdates(words, cognatesMap) {
  const updates = []

  for (const word of words ?? []) {
    const chars = extractHanCharacters(word.hanTraditional)
    if (chars.length === 0) continue
    if (isHanVietNone(word.hanViet)) continue

    const prev = String(word.hanViet ?? '').trim()
    if (prev && hasFilledHanViet(prev) && !hasUnresolvedHanVietSlots(word.hanTraditional, prev)) {
      continue
    }

    const match = lookupWordCognate(word, cognatesMap)
    if (!match?.hanViet) continue

    const normalized = normalizeHanVietValue(
      normalizeWordFields({ ...word, hanViet: match.hanViet }).hanViet ?? '',
    )
    if (!normalized) continue
    if (prev && hanVietReadingsEqual(word.hanTraditional, prev, normalized)) continue

    updates.push({
      id: word.id,
      hanTraditional: word.hanTraditional,
      hanViet: normalized,
      prevHanViet: prev,
      source: match,
    })
  }

  return updates
}

/** Whole-word cognates first, then fill remaining • slots from cognate char map. */
export function computeHanVietCognatesSyncUpdates(words, cognatesMap, cognatesCharMap) {
  const byId = new Map()

  for (const update of computeHanVietCognatesWordUpdates(words, cognatesMap)) {
    byId.set(update.id, update)
  }

  const wordsAfterWordPass = words.map((word) =>
    byId.has(word.id) ? { ...word, hanViet: byId.get(word.id).hanViet } : word,
  )

  for (const update of computeHanVietSyncUpdates(wordsAfterWordPass, cognatesCharMap)) {
    if (byId.has(update.id)) continue
    byId.set(update.id, update)
  }

  return [...byId.values()]
}

export async function previewHanVietCognatesSync(words) {
  const { items, entryCount, keyCount } = await api.fetchHanVietCognates()
  const cognatesMap = buildCognatesLookupMap(items)
  const cognatesCharMap = buildCharHanVietMapFromCognates(items)
  const updates = computeHanVietCognatesSyncUpdates(words, cognatesMap, cognatesCharMap)
  return {
    updates,
    entryCount,
    keyCount,
    mappedCharCount: cognatesCharMap.size,
    matchedWordCount: updates.length,
  }
}

export async function lookupHanVietCognate(query) {
  const q = String(query ?? '').trim()
  if (!q) return null
  const result = await api.lookupHanVietCognate(q)
  return result.match ?? null
}
