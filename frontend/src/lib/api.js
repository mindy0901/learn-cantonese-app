import { log, logApiError } from "./actionLog.js";
import { PAGE_SIZE } from "./constants.js";

const API = import.meta.env.VITE_API_URL ?? "";

async function request(path, options = {}) {
    const method = options.method ?? "GET";

    try {
        const res = await fetch(`${API}${path}`, {
            credentials: "include",
            ...options,
            headers: {
                ...(options.body != null ? { "Content-Type": "application/json" } : {}),
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
    login: (email, password) => request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
    logout: () => request("/auth/logout", { method: "POST" }),

    fetchFromCloud: () => request("/api/data"),

    fetchFullData: () => api.fetchFromCloud(),

    browseVocabularies: async ({
        page = 1,
        pageSize = PAGE_SIZE,
        sortKey = "createdAt",
        sortDir = "desc",
        filter = "all",
        q = "",
        importantFirst = false,
        studyDue = false,
        maxProgress = null,
        hskLevel = null,
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
        if (hskLevel) params.set("hskLevel", hskLevel);
        const query = params.toString();
        try {
            return await request(`/api/vocabulary/browse?${query}`);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (!/not found|404/i.test(message)) throw err;
            return request(`/api/vocabulary?${query}`);
        }
    },

    fetchVocabulariesByIds: (ids) => {
        const list = [...new Set((ids ?? []).map(String).filter(Boolean))];
        if (list.length === 0) return Promise.resolve([]);
        return request(`/api/vocabulary/by-ids?ids=${encodeURIComponent(list.join(","))}`);
    },

    createVocabulary: (vocab) => request("/api/vocabulary", { method: "POST", body: JSON.stringify(vocab) }),
    updateVocabulary: (id, vocab) => request(`/api/vocabulary/${id}`, { method: "PUT", body: JSON.stringify(vocab) }),
    patchVocabularyFlags: async (id, flags, vocab) => {
        const payload = { ...flags };
        try {
            return await request(`/api/vocabulary/${id}/flags`, {
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
            if ((!patchUnavailable && !patchRejected) || !vocab) throw err;
            return request(`/api/vocabulary/${id}`, {
                method: "PUT",
                body: JSON.stringify({ ...vocab, ...payload }),
            });
        }
    },
    deleteVocabulary: (id) => request(`/api/vocabulary/${id}`, { method: "DELETE" }),

    createGrammar: (item) => request("/api/grammar", { method: "POST", body: JSON.stringify(item) }),
    updateGrammar: (id, item) => request(`/api/grammar/${id}`, { method: "PUT", body: JSON.stringify(item) }),
    deleteGrammar: (id) => request(`/api/grammar/${id}`, { method: "DELETE" }),

    createSentencePattern: (item) => request("/api/sentence-patterns", { method: "POST", body: JSON.stringify(item) }),
    updateSentencePattern: (id, item) =>
        request(`/api/sentence-patterns/${id}`, { method: "PUT", body: JSON.stringify(item) }),
    deleteSentencePattern: (id) => request(`/api/sentence-patterns/${id}`, { method: "DELETE" }),
    fetchSentencePatternsForWord: (wordId) => request(`/api/sentence-patterns/by-word/${wordId}`),

    backfillHanVariants: () => request("/api/data/backfill-han-variants", { method: "POST", body: "{}" }),

    backfillPinyin: () => request("/api/data/backfill-pinyin", { method: "POST", body: "{}" }),

    backfillJyutping: () => request("/api/data/backfill-jyutping", { method: "POST", body: "{}" }),

    backfillHanCharPinyin: () => request("/api/data/backfill-han-char-pinyin", { method: "POST", body: "{}" }),

    backfillHanCharJyutping: () => request("/api/data/backfill-han-char-jyutping", { method: "POST", body: "{}" }),

    backfillHanCharVariants: () => request("/api/data/backfill-han-char-variants", { method: "POST", body: "{}" }),

    // Sync tất cả hán tự từ vocabularies vào bảng han_characters (find-or-create + merge readings + link)
    // mode: "fast" = chỉ xử lý vocab chưa có hanCharacters; "full" = xóa hết rồi sync lại từ đầu
    previewSyncHanCharacters: (mode = "fast") =>
        request("/api/data/sync-han-characters/preview", { method: "POST", body: JSON.stringify({ mode }) }),
    syncHanCharacters: (mode = "fast") =>
        request("/api/data/sync-han-characters", { method: "POST", body: JSON.stringify({ mode }) }),
    syncHanCharactersProgress: (jobId) => request(`/api/data/sync-han-characters/progress/${jobId}`),

    getHanCharsForVocabulary: (wordId) => request(`/api/vocabulary/${wordId}/han-characters`),

    getVocabulariesForHanChar: (hanCharId) => request(`/api/han-characters/${hanCharId}/vocabulary`),

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

    // Flashcard Decks
    fetchFlashcardDecks: () => request("/api/flashcard-decks"),
    fetchFlashcardDeck: (id) => request(`/api/flashcard-decks/${id}`),
    createFlashcardDeck: (deck) => request("/api/flashcard-decks", { method: "POST", body: JSON.stringify(deck) }),
    updateFlashcardDeck: (id, deck) =>
        request(`/api/flashcard-decks/${id}`, { method: "PUT", body: JSON.stringify(deck) }),
    deleteFlashcardDeck: (id) => request(`/api/flashcard-decks/${id}`, { method: "DELETE" }),
    fetchDeckVocabularies: (deckId) => request(`/api/flashcard-decks/${deckId}/vocabularies`),
    addVocabularyToDeck: (deckId, vocabularyId) =>
        request(`/api/flashcard-decks/${deckId}/vocabularies`, {
            method: "POST",
            body: JSON.stringify({ vocabularyId }),
        }),
    removeVocabularyFromDeck: (deckId, vocabularyId) =>
        request(`/api/flashcard-decks/${deckId}/vocabularies/${vocabularyId}`, { method: "DELETE" }),

    /** Convert Chinese text to Jyutping */
    toJyutping: (text) =>
        request("/api/jyutping", {
            method: "POST",
            body: JSON.stringify({ text }),
        }),

    /** Convert Chinese text to Pinyin */
    toPinyin: (text) =>
        request("/api/pinyin", {
            method: "POST",
            body: JSON.stringify({ text }),
        }),
};

export function signInWithGoogle() {
    log("Google sign-in");
    window.location.href = `${API}/auth/google`;
}
