import { api } from './api.js'
import { WORD_BROWSE_PREFETCH_PAGES } from './constants.js'

const cache = new Map()
const inflight = new Map()
let cacheOwner = 'guest'

export function setWordBrowseCacheOwner(ownerId) {
  const next = ownerId ?? 'guest'
  if (cacheOwner === next) return
  cacheOwner = next
  cache.clear()
  inflight.clear()
}

function buildKey(params) {
  return JSON.stringify({
    owner: cacheOwner,
    page: params.page,
    pageSize: params.pageSize,
    sortKey: params.sortKey,
    sortDir: params.sortDir,
    filter: params.filter,
    q: (params.q ?? '').trim(),
    importantFirst: Boolean(params.importantFirst),
    studyDue: Boolean(params.studyDue),
    maxProgress: params.maxProgress ?? null,
  })
}

export function patchWordInBrowseCache(wordId, patch) {
  if (!wordId || !patch) return
  for (const entry of cache.values()) {
    const items = entry.result?.items
    if (!Array.isArray(items)) continue
    for (let i = 0; i < items.length; i++) {
      if (items[i]?.id === wordId) {
        items[i] = { ...items[i], ...patch }
      }
    }
  }
}

export function invalidateWordBrowseCache() {
  cache.clear()
}

export function getCachedWordBrowsePage(params, revision) {
  const entry = cache.get(buildKey(params))
  if (!entry || entry.revision !== revision) return null
  return entry.result
}

export function fetchWordBrowsePage(params, { revision } = {}) {
  const key = buildKey(params)
  const cached = cache.get(key)
  if (cached && cached.revision === revision) {
    return Promise.resolve(cached.result)
  }

  const pending = inflight.get(key)
  if (pending) return pending

  const promise = api
    .browseWords(params)
    .then((result) => {
      cache.set(key, { result, revision })
      inflight.delete(key)
      return result
    })
    .catch((err) => {
      inflight.delete(key)
      throw err
    })

  inflight.set(key, promise)
  return promise
}

export function prefetchWordBrowsePages(baseParams, currentPage, totalPages, { revision, mergeWords } = {}) {
  const prefetchCount = WORD_BROWSE_PREFETCH_PAGES
  for (let offset = 1; offset <= prefetchCount; offset++) {
    const page = currentPage + offset
    if (page > totalPages) break

    const params = { ...baseParams, page }
    const key = buildKey(params)
    const cached = cache.get(key)
    if (cached && cached.revision === revision) continue
    if (inflight.has(key)) continue

    fetchWordBrowsePage(params, { revision })
      .then((result) => mergeWords?.(result.items ?? []))
      .catch(() => {})
  }
}
