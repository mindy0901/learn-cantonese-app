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
                    message = `Thiếu API route (${path})`;
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

// Ngôn ngữ học mặc định — persist qua F5 (localStorage) để không mất mode khi refresh.
const LANGUAGE_KEY = "learn-cantonese:language";
function readStoredLanguage() {
    try {
        const v = typeof localStorage !== "undefined" ? localStorage.getItem(LANGUAGE_KEY) : null;
        return v === "mandarin" || v === "cantonese" ? v : "cantonese";
    } catch {
        return "cantonese";
    }
}
let apiLanguage = readStoredLanguage();
export const getApiLanguage = () => apiLanguage;
export function setApiLanguage(lang) {
    if (lang === "mandarin" || lang === "cantonese") {
        apiLanguage = lang;
        try {
            if (typeof localStorage !== "undefined") localStorage.setItem(LANGUAGE_KEY, lang);
        } catch {
            // bỏ qua — không persist được cũng không sao
        }
    }
}

export const api = {
    getAuthStatus: () => request("/auth/status"),
    getMe: () => request("/auth/me"),
    login: (email, password) => request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
    register: (email, password) =>
        request("/auth/register", { method: "POST", body: JSON.stringify({ email, password }) }),
    logout: () => request("/auth/logout", { method: "POST" }),

    // Check-in — auto check-in ngày đăng nhập (2026-08-24)
    checkIn: (date) => request("/api/checkins", { method: "POST", body: JSON.stringify({ date: date ?? null }) }),
    fetchCheckins: () => request("/api/checkins"),

    fetchFromCloud: () => request("/api/data"),

    fetchFullData: () => api.fetchFromCloud(),

    // Tải toàn bộ 1 kho từ theo ngôn ngữ (on-demand).
    fetchLanguageData: (lang = apiLanguage) => request(`/api/${lang}-vocabularies`),

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
        return request(`/api/${apiLanguage}-vocabularies?${query}`);
    },

    fetchVocabulariesByIds: (ids) => {
        const list = [...new Set((ids ?? []).map(String).filter(Boolean))];
        if (list.length === 0) return Promise.resolve([]);
        return request(`/api/${apiLanguage}-vocabularies/by-ids?ids=${encodeURIComponent(list.join(","))}`);
    },

    // Tra cứu từ đã tồn tại theo hán tự (duplicate detection khi tạo từ mới).
    findVocabularyByHan: async (han) => {
        const h = String(han ?? "").trim();
        if (!h) return { items: [] };
        return request(`/api/${apiLanguage}-vocabularies/find-by-han?han=${encodeURIComponent(h)}`);
    },

    // Tra cứu trùng theo BANK NGÔN NGỮ tường minh (mandarin/cantonese) — không phụ thuộc
    // mode hiện tại. Dùng cho dup-check tách cột: Mandarin check bank mandarin,
    // Cantonese check bank cantonese. (2026-08-21)
    findVocabularyByHanLang: async (han, lang) => {
        const h = String(han ?? "").trim();
        const valid = lang === "mandarin" || lang === "cantonese" ? lang : "cantonese";
        if (!h) return { items: [] };
        return request(`/api/${valid}-vocabularies/find-by-han?han=${encodeURIComponent(h)}`);
    },

    // Gợi ý giản thể cho form HK (hero Cantonese) — HK → giản thể qua hk2s, chỉ trả
    // khi tìm thấy trong kho Mandarin.
    hanziSimplifiedSuggestion: async (hk) => {
        const h = String(hk ?? "").trim();
        if (!h) return { found: false, simplified: "" };
        return request(`/api/hanzi/simplified-suggestion?hk=${encodeURIComponent(h)}`);
    },

    // Toàn bộ map HK → gợi ý mandarin (precompute lúc load — tra map thay vì gọi từng từ).
    fetchHkSuggestionMap: () => request("/api/hanzi/hk-suggestion-map"),

    createVocabulary: (vocab) =>
        request(`/api/${apiLanguage}-vocabularies`, { method: "POST", body: JSON.stringify(vocab) }),
    ocrVocabulary: (imageBase64, engine = "local") =>
        request("/api/ocr-vocabulary", { method: "POST", body: JSON.stringify({ image: imageBase64, engine }) }),
    ocrDerive: (text) => request("/api/ocr-derive", { method: "POST", body: JSON.stringify({ text }) }),
    updateVocabulary: (id, vocab) =>
        request(`/api/${apiLanguage}-vocabularies/${id}`, { method: "PUT", body: JSON.stringify(vocab) }),
    deleteVocabulary: (id) => request(`/api/${apiLanguage}-vocabularies/${id}`, { method: "DELETE" }),

    createGrammar: (item) => request("/api/grammar", { method: "POST", body: JSON.stringify(item) }),
    updateGrammar: (id, item) => request(`/api/grammar/${id}`, { method: "PUT", body: JSON.stringify(item) }),
    deleteGrammar: (id) => request(`/api/grammar/${id}`, { method: "DELETE" }),

    backfillHanVariants: () => request("/api/data/backfill-han-variants", { method: "POST", body: "{}" }),

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

    // Sync stroke count cho bảng han_characters (cnchar + Unihan fallback)
    // mode: "fast" = chỉ fill những ký tự chưa có stroke_count; "full" = tính lại tất cả
    previewSyncHanCharStrokes: (mode = "fast") =>
        request("/api/data/sync-han-char-strokes/preview", { method: "POST", body: JSON.stringify({ mode }) }),
    syncHanCharStrokes: (mode = "fast") =>
        request("/api/data/sync-han-char-strokes", { method: "POST", body: JSON.stringify({ mode }) }),
    syncHanCharStrokesProgress: (jobId) => request(`/api/data/sync-han-char-strokes/progress/${jobId}`),

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

    fetchRadicals: () => request("/api/radicals"),

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

    // Vocabulary Sets (custom user groups)
    fetchVocabularySets: () => request("/api/vocabulary-sets"),
    createVocabularySet: (set) => request("/api/vocabulary-sets", { method: "POST", body: JSON.stringify(set) }),
    updateVocabularySet: (id, set) =>
        request(`/api/vocabulary-sets/${id}`, { method: "PUT", body: JSON.stringify(set) }),
    deleteVocabularySet: (id) => request(`/api/vocabulary-sets/${id}`, { method: "DELETE" }),
    addVocabularyToSet: (setId, vocabularyId) =>
        request(`/api/vocabulary-sets/${setId}/vocabularies`, {
            method: "POST",
            body: JSON.stringify({ vocabularyId }),
        }),
    removeVocabularyFromSet: (setId, vocabularyId) =>
        request(`/api/vocabulary-sets/${setId}/vocabularies/${vocabularyId}`, { method: "DELETE" }),

    /** Convert Chinese text to Jyutping */
    translate: (text, source, target) =>
        request("/api/translate", {
            method: "POST",
            body: JSON.stringify({ text, source, target }),
        }),
    /** Google Translate web (gtx) — bypass deep_translator */
    translateGoogle: (text, source, target) =>
        request("/api/translate-google", {
            method: "POST",
            body: JSON.stringify({ text, source, target }),
        }),
    /**
     * Lấy nghĩa (vi + zh) + ví dụ từ Hanzii.
     * - Có `pinyin` → trả { word, groups } cho 1 phiên âm đó.
     * - KHÔNG có `pinyin` → trả { word, tones: [{ pinyin, groups }] } cho TOÀN BỘ thanh điệu.
     */
    hanziiMeanings: (query, pinyin, hl = "vi") =>
        request("/api/hanzii/meanings", {
            method: "POST",
            body: JSON.stringify({ query, ...(pinyin ? { pinyin } : {}), hl }),
        }),
    toJyutping: (text) =>
        request("/api/jyutping", {
            method: "POST",
            body: JSON.stringify({ text }),
        }),

    /** Convert Chinese text to Traditional (OpenCC s2t) */
    toTraditional: (text) =>
        request("/api/s2t", {
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
