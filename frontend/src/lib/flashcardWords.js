import { WORD_FETCH_PAGE_SIZE } from './constants.js'
import { api } from './api.js'
import { fetchWordBrowsePage } from './wordBrowseCache.js'
import { compareDueWords, isWordDueForReview, matchesFlashcardScope } from './flashcardDue.js'

export { FLASHCARD_SESSION_SIZES } from './flashcardPrefs.js'

function shuffleArray(items) {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function browseFilterForScope(scope) {
  if (scope === 'important') return 'important'
  return 'all'
}

function browseParamsForConfig(config, page, pageSize) {
  const { source, scope } = config
  const params = {
    page,
    pageSize,
    sortKey: source === 'due' ? 'studyProgressAt' : 'createdAt',
    sortDir: source === 'due' ? 'asc' : 'desc',
    filter: browseFilterForScope(scope),
    q: '',
  }
  if (source === 'due') params.studyDue = true
  if (scope === 'lowProgress') params.maxProgress = 49
  return params
}

async function fetchLessonWordsByLesson(lesson, { mergeWords } = {}) {
  const ids = lesson?.wordIds ?? []
  if (!ids.length) return []
  const words = await api.fetchWordsByIds(ids)
  mergeWords?.(words)
  return words ?? []
}

function filterLessonPool(words, config) {
  return words.filter((word) => {
    if (word.mastered) return false
    if (!matchesFlashcardScope(word, config.scope)) return false
    if (config.source === 'due') return isWordDueForReview(word)
    return true
  })
}

export async function countDueFlashcardWords({ revision, mergeWords } = {}) {
  try {
    const result = await fetchWordBrowsePage(
      { page: 1, pageSize: 1, studyDue: true, filter: 'all', sortKey: 'studyProgressAt', sortDir: 'asc' },
      { revision },
    )
    mergeWords?.(result.items ?? [])
    return result.total ?? 0
  } catch {
    return 0
  }
}

async function collectDueWords(count, config, { mergeWords, revision } = {}) {
  const collected = []
  let page = 1
  const pageSize = WORD_FETCH_PAGE_SIZE
  const maxPages = 40

  while (collected.length < count && page <= maxPages) {
    const result = await fetchWordBrowsePage(browseParamsForConfig(config, page, pageSize), { revision })
    mergeWords?.(result.items ?? [])

    for (const word of result.items ?? []) {
      if (word.mastered) continue
      if (!matchesFlashcardScope(word, config.scope)) continue
      if (!isWordDueForReview(word)) continue
      collected.push(word)
      if (collected.length >= count) break
    }

    if (page >= (result.totalPages ?? 1)) break
    page++
  }

  return collected.sort(compareDueWords).slice(0, count)
}

async function collectRandomWords(count, config, { mergeWords, revision, wordTotal } = {}) {
  if (!wordTotal || count <= 0) return []

  const pageSize = WORD_FETCH_PAGE_SIZE
  const totalPages = Math.max(1, Math.ceil(wordTotal / pageSize))
  const collected = new Map()
  const target = Math.min(count, wordTotal)
  let attempts = 0
  const maxAttempts = Math.max(totalPages * 4, 12)

  while (collected.size < target && attempts < maxAttempts) {
    const page = Math.floor(Math.random() * totalPages) + 1
    const result = await fetchWordBrowsePage(browseParamsForConfig(config, page, pageSize), { revision })
    mergeWords?.(result.items ?? [])

    for (const word of result.items ?? []) {
      if (word.mastered) continue
      if (!matchesFlashcardScope(word, config.scope)) continue
      if (!collected.has(word.id)) collected.set(word.id, word)
      if (collected.size >= target) break
    }
    attempts++
  }

  return shuffleArray([...collected.values()]).slice(0, target)
}

/**
 * @param {number} count
 * @param {{
 *   source?: string,
 *   scope?: string,
 *   lessonId?: string,
 *   lesson?: { wordIds?: string[] },
 *   mergeWords?: Function,
 *   revision?: number,
 *   wordTotal?: number,
 * }} options
 */
export async function fetchFlashcardWords(
  count,
  { source = 'random', scope = 'all', lessonId = '', lesson = null, mergeWords, revision, wordTotal } = {},
) {
  const config = { source, scope, lessonId }

  if (lessonId && lesson) {
    const pool = filterLessonPool(await fetchLessonWordsByLesson(lesson, { mergeWords }), config)
    const ordered = source === 'due' ? [...pool].sort(compareDueWords) : shuffleArray(pool)
    return ordered.slice(0, count)
  }

  if (source === 'due') {
    return collectDueWords(count, config, { mergeWords, revision })
  }

  return collectRandomWords(count, config, { mergeWords, revision, wordTotal })
}

/** @deprecated Use fetchFlashcardWords */
export async function fetchRandomFlashcardWords(count, options = {}) {
  return fetchFlashcardWords(count, { ...options, source: 'random', scope: 'all' })
}
