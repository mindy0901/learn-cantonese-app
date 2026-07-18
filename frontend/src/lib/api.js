import { log, logApiError } from "./actionLog.js";
import { PAGE_SIZE } from "./constants.js";
import { normalizePopularity } from "./wordPopularity.js";

const API = import.meta.env.VITE_API_URL ?? "";

async function request(path, options = {}) {
    const method = options.method ?? "GET";

    try {
        const res = await fetch(`${API}${path}`, {
            credentials: "include",
            ...options,
            headers: {
                "Content-Type": "application/json",
                ...options.headers,
            },
        });

        if (!res.ok) {
            const raw = await res.text();
            let message = res.statusText;
            try {
                const body = JSON.parse(raw);
                if (body.error) message = body.error;
            } catch {
                if (res.status === 404 && /Cannot (GET|POST|PUT|PATCH|DELETE)/i.test(raw)) {
                    message = `API route missing (${path})`;
                }
            }
            const error = new Error(message);
            error.status = res.status;
            logApiError(method, path, error);
            throw error;
        }

        if (res.status === 204) return null;

        return JSON.parse(await res.text());
    } catch (err) {
        // HTTP errors already logged above (have .status)
        if (!(err instanceof Error && "status" in err)) {
            logApiError(method, path, err);
        }
        throw err;
    }
}

