import { ensureHanVariants, expandHanSearchTerms, hasHanScript } from './opencc.js'
import { getWordSearchBlob, normalizeSearchText } from './wordSearch.js'
import { api } from './api.js'
import { normalizeWordFields } from './wordNormalize.js'
import { LOOKUP_FETCH_PAGE_SIZE, LOOKUP_MAX_TOTAL } from './constants.js'

export { hasHanScript }

function hanForms(text) {
  return expandHanSearchTerms(text)
}

function wordHanForms(word) {
  const { hanTraditional, hanSimplified } = ensureHanVariants({
    hanTraditional: word.hanTraditional,
    hanSimplified: word.hanSimplified,
    hanTrad: word.hanTrad,
    han: word.han,
  })
  return [...new Set([...hanForms(hanTraditional), ...hanForms(hanSimplified)])]
}

/** OpenCC conversion preview — only for Chinese character input. */
export function resolveHanLookup(text) {
  const input = String(text ?? '').trim()
  if (!input || !hasHanScript(input)) return null

  const { hanTraditional, hanSimplified } = ensureHanVariants({ hanTraditional: input })
  return {
    input,
    traditional: hanTraditional,
    simplified: hanSimplified,
    same: hanTraditional === hanSimplified,
  }
}

export function wordLookupDisplay(word) {
  const { hanTraditional, hanSimplified } = ensureHanVariants({
    hanTraditional: word.hanTraditional,
    hanSimplified: word.hanSimplified,
    hanTrad: word.hanTrad,
    han: word.han,
  })

  return {
    traditional: hanTraditional,
    simplified: hanSimplified,
    showSimplified: hanTraditional !== hanSimplified,
    jyutping: String(word.jyutping ?? '').trim(),
    pinyin: String(word.pinyin ?? '').trim(),
    vietnamese: String(word.vietnamese ?? '').trim(),
    english: String(word.english ?? '').trim(),
  }
}

function hanMatchScore(wordHans, queryHans) {
  let best = 0
  for (const qh of queryHans) {
    for (const wh of wordHans) {
      if (wh === qh) best = Math.max(best, 3)
      else if (wh.startsWith(qh) || qh.startsWith(wh)) best = Math.max(best, 2)
      else if (wh.includes(qh) || qh.includes(wh)) best = Math.max(best, 1)
    }
  }
  return best
}

function fieldMatchScore(value, query) {
  const field = normalizeSearchText(value)
  if (!field || !query) return 0
  if (field === query) return 4
  if (field.startsWith(query)) return 3
  if (field.includes(query)) return 2
  return 0
}

function romanizationMatchScore(value, query) {
  const base = normalizeSearchText(value)
  if (!base || !query) return 0
  const tokens = [
    base,
    base.replace(/\d/g, ''),
    base.replace(/\s/g, ''),
    ...base.split(/\s+/).filter(Boolean),
  ]
  if (tokens.some((token) => token === query)) return 4
  if (tokens.some((token) => token.startsWith(query))) return 3
  if (tokens.some((token) => token.includes(query))) return 2
  return 0
}

function scoreWordForLookup(word, query) {
  const q = normalizeSearchText(query)
  if (!q) return 0

  const vietnameseScore = fieldMatchScore(word.vietnamese, q)
  const vietnameseDetailScore = fieldMatchScore(word.vietnameseDetail, q)
  const hanVietScore = fieldMatchScore(word.hanViet, q)
  const englishScore = fieldMatchScore(word.english, q)
  const jyutpingScore = romanizationMatchScore(word.jyutping, q)
  const pinyinScore = romanizationMatchScore(word.pinyin, q)

  const queryHans = hanForms(query)
  const wordHans = wordHanForms(word)
  const hanScore = hanMatchScore(wordHans, queryHans)

  const blobScore = getWordSearchBlob(word).includes(q) ? 1 : 0

  return Math.max(
    vietnameseScore,
    vietnameseDetailScore,
    hanVietScore,
    englishScore,
    jyutpingScore,
    pinyinScore,
    hanScore,
    blobScore,
  )
}

/** Rank lookup results by relevance — keeps every word returned from the server. */
export function rankWordsForHanLookup(words, query) {
  const q = String(query ?? '').trim()
  if (!q) return []

  return (words ?? [])
    .map((word) => ({ word, score: scoreWordForLookup(word, q) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.word.hanTraditional ?? '').localeCompare(b.word.hanTraditional ?? '', 'zh-Hant'),
    )
    .map((entry) => entry.word)
}

async function fetchBrowseAllForTerm(term) {
  const items = []
  let page = 1
  let totalPages = 1

  while (page <= totalPages && items.length < LOOKUP_MAX_TOTAL) {
    const result = await api.browseWords({
      page,
      pageSize: LOOKUP_FETCH_PAGE_SIZE,
      sortKey: 'hanTraditional',
      sortDir: 'asc',
      filter: 'all',
      q: term,
    })
    for (const raw of result.items ?? []) {
      items.push(normalizeWordFields(raw))
    }
    totalPages = result.totalPages ?? 1
    page += 1
  }

  return items
}

/** Search the full word bank — server expands OpenCC Han variants + romanization variants. */
export async function searchWordsForLookup(query) {
  const q = String(query ?? '').trim()
  if (!q) return []

  const items = await fetchBrowseAllForTerm(q)
  return rankWordsForHanLookup(items, q)
}
