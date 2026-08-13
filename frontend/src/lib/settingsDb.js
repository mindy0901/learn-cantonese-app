/**
 * IndexedDB storage for lightweight user settings (prefs + UI state).
 *
 * Why IndexedDB instead of localStorage:
 * - Settings should survive alongside the larger data cache and be
 *   user-scoped without blocking the main thread on every write.
 * - IndexedDB writes are async, so the UI never blocks on persist.
 *
 * Strategy:
 * - Keeps localStorage as a synchronous fallback/seed so the app can boot
 *   with a value immediately; the authoritative copy is IndexedDB.
 */

const DB_NAME = "cantonese-app-settings";
const STORE_NAME = "settings";

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
                let request;
                try {
                    request = fn(store, tx);
                } catch (err) {
                    reject(err);
                    db.close();
                    return;
                }
                // For reads, fn returns an IDBRequest — resolve with its .result once done.
                if (request && typeof request.onsuccess === "function") {
                    request.onsuccess = () => {
                        db.close();
                        resolve(request.result);
                    };
                    request.onerror = () => {
                        db.close();
                        reject(request.error);
                    };
                    return;
                }
                // For writes (put/delete), fn returns nothing — resolve on tx completion.
                tx.oncomplete = () => {
                    db.close();
                    resolve(undefined);
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
 * Save a settings namespace (e.g. 'prefs' | 'ui') to IndexedDB.
 * Fire-and-forget — failures (private mode / blocked) are silently ignored.
 * @param {string} key
 * @param {object} value
 */
export function saveSettings(key, value) {
    return withStore("readwrite", (store) => {
        store.put(value, key);
    }).catch(() => {
        /* storage unavailable — ignore */
    });
}

/**
 * Load a settings namespace from IndexedDB.
 * @param {string} key
 * @returns {Promise<object | null>} the stored value, or null if absent/error
 */
export function loadSettings(key) {
    return withStore("readonly", (store) => {
        return store.get(key);
    }).then((value) => (value ? value : null));
}
