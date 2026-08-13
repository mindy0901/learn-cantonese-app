/**
 * IndexedDB cache for the full app data payload.
 *
 * Why IndexedDB instead of localStorage:
 * - The full payload (~17k vocabularies + nested meanings/examples) can exceed
 *   the ~5MB localStorage quota, causing saves to silently fail.
 * - IndexedDB has a much larger quota and can hold the dataset reliably.
 *
 * Strategy:
 * - On hydrate, always fetch the latest snapshot from API, then save it here
 *   so the newest total (e.g. 17392) is persisted locally.
 */

const DB_NAME = 'cantonese-app-data'
const STORE_NAME = 'cache'
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

/** Open (and lazily create) the IndexedDB database. */
function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** Small promise wrapper around a one-shot readwrite/readonly tx. */
function withStore(mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode)
        const store = tx.objectStore(STORE_NAME)
        let result
        try {
          result = fn(store, tx)
        } catch (err) {
          reject(err)
          return
        }
        tx.oncomplete = () => {
          db.close()
          resolve(result)
        }
        tx.onerror = () => {
          db.close()
          reject(tx.error)
        }
        tx.onabort = () => {
          db.close()
          reject(tx.error)
        }
      }),
  )
}

/**
 * Save the raw API payload to IndexedDB.
 * @param {object} payload - the raw response from GET /api/data
 */
export function saveDataCache(payload) {
  const key = cacheKey()
  const entry = { ts: Date.now(), payload }
  return withStore('readwrite', (store) => {
    store.put(entry, key)
  }).catch(() => {
    // Storage unavailable (private mode / blocked) — silently ignore
  })
}

/**
 * Load the cached API payload from IndexedDB.
 * @returns {Promise<object | null>} the raw payload, or null if no valid cache
 */
export function loadDataCache() {
  const key = cacheKey()
  return withStore('readonly', (store) => {
    return store.get(key)
  })
    .then((entry) => (entry?.payload ? entry.payload : null))
    .catch(() => null)
}

/** Invalidate (delete) the cache so next hydrate fetches fresh data. */
export function invalidateDataCache() {
  const key = cacheKey()
  return withStore('readwrite', (store) => {
    store.delete(key)
  }).catch(() => {
    // ignore
  })
}