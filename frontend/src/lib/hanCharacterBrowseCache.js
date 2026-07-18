import { api } from './api.js'

const CHUNK_SIZE = 5
const cache = new Map()
const inflight = new Map()
let cacheOwner = 'guest'

export function setHanCharacterBrowseCacheOwner(ownerId) {
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
    search: (params.search ?? '').trim(),
  })
}

export function patchHanCharacterInBrowseCache(id, patch) {
  if (!id || !patch) return
  for (const entry of cache.values()) {
    const items = entry.result?.items
    if (!Array.isArray(items)) continue
    for (let i = 0; i < items.length; i++) {
      if (items[i]?.id === id) {
        items[i] = { ...items[i], ...patch }
      }
    }
  }
}

export function invalidateHanCharacterBrowseCache() {
  cache.clear()
}

export function getCachedHanCharacterBrowsePage(params, revision) {
  const entry = cache.get(buildKey(params))
  if (!entry || entry.revision !== revision) return null
  return entry.result
}

/**
 * Fetch a chunk of pages in one API call.
 * Returns the result for the first page in the chunk (used for initial display).
 * All pages are cached individually.
 */
export function fetchHanCharacterBrowseChunk(baseParams, page, totalPages, { revision } = {}) {
  // Build the chunk: if totalPages unknown (≤0), fetch CHUNK_SIZE pages ahead
  const maxPage = totalPages > 0 ? totalPages : page + CHUNK_SIZE - 1
  const chunkPages = []
  for (let i = 0; i < CHUNK_SIZE; i++) {
    const p = page + i
    if (p > maxPage) break
    chunkPages.push(p)
  }

  const chunkKey = JSON.stringify({
    owner: cacheOwner,
    chunk: chunkPages.join(','),
    pageSize: baseParams.pageSize,
    sortKey: baseParams.sortKey,
    sortDir: baseParams.sortDir,
    filter: baseParams.filter,
    search: (baseParams.search ?? '').trim(),
  })

  const pending = inflight.get(chunkKey)
  if (pending) return pending

  const promise = api
    .browseHanCharactersChunk({
      pageSize: baseParams.pageSize,
      search: baseParams.search,
      filter: baseParams.filter,
      sortKey: baseParams.sortKey,
      sortDir: baseParams.sortDir,
      pages: chunkPages,
    })
    .then((result) => {
      const total = result.total ?? 0
      const totalPages = result.totalPages ?? 1
      const hanTraditionalCount = result.hanTraditionalCount ?? 0
      const pages = result.pages ?? {}

      // Cache each page individually
      for (const [pageStr, pageData] of Object.entries(pages)) {
        const pageNum = Number(pageStr)
        const key = buildKey({ ...baseParams, page: pageNum })
        cache.set(key, {
          result: {
            items: pageData.items ?? [],
            total,
            totalPages,
            hanTraditionalCount,
            page: pageNum,
            pageSize: baseParams.pageSize,
            startIndex: pageData.startIndex ?? (pageNum - 1) * baseParams.pageSize,
          },
          revision,
        })
      }

      inflight.delete(chunkKey)
      return { total, totalPages, pages }
    })
    .catch((err) => {
      inflight.delete(chunkKey)
      throw err
    })

  inflight.set(chunkKey, promise)
  return promise
}
