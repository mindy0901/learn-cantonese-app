/**
 * Lightweight localStorage cache for the full app data payload.
 *
 * Strategy:
 * - On hydrate, load cache instantly → then refresh from API in background.
 * - On any mutation, invalidate cache so next startup fetches fresh data.
 */

const CACHE_KEY_PREFIX = 'cantonese-data-cache-v2-'

/** @returns {string} cache key scoped to the current user */
function cacheKey() {
  // Use a stable userId; fall back to 'anon' for public/guest users
  try {
    const raw = localStorage.getItem('cantonese-app-auth')
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed?.user?.id) return CACHE_KEY_PREFIX + parsed.user.id
    }
  } catch { /* ignore */ }
  return CACHE_KEY_PREFIX + 'anon'
}

/**
 * Save the raw API payload to localStorage.
 * @param {object} payload - the raw response from GET /api/data
 */
export function saveDataCache(payload) {
  try {
    const entry = {
      ts: Date.now(),
      payload,
    }
    localStorage.setItem(cacheKey(), JSON.stringify(entry))
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

/**
 * Load the cached API payload from localStorage.
 * @returns {object | null} the raw payload, or null if no valid cache
 */
export function loadDataCache() {
  try {
    const raw = localStorage.getItem(cacheKey())
    if (!raw) return null
    const entry = JSON.parse(raw)
    if (!entry?.payload) return null
    return entry.payload
  } catch {
    return null
  }
}

/** Invalidate (delete) the cache so next hydrate fetches fresh data. */
export function invalidateDataCache() {
  try {
    localStorage.removeItem(cacheKey())
  } catch { /* ignore */ }
}
