import { ensureHanVariants } from './opencc.js'
import { toPinyin } from './pinyin.js'

const SKIP_GLOSS = /^(variant of|erhua variant|old variant|see also|archaic variant)/i

/** @type {import('cc-cedict').default | null} */
let cedict = null
/** @type {{ idx: number, glossNorm: string }[] | null} */
let englishIndex = null
/** @type {Promise<void> | null} */
let loadPromise = null

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function ensureCedictLoaded() {
  if (cedict) return cedict
  if (!loadPromise) {
    loadPromise = import('cc-cedict')
      .then((mod) => {
        cedict = mod.default
      })
      .catch((err) => {
        loadPromise = null
        throw new Error(
          `CC-CEDICT chưa cài — chạy "pnpm install" trong backend. (${err.message ?? err})`,
        )
      })
  }
  await loadPromise
  return cedict
}

function buildEnglishIndex(all) {
  const items = []
  for (let idx = 0; idx < all.length; idx++) {
    const val = all[idx]
    const english = typeof val[3] === 'string' ? [val[3]] : val[3]
    for (const gloss of english) {
      if (!gloss || SKIP_GLOSS.test(gloss)) continue
      items.push({ idx, glossNorm: gloss.toLowerCase() })
    }
  }
  return items
}

async function ensureEnglishIndex() {
  const dict = await ensureCedictLoaded()
  if (!englishIndex) englishIndex = buildEnglishIndex(dict.data.all)
  return englishIndex
}

function scoreEnglishMatch(glossNorm, query) {
  if (glossNorm === query) return 100
  if (glossNorm.startsWith(`${query} `) || glossNorm.startsWith(`${query}(`)) return 85
  if (glossNorm.startsWith(query)) return 75
  const wordRe = new RegExp(`(?:^|[\\s/,(])${escapeRegex(query)}(?:$|[\\s/,)])`)
  if (wordRe.test(glossNorm)) return 60
  if (glossNorm.includes(query)) return 40
  return 0
}

function expandEntry(dict, idx) {
  return dict.expandValue(dict.data.all[idx], false)
}

function toResult(entry) {
  const { hanTraditional, hanSimplified } = ensureHanVariants({
    hanTraditional: entry.traditional,
    hanSimplified: entry.simplified,
  })
  return {
    traditional: hanTraditional,
    simplified: hanSimplified,
    pinyinNumbered: entry.pinyin,
    pinyin: toPinyin(hanSimplified) || entry.pinyin,
    english: entry.english,
  }
}

/** Search CC-CEDICT by English gloss (case-insensitive, substring / word match). */
export async function searchCedictByEnglish(query, { limit = 30 } = {}) {
  const q = String(query ?? '').trim().toLowerCase()
  if (q.length < 2) return []

  const dict = await ensureCedictLoaded()
  const index = await ensureEnglishIndex()
  const scored = []

  for (const { idx, glossNorm } of index) {
    const score = scoreEnglishMatch(glossNorm, q)
    if (score > 0) scored.push({ idx, score })
  }

  scored.sort((a, b) => b.score - a.score)

  const seen = new Set()
  const results = []
  for (const { idx } of scored) {
    const entry = expandEntry(dict, idx)
    const key = `${entry.traditional}|${entry.simplified}|${entry.pinyin.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    results.push(toResult(entry))
    if (results.length >= limit) break
  }

  return results
}

export function isLatinSearchQuery(text) {
  const q = String(text ?? '').trim()
  if (!q || q.length < 2) return false
  if (/\p{Script=Han}/u.test(q)) return false
  return /^[\p{L}\p{N}\s'.,\-()/]+$/u.test(q)
}

/** Warm CC-CEDICT on server start (non-blocking). */
export function warmCedictIndex() {
  ensureEnglishIndex().catch((err) => {
    console.warn('[cedict] Index warmup failed —', err.message ?? err)
  })
}
