import { api, getApiLanguage } from "./api.js";
import { WORD_BROWSE_PREFETCH_PAGES } from "./constants.js";

const cache = new Map();
const inflight = new Map();
let cacheOwner = "guest";

export function setVocabularyBrowseCacheOwner(ownerId) {
    const next = ownerId ?? "guest";
    if (cacheOwner === next) return;
    cacheOwner = next;
    cache.clear();
    inflight.clear();
}

function buildKey(params) {
    return JSON.stringify({
        owner: cacheOwner,
        lang: getApiLanguage(), // ⚠️ 2026-09: tránh cache chéo 2 bank khi đổi ngôn ngữ
        page: params.page,
        pageSize: params.pageSize,
        sortKey: params.sortKey,
        sortDir: params.sortDir,
        filter: params.filter,
        q: (params.q ?? "").trim(),
        favoriteFirst: Boolean(params.favoriteFirst),
        studyDue: Boolean(params.studyDue),
        maxProgress: params.maxProgress ?? null,
    });
}

export function patchVocabularyInBrowseCache(wordId, patch) {
    if (!wordId || !patch) return;
    for (const entry of cache.values()) {
        const items = entry.result?.items;
        if (!Array.isArray(items)) continue;
        for (let i = 0; i < items.length; i++) {
            if (items[i]?.id === wordId) {
                items[i] = { ...items[i], ...patch };
            }
        }
    }
}

export function invalidateVocabularyBrowseCache() {
    cache.clear();
}

export function fetchVocabularyBrowsePage(params, { revision } = {}) {
    const key = buildKey(params);
    const cached = cache.get(key);
    if (cached && cached.revision === revision) {
        return Promise.resolve(cached.result);
    }

    const pending = inflight.get(key);
    if (pending) return pending;

    const promise = api
        .browseVocabularies(params)
        .then((result) => {
            cache.set(key, { result, revision });
            inflight.delete(key);
            return result;
        })
        .catch((err) => {
            inflight.delete(key);
            throw err;
        });

    inflight.set(key, promise);
    return promise;
}
