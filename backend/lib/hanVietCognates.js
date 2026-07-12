import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { normalizeHanVietValue } from './hanVietReadings.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TSV_PATH = join(__dirname, '../data/chinese-hanviet-cognates.tsv')
const HAN_RE = /\p{Script=Han}/u

/** @type {Map<string, CognateEntry> | null} */
let lookupMap = null
/** @type {CognateEntry[] | null} */
let allEntries = null

/**
 * @typedef {Object} CognateEntry
 * @property {string} word
 * @property {string} traditional
 * @property {string} pinyin
 * @property {string} hanViet
 * @property {string} meaning
 * @property {number} ranking
 * @property {number} frequency
 */

function extractHanCharacters(han) {
  return [...String(han ?? '').trim()].filter((ch) => HAN_RE.test(ch))
}

/** Parse TSV hanviet column into per-character slots (space = char, slash = alt reading). */
export function parseCognateHanVietSlots(rawHanViet, charCount) {
  const text = String(rawHanViet ?? '').trim()
  if (!text || charCount <= 0) return null

  const slashParts = text.split('/').map((part) => part.trim()).filter(Boolean)
  const variants = []

  for (let i = 0; i < slashParts.length; ) {
    const part = slashParts[i]
    if (part.includes(' ')) {
      const slots = part.split(/\s+/).filter(Boolean)
      if (slots.length === charCount) {
        variants.push(slots)
        i += 1
        continue
      }
    }

    if (i + charCount <= slashParts.length) {
      const slice = slashParts.slice(i, i + charCount)
      if (slice.every((segment) => !segment.includes(' '))) {
        variants.push(slice)
        i += charCount
        continue
      }
    }

    const slots = part.split(/\s+/).filter(Boolean)
    if (slots.length === charCount) variants.push(slots)
    i += 1
  }

  if (variants.length === 0) return null

  const merged = Array.from({ length: charCount }, () => [])
  for (const variant of variants) {
    for (let slot = 0; slot < charCount; slot += 1) {
      merged[slot].push(variant[slot])
    }
  }

  return merged.map((slotReadings) => {
    const seen = new Set()
    const unique = []
    for (const reading of slotReadings) {
      const key = reading.toLocaleLowerCase('vi')
      if (seen.has(key)) continue
      seen.add(key)
      unique.push(reading)
    }
    return unique.join('/')
  })
}

function toAppHanViet(han, rawHanViet) {
  const charCount = extractHanCharacters(han).length
  if (charCount === 0) return ''
  const slots = parseCognateHanVietSlots(rawHanViet, charCount)
  if (!slots || slots.length !== charCount) return ''
  return normalizeHanVietValue(slots.join(' '))
}

function parseTsvRow(line) {
  const parts = line.split('\t')
  if (parts.length < 7) return null

  const [rankingRaw, frequencyRaw, word, traditional, pinyin, hanviet, ...meaningParts] = parts
  const han = String(traditional || word || '').trim()
  if (!han) return null

  const hanViet = toAppHanViet(han, hanviet)
  if (!hanViet) return null

  return {
    ranking: Number(rankingRaw) || 0,
    frequency: Number(frequencyRaw) || 0,
    word: String(word ?? '').trim(),
    traditional: String(traditional ?? '').trim(),
    pinyin: String(pinyin ?? '').trim(),
    hanViet,
    meaning: meaningParts.join('\t').trim(),
  }
}

function loadCognatesFromDisk() {
  let text
  try {
    text = readFileSync(TSV_PATH, 'utf8')
  } catch (err) {
    throw new Error(
      `Không đọc được chinese-hanviet-cognates.tsv — ${err instanceof Error ? err.message : err}`,
    )
  }

  const entries = []
  const map = new Map()

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('chinese word ranking')) continue
    const entry = parseTsvRow(line)
    if (!entry) continue
    entries.push(entry)

    for (const key of [entry.traditional, entry.word]) {
      if (!key || map.has(key)) continue
      map.set(key, entry)
    }
  }

  return { entries, map }
}

function ensureLoaded() {
  if (!lookupMap || !allEntries) {
    const loaded = loadCognatesFromDisk()
    lookupMap = loaded.map
    allEntries = loaded.entries
  }
  return { lookupMap, allEntries }
}

/** Exact Han lookup (simplified or traditional key). */
export function lookupHanVietCognate(query) {
  const q = String(query ?? '').trim()
  if (!q) return null
  const { lookupMap: map } = ensureLoaded()
  return map.get(q) ?? null
}

/** All cognate entries for bulk sync on the client. */
export function listHanVietCognates() {
  const { allEntries: entries } = ensureLoaded()
  return entries
}

export function getHanVietCognatesStats() {
  const { allEntries: entries, lookupMap: map } = ensureLoaded()
  return { entryCount: entries.length, keyCount: map.size }
}

/** Warm cognates index on server start (non-blocking). */
export function warmHanVietCognatesIndex() {
  try {
    ensureLoaded()
  } catch (err) {
    console.warn('[hanviet-cognates] Index warmup failed —', err.message ?? err)
  }
}
