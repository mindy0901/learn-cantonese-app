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

        // 304 Not Modified — data không đổi (ETag/If-None-Match trên /api/bootstrap). Trả null
        // để caller biết dùng cache hiện tại, KHÔNG có body. (2026-09-02)
        if (res.status === 304) return null;

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

// Nguồn dịch gần nhất (google | libretranslate) — api.translate ghi lại mỗi lần dịch. (2026-08-25)
// Lý do Google lỗi (rate_limit | blocked | error) + mã HTTP thực tế khi dùng fallback
// LibreTranslate. (2026-08-26)
let lastTranslateSource = null;
let lastTranslateReason = null;
let lastGoogleCode = null;

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

    // Favorite vocabularies (❤️ yêu thích) — mọi user đã đăng nhập. (đổi tên từ important 2026-09-20)
    fetchFavoriteVocabularies: () => request("/api/favorite-vocabularies"),
    setVocabularyFavorite: (lang, id, favorite) =>
        request(`/api/favorite-vocabularies/${lang}/${id}`, { method: "PUT", body: JSON.stringify({ favorite }) }),

    // Vocabulary mastery (progress 0-100%) — mọi user đã đăng nhập (2026-09-02)
    fetchVocabularyMastery: () => request("/api/vocabulary-mastery"),
    setVocabularyMastery: (lang, id, progress) =>
        request(`/api/vocabulary-mastery/${lang}/${id}`, { method: "PUT", body: JSON.stringify({ progress }) }),

    // Disliked vocabularies (🚫 không muốn học) — mọi user đã đăng nhập. (đổi tên từ ignored 2026-09-20)
    fetchDislikedVocabularies: () => request("/api/disliked-vocabularies"),
    setVocabularyDisliked: (lang, id, disliked) =>
        request(`/api/disliked-vocabularies/${lang}/${id}`, { method: "PUT", body: JSON.stringify({ disliked }) }),

    fetchFromCloud: () => request("/api/data"),

    fetchFullData: () => api.fetchFromCloud(),

    // Bootstrap — 1 API trả HẾT data khi đăng nhập/load app (2026-09-02):
    // { mandarinVocabularies, cantoneseVocabularies, grammars,
    //   favoriteVocabularyIds, dislikedVocabularyIds, vocabularyMastery, vocabularySets }.
    // Thay cho 5 GET riêng (fetchFullData + fetchHkSuggestionMap + favorite + mastery + sets).
    // `etag`: signature data hiện tại (client) → gửi If-None-Match; server trả 304 (null) khi
    // không đổi → KHÔNG tải 45MB. Không truyền → luôn nhận 200 full. (2026-09-02)
    fetchBootstrap: (etag) =>
        request("/api/bootstrap", {
            headers: etag ? { "If-None-Match": etag } : {},
        }),

    // Tải toàn bộ 1 kho từ theo ngôn ngữ (on-demand).
    fetchLanguageData: (lang = apiLanguage) => request(`/api/${lang}-vocabularies`),

    browseVocabularies: async ({
        page = 1,
        pageSize = PAGE_SIZE,
        sortKey = "createdAt",
        sortDir = "desc",
        filter = "all",
        q = "",
        favoriteFirst = false,
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
            favoriteFirst: favoriteFirst ? "1" : "0",
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

    // By-ids theo NGÔN NGỮ tường minh (popup trùng khi thêm từ — không phụ thuộc mode hiện tại). (2026-09-09)
    fetchVocabulariesByIdsLang: (lang, ids) => {
        const valid = lang === "mandarin" || lang === "cantonese" ? lang : "cantonese";
        const list = [...new Set((ids ?? []).map(String).filter(Boolean))];
        if (list.length === 0) return Promise.resolve([]);
        return request(`/api/${valid}-vocabularies/by-ids?ids=${encodeURIComponent(list.join(","))}`);
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

    // Gợi ý giản thể cho form HK (on-demand khi click vocab, 2026-09-02) — HK → giản thể
    // qua hk2s, chỉ trả khi tìm thấy trong kho Mandarin.
    hanziSimplifiedSuggestion: async (hk) => {
        const h = String(hk ?? "").trim();
        if (!h) return { found: false, simplified: "" };
        return request(`/api/hanzi/simplified-suggestion?hk=${encodeURIComponent(h)}`);
    },

    createVocabulary: (vocab) =>
        request(`/api/${apiLanguage}-vocabularies`, { method: "POST", body: JSON.stringify(vocab) }),
    ocrVocabulary: (imageBase64, engine = "local", lang = "cantonese") =>
        request("/api/ocr-vocabulary", {
            method: "POST",
            body: JSON.stringify({ image: imageBase64, engine, lang }),
        }),
    ocrDerive: (text, lang = "cantonese") =>
        request("/api/ocr-derive", { method: "POST", body: JSON.stringify({ text, lang }) }),
    updateVocabulary: (id, vocab) =>
        request(`/api/${apiLanguage}-vocabularies/${id}`, { method: "PUT", body: JSON.stringify(vocab) }),
    deleteVocabulary: (id) => request(`/api/${apiLanguage}-vocabularies/${id}`, { method: "DELETE" }),

    createGrammar: (item) => request("/api/grammar", { method: "POST", body: JSON.stringify(item) }),
    updateGrammar: (id, item) => request(`/api/grammar/${id}`, { method: "PUT", body: JSON.stringify(item) }),
    deleteGrammar: (id) => request(`/api/grammar/${id}`, { method: "DELETE" }),

    backfillHanVariants: () => request("/api/data/backfill-han-variants", { method: "POST", body: "{}" }),

    backfillHanCharPinyin: () => request("/api/data/backfill-han-char-pinyin", { method: "POST", body: "{}" }),

    backfillHanCharJyutping: () => request("/api/data/backfill-han-char-jyutping", { method: "POST", body: "{}" }),

    fetchRadicals: () => request("/api/radicals"),

    // Flashcard Decks
    fetchFlashcardDecks: () => request("/api/flashcard-decks"),
    fetchFlashcardDeck: (id) => request(`/api/flashcard-decks/${id}`),
    createFlashcardDeck: (deck) => request("/api/flashcard-decks", { method: "POST", body: JSON.stringify(deck) }),
    updateFlashcardDeck: (id, deck) =>
        request(`/api/flashcard-decks/${id}`, { method: "PUT", body: JSON.stringify(deck) }),
    deleteFlashcardDeck: (id) => request(`/api/flashcard-decks/${id}`, { method: "DELETE" }),
    addVocabularyToDeck: (deckId, vocabularyId, lang = apiLanguage) =>
        request(`/api/flashcard-decks/${deckId}/vocabularies`, {
            method: "POST",
            body: JSON.stringify({ vocabularyId, lang }),
        }),
    removeVocabularyFromDeck: (deckId, vocabularyId, lang = apiLanguage) =>
        request(`/api/flashcard-decks/${deckId}/vocabularies/${vocabularyId}?lang=${encodeURIComponent(lang)}`, {
            method: "DELETE",
        }),

    // Tags (dùng chung toàn app — CHỈ admin tạo/đổi tên/xóa + gán cho từ) — 2026-09-27
    fetchTags: () => request("/api/tags"),
    createTag: (tag) => request("/api/tags", { method: "POST", body: JSON.stringify(tag) }),
    updateTag: (id, tag) => request(`/api/tags/${id}`, { method: "PATCH", body: JSON.stringify(tag) }),
    deleteTag: (id) => request(`/api/tags/${id}`, { method: "DELETE" }),
    fetchVocabularyTags: (lang, id) =>
        request(`/api/vocabulary-tags?lang=${encodeURIComponent(lang)}&id=${encodeURIComponent(id)}`),
    setVocabularyTag: ({ lang, vocabularyId, tagId, tagged }) =>
        request("/api/vocabulary-tags", { method: "PUT", body: JSON.stringify({ lang, vocabularyId, tagId, tagged }) }),

    // Vocabulary Sets (custom user groups)
    fetchVocabularySets: () => request("/api/vocabulary-sets"),
    createVocabularySet: (set) => request("/api/vocabulary-sets", { method: "POST", body: JSON.stringify(set) }),
    updateVocabularySet: (id, set) =>
        request(`/api/vocabulary-sets/${id}`, { method: "PUT", body: JSON.stringify(set) }),
    deleteVocabularySet: (id) => request(`/api/vocabulary-sets/${id}`, { method: "DELETE" }),
    // ⚠️ 2026-09-02: bộ từ tách theo ngôn ngữ (mandarin/cantonese join table) → phải truyền lang.
    addVocabularyToSet: (setId, vocabularyId, lang = apiLanguage) =>
        request(`/api/vocabulary-sets/${setId}/vocabularies`, {
            method: "POST",
            body: JSON.stringify({ vocabularyId, lang }),
        }),
    removeVocabularyFromSet: (setId, vocabularyId, lang = apiLanguage) =>
        request(`/api/vocabulary-sets/${setId}/vocabularies/${vocabularyId}?lang=${encodeURIComponent(lang)}`, {
            method: "DELETE",
        }),

    /** Convert Chinese text to Jyutping */
    translate: async (text, source, target) => {
        const res = await request("/api/translate", {
            method: "POST",
            body: JSON.stringify({ text, source, target }),
        });
        // Ghi nguồn dịch (google | libretranslate) + lý do + mã HTTP Google — hiển thị ở
        // tiến độ Full Sync. (2026-08-25/26)
        lastTranslateSource = res?.source ?? null;
        lastTranslateReason = res?.reason ?? null;
        lastGoogleCode = res?.googleCode ?? null;
        return res;
    },
    /** Nguồn dịch gần nhất (google | libretranslate) — đọc từ api.lastTranslateSource. */
    get lastTranslateSource() {
        return lastTranslateSource;
    },
    /** Lý do Google lỗi (rate_limit | blocked | error) khi fallback — đọc từ api.lastTranslateReason. */
    get lastTranslateReason() {
        return lastTranslateReason;
    },
    /** Mã HTTP Google khi bị chặn (403/429...) — đọc từ api.lastGoogleCode. */
    get lastGoogleCode() {
        return lastGoogleCode;
    },
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

    /** TTS (gTTS server-side) — trả { url, cached }. lang: "yue" (Quảng, mặc định) | "zh-CN" (Mandarin giản thể). (2026-08-25) */
    tts: (text, lang) =>
        request("/api/tts", {
            method: "POST",
            body: JSON.stringify(lang ? { text, lang } : { text }),
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
