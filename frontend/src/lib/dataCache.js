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

const DB_NAME = "cantonese-app-data";
const STORE_NAME = "cache";
// ⚠️ 2026-09-20: bump v2 → v3 vì payload bootstrap đổi field user-data
// (`importantVocabularyIds` → `favoriteVocabularyIds` + `dislikedVocabularyIds`).
// Cache cũ (v2) không có 2 field này ⇒ favorite/disliked luôn rỗng khi hydrate từ cache
// (signature data KHÔNG đổi nên background refresh trả 304 → không bao giờ tự sửa).
const CACHE_KEY_PREFIX = "cantonese-data-cache-v3-";

/** @returns {string} cache key scoped to the current user */
function cacheKey() {
    // Use a stable userId; fall back to 'anon' for public/guest users
    try {
        const raw = localStorage.getItem("cantonese-app-auth");
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed?.user?.id) return CACHE_KEY_PREFIX + parsed.user.id;
        }
    } catch {
        /* ignore */
    }
    return CACHE_KEY_PREFIX + "anon";
}

/** Open (and lazily create) the IndexedDB database. */
function openDb() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/** Small promise wrapper around a one-shot readwrite/readonly tx. */
function withStore(mode, fn) {
    return openDb().then(
        (db) =>
            new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, mode);
                const store = tx.objectStore(STORE_NAME);
                let result;
                try {
                    result = fn(store, tx);
                } catch (err) {
                    reject(err);
                    return;
                }
                tx.oncomplete = () => {
                    db.close();
                    resolve(result);
                };
                tx.onerror = () => {
                    db.close();
                    reject(tx.error);
                };
                tx.onabort = () => {
                    db.close();
                    reject(tx.error);
                };
            }),
    );
}

/**
 * Save the raw API payload to IndexedDB.
 * @param {object} payload - the raw response from GET /api/data
 */
// ⚠️ 2026-09-20: generation counter chống RACE khi lưu cache.
// Background refresh fetch payload (có thể MẤT vài giây) → nếu trong lúc đó có mutation
// (`invalidateDataCache`) thì payload CŨ (đã fetch trước mutation) KHÔNG được ghi lại vào cache —
// nếu ghi, F5 sau render từ cache cũ + ETag nội dung không đổi (304) ⇒ đánh dấu ❤️/🚫 "biến mất".
let cacheGeneration = 0;

export function saveDataCache(payload) {
    const key = cacheKey();
    const entry = { ts: Date.now(), payload };
    return withStore("readwrite", (store) => {
        store.put(entry, key);
    }).catch(() => {
        // Storage unavailable (private mode / blocked) — silently ignore
    });
}

/** Số hiện tại của generation — capture TRƯỚC khi fetch, so lại SAU khi fetch xong. */
export function getCacheGeneration() {
    return cacheGeneration;
}

/**
 * Load the cached API payload from IndexedDB.
 * @returns {Promise<object | null>} the raw payload, or null if no valid cache
 *
 * ⚠️ 2026-09-02: KHÔNG dùng `withStore` cho READ — withStore resolve bằng IDBRequest object
 * (chứ không phải request.result) → `entry?.payload` luôn undefined → loadDataCache luôn trả null
 * dù cache đã ghi (save OK vì fire-and-forget). Phải đọc request.result qua onsuccess riêng.
 */
export function loadDataCache() {
    const key = cacheKey();
    return openDb()
        .then(
            (db) =>
                new Promise((resolve) => {
                    let tx;
                    try {
                        tx = db.transaction(STORE_NAME, "readonly");
                    } catch {
                        db.close();
                        resolve(null);
                        return;
                    }
                    const store = tx.objectStore(STORE_NAME);
                    const req = store.get(key);
                    req.onsuccess = () => {
                        db.close();
                        resolve(req.result?.payload ?? null);
                    };
                    req.onerror = () => {
                        db.close();
                        resolve(null);
                    };
                }),
        )
        .catch(() => null);
}

/** Invalidate (delete) the cache so next hydrate fetches fresh data. */
export function invalidateDataCache() {
    const key = cacheKey();
    cacheGeneration += 1;
    return withStore("readwrite", (store) => {
        store.delete(key);
    }).catch(() => {
        // ignore
    });
}