export const api = {
    getAuthStatus: () => request("/auth/status"),
    getMe: () => request("/auth/me"),
    logout: () => request("/auth/logout", { method: "POST" }),

    fetchFromCloud: () => request("/api/data"),

    fetchFullData: () => api.fetchFromCloud(),

    browseWords: async ({
        page = 1,
        pageSize = PAGE_SIZE,
        sortKey = "createdAt",
        sortDir = "desc",
        filter = "all",
        q = "",
        importantFirst = false,
        studyDue = false,
        maxProgress = null,
    } = {}) => {
        const params = new URLSearchParams({
            page: String(page),
            pageSize: String(pageSize),
            sortKey,
            sortDir,
            filter,
            importantFirst: importantFirst ? "1" : "0",
        });
        if (q.trim()) params.set("q", q.trim());
        if (studyDue) params.set("studyDue", "1");
        if (maxProgress != null && maxProgress !== "") params.set("maxProgress", String(maxProgress));
        const query = params.toString();
        try {
            return await request(`/api/words/browse?${query}`);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (!/not found|404/i.test(message)) throw err;
            return request(`/api/words?${query}`);
        }
    },

    fetchWordsByIds: (ids) => {
        const list = [...new Set((ids ?? []).map(String).filter(Boolean))];
        if (list.length === 0) return Promise.resolve([]);
        return request(`/api/words/by-ids?ids=${encodeURIComponent(list.join(","))}`);
    },

    createWord: (word) => request("/api/words", { method: "POST", body: JSON.stringify(word) }),
    updateWord: (id, word) => request(`/api/words/${id}`, { method: "PUT", body: JSON.stringify(word) }),
    patchWordFlags: async (id, flags, word) => {
        const payload = { ...flags };
        if ("popularity" in payload) {
            payload.popularity = normalizePopularity(payload.popularity);
        }
        try {
            return await request(`/api/words/${id}/flags`, {
                method: "PATCH",
                body: JSON.stringify(payload),
            });
        } catch (err) {
            const status = err?.status;
            const message = err instanceof Error ? err.message : String(err);
            const patchUnavailable = status === 404 || /cannot patch|not found/i.test(message);
            const patchRejected =
                status === 400 &&
                ("popularity" in payload ||
                    "important" in payload ||
                    "mastered" in payload ||
                    "studyProgress" in payload);
            if ((!patchUnavailable && !patchRejected) || !word) throw err;
            return request(`/api/words/${id}`, {
                method: "PUT",
                body: JSON.stringify({ ...word, ...payload }),
            });
        }
    },
    deleteWord: (id) => request(`/api/words/${id}`, { method: "DELETE" }),

    createGrammar: (item) => request("/api/grammar", { method: "POST", body: JSON.stringify(item) }),
    updateGrammar: (id, item) => request(`/api/grammar/${id}`, { method: "PUT", body: JSON.stringify(item) }),
    deleteGrammar: (id) => request(`/api/grammar/${id}`, { method: "DELETE" }),

    createSentencePattern: (item) => request("/api/sentence-patterns", { method: "POST", body: JSON.stringify(item) }),
    updateSentencePattern: (id, item) =>
        request(`/api/sentence-patterns/${id}`, { method: "PUT", body: JSON.stringify(item) }),
    deleteSentencePattern: (id) => request(`/api/sentence-patterns/${id}`, { method: "DELETE" }),
    fetchSentencePatternsForWord: (wordId) => request(`/api/sentence-patterns/by-word/${wordId}`),

    createLesson: (lesson) => request("/api/lessons", { method: "POST", body: JSON.stringify(lesson) }),
    updateLesson: (id, lesson) => request(`/api/lessons/${id}`, { method: "PUT", body: JSON.stringify(lesson) }),
    deleteLesson: (id) => request(`/api/lessons/${id}`, { method: "DELETE" }),

    backfillHanVariants: () => request("/api/data/backfill-han-variants", { method: "POST", body: "{}" }),

    backfillPinyin: () => request("/api/data/backfill-pinyin", { method: "POST", body: "{}" }),

    backfillHanCharPinyin: () => request("/api/data/backfill-han-char-pinyin", { method: "POST", body: "{}" }),

    backfillHanCharJyutping: () => request("/api/data/backfill-han-char-jyutping", { method: "POST", body: "{}" }),

    backfillHanCharVariants: () => request("/api/data/backfill-han-char-variants", { method: "POST", body: "{}" }),

    backfillHanCharHanViet: () => request("/api/data/backfill-han-char-hanviet", { method: "POST", body: "{}" }),

    dedupHanCharacters: () => request("/api/han-characters/dedup", { method: "POST", body: "{}" }),

    backfillWordHanRelations: () => request("/api/data/backfill-word-han-relations", { method: "POST", body: "{}" }),

    getHanCharsForWord: (wordId) => request(`/api/words/${wordId}/han-characters`),

    getWordsForHanChar: (hanCharId) => request(`/api/han-characters/${hanCharId}/words`),

    searchCedict: ({ q, limit = 30 } = {}) => {
        const params = new URLSearchParams({ q: String(q ?? "").trim(), limit: String(limit) });
        return request(`/api/cedict/search?${params}`);
    },

    // Han Characters
    browseHanCharacters: async ({
        page = 1,
        pageSize = 30,
        search = "",
        filter = "all",
        sortKey = "createdAt",
        sortDir = "desc",
    } = {}) => {
        const params = new URLSearchParams({
            page: String(page),
            pageSize: String(pageSize),
            filter,
            sortKey,
            sortDir,
        });
        if (search.trim()) params.set("search", search.trim());
        return request(`/api/han-characters/browse?${params}`);
    },

    /** Fetch multiple pages in one request: pages=1,2,3,4,5 */
    browseHanCharactersChunk: async ({
        pageSize = 30,
        search = "",
        filter = "all",
        sortKey = "createdAt",
        sortDir = "desc",
        pages = [],
    } = {}) => {
        const params = new URLSearchParams({
            pages: pages.join(","),
            pageSize: String(pageSize),
            filter,
            sortKey,
            sortDir,
        });
        if (search.trim()) params.set("search", search.trim());
        return request(`/api/han-characters/browse?${params}`);
    },

    fetchHanCharacters: () => request("/api/han-characters"),

    createHanCharacter: (item) => request("/api/han-characters", { method: "POST", body: JSON.stringify(item) }),

    updateHanCharacter: (id, item) =>
        request(`/api/han-characters/${id}`, { method: "PUT", body: JSON.stringify(item) }),

    deleteHanCharacter: (id) => request(`/api/han-characters/${id}`, { method: "DELETE" }),

    patchHanCharacterFlags: (id, flags) =>
        request(`/api/han-characters/${id}/flags`, { method: "PATCH", body: JSON.stringify(flags) }),
};

export function signInWithGoogle() {
    log("Google sign-in");
    window.location.href = `${API}/auth/google`;
}
