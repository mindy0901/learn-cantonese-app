import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import {
    deleteGrammarFromList,
    deleteVocabularyFromList,
    indexCloudPayload,
    indexGrammarItem,
    indexVocabulary,
    indexVocabularies,
    stripSearchIndex,
    toggleGrammarField,
    toggleVocabularyField,
    updateGrammarInList,
    updateVocabularyInList,
    vocabLangToLegacy,
    vocabNewToLegacy,
    vocabularyLangPayload,
} from "../lib/dataTransforms.js";
import { invalidateVocabularyBrowseCache, patchVocabularyInBrowseCache } from "../lib/wordBrowseCache.js";
import { api, getApiLanguage, setApiLanguage } from "../lib/api.js";
import { log, logWarn, logError, logFetchDone, logMutStart, logMutDone } from "../lib/actionLog.js";
import { normalizeVocabularyFields, vocabularyContentEqual } from "../lib/wordNormalize.js";
import { useAuthStore } from "./authStore.js";
import { loadDataCache, saveDataCache, invalidateDataCache, getCacheGeneration } from "../lib/dataCache.js";

const LEGACY_DATA_KEY = "cantonese-app-data";
const LANGUAGE_KEY = "learn-cantonese:language";

/** Đọc ngôn ngữ học đã lưu (persist qua F5) — trùng key với api.js. */
function getInitialLanguage() {
    try {
        const v = typeof localStorage !== "undefined" ? localStorage.getItem(LANGUAGE_KEY) : null;
        return v === "mandarin" || v === "cantonese" ? v : "cantonese";
    } catch {
        return "cantonese";
    }
}

/** Dedupe concurrent cloud hydrates (e.g. React Strict Mode). */
let hydrateFromCloudPromise = null;

/** Dedupe concurrent vocabulary-sets fetches (VocabularyBankPage + VocabularyBankListPanel). */
let vocabularySetsFetchPromise = null;
let tagsFetchPromise = null;

/**
 * Tags sắp xếp theo SỐ TỪ ĐÃ GẮN (giảm dần), cùng số lượng thì theo tên (locale vi).
 * ⚠️ 2026-09-27: đổi từ "theo tên" → "theo số lượng" (user yêu cầu) — và sort lại ở
 * `setVocabularyTag` nên thứ tự cập nhật NGAY khi gắn/gỡ tag (không chờ refetch).
 */
function sortTags(list) {
    return [...list].sort(
        (a, b) =>
            (b.vocabularyCount ?? 0) - (a.vocabularyCount ?? 0) ||
            String(a.name ?? "").localeCompare(String(b.name ?? ""), "vi"),
    );
}

// ── Helpers hydrate cache-first (2026-09-02) ──
// Cache IndexedDB giờ ĐƯỢC ĐỌC LẠI khi F5 → render ngay không phải tải 45MB; nền refresh cập nhật.
// Bước "Lưu bộ nhớ đệm" (saveDataCache) trước đây ghi 45MB mỗi F5 nhưng không đọc lại → vô ích.

/** Cho React 1 frame để paint (bước "Xử lý dữ liệu…" hiển thị thật trước khi index đồng bộ). */
function yieldToPaint() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Chữ ký nhanh của snapshot bootstrap — so cache vs server để biết có cần re-index lại không.
 * ⚠️ 2026-09-02: format KHỚP `computeDataSignature` backend (/api/bootstrap-version):
 * `[mLen, mMax, cLen, cMax, gLen]` — trước đây order khác (m,c,g,mMax,cMax) → không bao giờ
 * khớp → background luôn tải full 45MB. */
function snapshotSignature(payload) {
    const maxUpdated = (arr) => (arr ?? []).reduce((a, v) => Math.max(a, vocabTimeMs(v)), 0);
    // Số vocab CÒN related_words (JSONB Hanzii) — khớp backend computeDataSignature (2026-09-08):
    // xóa field này không đổi count/max updatedAt nên phải đưa vào signature để ETag hết khớp cache cũ.
    const relatedCount = (arr) => (arr ?? []).reduce((a, v) => a + (v?.relatedWords ? 1 : 0), 0);
    return [
        payload?.mandarinVocabularies?.length ?? 0,
        maxUpdated(payload?.mandarinVocabularies),
        relatedCount(payload?.mandarinVocabularies),
        payload?.cantoneseVocabularies?.length ?? 0,
        maxUpdated(payload?.cantoneseVocabularies),
        relatedCount(payload?.cantoneseVocabularies),
        payload?.grammars?.length ?? 0,
    ].join(":");
}

let lastAppliedSignature = null; // chữ ký ĐẦY ĐỦ (nội dung + user) của payload đã áp — gửi làm If-None-Match
let lastAppliedContentSignature = null; // chỉ NỘI DUNG — quyết định có cần re-index bank không

/** Digest data theo user (số lượng favorite/disliked/mastery/sets) — format KHỚP backend
 *  `computeUserDataSignature` (`f.d.m.s`). ⚠️ 2026-09-20: đưa vào If-None-Match để đánh dấu ❤️/🚫
 *  mới làm signature đổi ⇒ không bị 304 giữ dữ liệu user cũ. */
function userDataDigest(payload) {
    const fav =
        (payload?.favoriteVocabularyIds?.mandarin?.length ?? 0) +
        (payload?.favoriteVocabularyIds?.cantonese?.length ?? 0);
    const disliked =
        (payload?.dislikedVocabularyIds?.mandarin?.length ?? 0) +
        (payload?.dislikedVocabularyIds?.cantonese?.length ?? 0);
    const mastery =
        Object.keys(payload?.vocabularyMastery?.mandarin ?? {}).length +
        Object.keys(payload?.vocabularyMastery?.cantonese ?? {}).length;
    const sets = payload?.vocabularySets?.length ?? 0;
    return `${fav}.${disliked}.${mastery}.${sets}`;
}

/** Chữ ký gửi lên server (If-None-Match) = nội dung + digest user. */
function requestSignature(payload) {
    return `${snapshotSignature(payload)}:${userDataDigest(payload)}`;
}

/** Cập nhật CHỈ phần data theo user (khi nội dung 2 bank không đổi — không cần re-index). */
function applyUserDataToStore(set, payload) {
    const mastery = payload.vocabularyMastery ?? { mandarin: {}, cantonese: {} };
    set({
        favoriteVocabularyIds: [
            ...(payload.favoriteVocabularyIds?.mandarin ?? []),
            ...(payload.favoriteVocabularyIds?.cantonese ?? []),
        ],
        dislikedVocabularyIds: [
            ...(payload.dislikedVocabularyIds?.mandarin ?? []),
            ...(payload.dislikedVocabularyIds?.cantonese ?? []),
        ],
        vocabularyMastery: { mandarin: mastery?.mandarin ?? {}, cantonese: mastery?.cantonese ?? {} },
        vocabularySets: payload.vocabularySets ?? [],
    });
}

/** Index 1 snapshot bootstrap → cập nhật store (bước "Xử lý dữ liệu…"). */
function applySnapshotToStore(set, get, payload) {
    const grammarIndexed = indexCloudPayload({ vocabularies: [], grammars: payload.grammars ?? [] });
    const mandarinBank = indexVocabularies(
        (payload.mandarinVocabularies ?? []).map((v) => vocabLangToLegacy(v, "mandarin")),
    );
    const cantoneseBank = indexVocabularies(
        (payload.cantoneseVocabularies ?? []).map((v) => vocabLangToLegacy(v, "cantonese")),
    );
    const active = get().language === "mandarin" ? mandarinBank : cantoneseBank;
    // ⚠️ 2026-09-20: cặp đánh dấu theo user (thay "important" cũ): ❤️ favorite + 🚫 disliked.
    const favoriteVocabularyIds = [
        ...(payload.favoriteVocabularyIds?.mandarin ?? []),
        ...(payload.favoriteVocabularyIds?.cantonese ?? []),
    ];
    const dislikedVocabularyIds = [
        ...(payload.dislikedVocabularyIds?.mandarin ?? []),
        ...(payload.dislikedVocabularyIds?.cantonese ?? []),
    ];
    const mastery = payload.vocabularyMastery ?? { mandarin: {}, cantonese: {} };
    lastAppliedContentSignature = snapshotSignature(payload);
    lastAppliedSignature = requestSignature(payload);
    set({
        mandarinVocabularies: mandarinBank,
        cantoneseVocabularies: cantoneseBank,
        vocabularies: active,
        vocabularyTotal: active.length,
        masteredVocabularyCount: 0, // user_vocabularies đã bỏ
        grammarBank: grammarIndexed.grammarBank,
        favoriteVocabularyIds,
        dislikedVocabularyIds,
        vocabularyMastery: { mandarin: mastery?.mandarin ?? {}, cantonese: mastery?.cantonese ?? {} },
        vocabularySets: payload.vocabularySets ?? [],
    });
}

/** Dedupe concurrent background refresh. */
let backgroundRefreshPromise = null;

/** Fetch bootstrap mới ở nền (không loading overlay) — sau khi render từ cache. */
function refreshBootstrapInBackground(set, get) {
    if (backgroundRefreshPromise) return backgroundRefreshPromise;
    backgroundRefreshPromise = (async () => {
        try {
            // ⚠️ 2026-09-20: capture generation TRƯỚC khi fetch — nếu có mutation xen giữa
            // (invalidateDataCache tăng generation) thì KHÔNG ghi lại payload cũ vào cache
            // (tránh F5 sau hiển thị thiếu đánh dấu ❤️/🚫).
            const genAtStart = getCacheGeneration();
            // ⚠️ 2026-09-02 (sửa): KHÔNG dùng endpoint version riêng — /api/bootstrap tự trả 304
            // khi data không đổi (gửi If-None-Match = signature hiện tại) → không tải 45MB mỗi F5.
            // `null` = 304 (không đổi) → giữ nguyên data đang có.
            const fresh = await api.fetchBootstrap(lastAppliedSignature || undefined);
            if (fresh == null) return;
            // Nội dung 2 bank không đổi (chỉ data theo user đổi — VD vừa đánh dấu ❤️/🚫 ở tab khác)
            // → CHỈ cập nhật phần user, KHÔNG re-index toàn bộ bank.
            const contentChanged = snapshotSignature(fresh) !== lastAppliedContentSignature;
            const genOk = getCacheGeneration() === genAtStart;
            set({ dataLoadingStep: "saving-cache" });
            if (genOk) await saveDataCache(fresh);
            if (!contentChanged) {
                applyUserDataToStore(set, fresh);
                lastAppliedSignature = requestSignature(fresh);
                set({ dataLoadingStep: "done" });
                return;
            }
            await yieldToPaint();
            applySnapshotToStore(set, get, fresh);
        } catch {
            // bỏ qua — F5 lần sau sẽ thử lại
        } finally {
            backgroundRefreshPromise = null;
        }
    })();
    return backgroundRefreshPromise;
}

function assertAdmin() {
    if (!useAuthStore.getState().user?.isAdmin) {
        throw new Error("Yêu cầu quyền admin");
    }
}

function assertSignedIn() {
    if (!useAuthStore.getState().user) {
        throw new Error("Yêu cầu đăng nhập");
    }
}

function resolveVocabularyTarget(idOrVocab) {
    if (idOrVocab && typeof idOrVocab === "object") {
        return { id: idOrVocab.id, snapshot: idOrVocab };
    }
    return { id: idOrVocab, snapshot: undefined };
}

function vocabTimeMs(vocab) {
    const value = vocab?.updatedAt ?? vocab?.createdAt;
    const ms = Date.parse(String(value ?? ""));
    return Number.isFinite(ms) ? ms : 0;
}

function toggleVocabularyFlagInStore(vocabularies, id, field, snapshot) {
    let existing = vocabularies.find((w) => w.id === id);
    if (!existing && snapshot) {
        existing = indexVocabulary(snapshot);
    }
    if (!existing) return null;

    const nextVocabularies = vocabularies.some((w) => w.id === id)
        ? toggleVocabularyField(vocabularies, id, field)
        : [...vocabularies, indexVocabulary({ ...existing, [field]: !existing[field] }, vocabularies.length)];

    return {
        vocabularies: nextVocabularies,
        vocab: nextVocabularies.find((w) => w.id === id),
    };
}

async function syncMutation(action, { requireAdmin = true } = {}) {
    if (requireAdmin) assertAdmin();
    else assertSignedIn();
    try {
        const result = await action();
        // Invalidate cache so next cold start fetches fresh data
        invalidateDataCache();
        return result;
    } catch (err) {
        logWarn("Cloud sync failed", err instanceof Error ? err.message : err);
        throw err;
    }
}

async function migrateLegacyLocalIfNeeded() {
    const user = useAuthStore.getState().user;
    if (!user?.isAdmin) return;

    const raw = localStorage.getItem(LEGACY_DATA_KEY);
    if (!raw) return;

    try {
        const parsed = JSON.parse(raw);
        const hasLocal = (parsed.words?.length ?? 0) > 0 || (parsed.grammarBank?.length ?? 0) > 0;

        if (hasLocal) {
            log("Migrate legacy data");
            const remote = await api.fetchFromCloud();
            const cloudEmpty = (remote.vocabularies?.length ?? 0) === 0 && (remote.grammars?.length ?? 0) === 0;

            if (cloudEmpty) {
                await api.uploadToCloud({
                    types: ["vocabularies", "grammar"],
                    words: parsed.words ?? [],
                    grammarBank: parsed.grammarBank ?? [],
                });
            }
        }

        localStorage.removeItem(LEGACY_DATA_KEY);
    } catch (err) {
        logWarn("Legacy migration failed", err instanceof Error ? err.message : err);
    }
}

export const useAppStore = create((set, get) => ({
    vocabularies: [],
    vocabularyTotal: 0,
    masteredVocabularyCount: 0,
    vocabulariesRevision: 0,
    grammarBank: [],
    vocabularySets: [],
    dataLoading: false,
    dataError: null, // { message: string, status?: number } | null
    dataLoadingStep: "", // "" | "checking-user" | "loading-data" | "saving-cache" | "indexing" | "done"
    hydrated: false,
    // Ngôn ngữ học — đọc từ localStorage (persist qua F5). `setApiLanguage` cũng lưu localStorage
    // nên key này đồng bộ với api.js; đọc lại để giữ mode khi refresh. (2026-08-21)
    language: getInitialLanguage(),
    mandarinVocabularies: [], // bank từ đã index theo ngôn ngữ
    cantoneseVocabularies: [],
    // ids từ vựng user đánh dấu ❤️ "yêu thích" (unique toàn cục — uuid) + 🚫 "không muốn học"
    // (bị loại khỏi flashcard random + hiển thị ở trang /profile). (rename 2026-09-20)
    favoriteVocabularyIds: [],
    dislikedVocabularyIds: [],
    // ⚠️ 2026-09-02: tiến độ mastered (0-100%) theo từ — { mandarin: {id: progress}, cantonese: {...} }
    vocabularyMastery: { mandarin: {}, cantonese: {} },
    // Tags dùng chung (catalogue toàn app, admin quản lý) — [{ id, name, vocabularyCount }]
    tags: [],

    clearData: () => {
        log("Clear app data");
        invalidateDataCache();
        set({
            vocabularies: [],
            vocabularyTotal: 0,
            masteredVocabularyCount: 0,
            vocabulariesRevision: 0,
            grammarBank: [],
            vocabularySets: [],
            tags: [],
            mandarinVocabularies: [],
            cantoneseVocabularies: [],
            favoriteVocabularyIds: [],
            dislikedVocabularyIds: [],
            vocabularyMastery: { mandarin: {}, cantonese: {} },
            dataLoading: false,
            dataError: null,
            dataLoadingStep: "",
            hydrated: false,
        });
    },

    hydrateFromCloud: async () => {
        if (hydrateFromCloudPromise) return hydrateFromCloudPromise;

        hydrateFromCloudPromise = (async () => {
            set({ dataLoading: true, dataError: null, dataLoadingStep: "checking-user" });

            try {
                if (useAuthStore.getState().user?.isAdmin) {
                    await migrateLegacyLocalIfNeeded();
                }

                // ⚠️ 2026-09-02: F5 render TỪ CACHE IndexedDB lần trước (bước "Lưu bộ nhớ đệm"
                // giờ CÓ Ý NGHĨA — được đọc lại) → không chờ tải 45MB. Sau đó refresh nền để
                // cập nhật nếu data trên server đổi. Gợi ý giản thể (mandarin) vẫn tra ON-DEMAND
                // theo từng từ qua useHkSuggestion (không còn map precompute).
                const cached = await loadDataCache();
                const hasCachedData = cached
                    ? Boolean(cached.mandarinVocabularies?.length || cached.cantoneseVocabularies?.length)
                    : false;
                if (hasCachedData) {
                    set({ dataLoadingStep: "indexing" });
                    await yieldToPaint(); // để React vẽ bước "Xử lý dữ liệu…" (spinner) trước khi index
                    applySnapshotToStore(set, get, cached);
                    set({ dataLoading: false, dataError: null, dataLoadingStep: "done", hydrated: true });
                    // Refresh nền (không loading overlay): fetch mới, cập nhật nếu có thay đổi.
                    refreshBootstrapInBackground(set, get).catch(() => {});
                    return;
                }

                // Cold start (chưa có cache): fetch full + lưu cache (bước "Lưu bộ nhớ đệm" thật).
                set({ dataLoadingStep: "loading-data" });
                const boot = await api.fetchBootstrap();
                const remote = boot;
                logFetchDone({
                    mandarin: remote.mandarinVocabularies?.length ?? 0,
                    cantonese: remote.cantoneseVocabularies?.length ?? 0,
                    grammar: remote.grammars?.length ?? 0,
                });
                set({ dataLoadingStep: "saving-cache" });
                await saveDataCache(remote);
                set({ dataLoadingStep: "indexing" });
                await yieldToPaint(); // để React vẽ "Xử lý dữ liệu…" trước khi index đồng bộ
                applySnapshotToStore(set, get, remote);
                set({
                    dataLoading: false,
                    dataError: null,
                    dataLoadingStep: "done",
                    hydrated: true,
                });
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                const status = err instanceof Error && "status" in err ? err.status : undefined;
                logError("Fetch all Data failed", message);
                set({
                    dataLoading: false,
                    dataError: { message, status },
                    dataLoadingStep: "",
                    hydrated: false,
                });
                throw err;
            } finally {
                hydrateFromCloudPromise = null;
            }
        })();

        return hydrateFromCloudPromise;
    },

    // ── Chọn ngôn ngữ học (mandarin / cantonese) — LUÔN tải lại database (2026-08-18) ──
    setLanguage: (lang) => {
        const valid = lang === "mandarin" || lang === "cantonese" ? lang : "cantonese";
        setApiLanguage(valid);
        set({ language: valid });
        // Đổi mode → tải lại dữ liệu từ server (không dùng bank cache).
        get().loadLanguage(valid);
    },

    loadLanguage: async (lang) => {
        const valid = lang === "mandarin" || lang === "cantonese" ? lang : "cantonese";
        set({ dataLoading: true, dataError: null, dataLoadingStep: "loading-data" });
        try {
            // ⚠️ 2026-08-21: LUÔN tải CẢ 2 bank (mandarin + cantonese) — vì detail cantonese mode
            // cần cột Mandarin gợi ý (mandarinVariants) từ store mandarin. Trước đây chỉ tải bank
            // của ngôn ngữ active → khi ở cantonese mode, mandarinVocabularies rỗng → cột gợi ý
            // không có details dù dữ liệu mandarin có đủ trong DB.
            // ⚠️ 2026-09-02: dùng chung /api/bootstrap (1 API trả 2 bank + map + user data) thay
            // vì 5 GET riêng như cũ.
            const boot = await api.fetchBootstrap();
            const mandarinRows = boot.mandarinVocabularies ?? [];
            const cantoneseRows = boot.cantoneseVocabularies ?? [];
            const mastery = boot.vocabularyMastery ?? { mandarin: {}, cantonese: {} };
            const mandarinBank = indexVocabularies(mandarinRows.map((v) => vocabLangToLegacy(v, "mandarin")));
            const cantoneseBank = indexVocabularies(cantoneseRows.map((v) => vocabLangToLegacy(v, "cantonese")));
            const bank = valid === "mandarin" ? mandarinBank : cantoneseBank;
            const favoriteVocabularyIds = [
                ...(boot.favoriteVocabularyIds?.mandarin ?? []),
                ...(boot.favoriteVocabularyIds?.cantonese ?? []),
            ];
            const dislikedVocabularyIds = [
                ...(boot.dislikedVocabularyIds?.mandarin ?? []),
                ...(boot.dislikedVocabularyIds?.cantonese ?? []),
            ];
            setApiLanguage(valid);
            set({
                language: valid,
                mandarinVocabularies: mandarinBank,
                cantoneseVocabularies: cantoneseBank,
                vocabularies: bank,
                vocabularyTotal: bank.length,
                masteredVocabularyCount: 0,
                favoriteVocabularyIds,
                dislikedVocabularyIds,
                vocabularyMastery: { mandarin: mastery?.mandarin ?? {}, cantonese: mastery?.cantonese ?? {} },
                vocabularySets: boot.vocabularySets ?? get().vocabularySets,
                dataLoading: false,
                dataError: null,
                dataLoadingStep: "done",
                hydrated: true,
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            const status = err instanceof Error && "status" in err ? err.status : undefined;
            logError("Fetch language data failed", message);
            set({ dataLoading: false, dataError: { message, status }, dataLoadingStep: "", hydrated: false });
            throw err;
        }
    },

    // ── Route-driven active language (2026-08-22) — KHÔNG còn nút toggle mode ──
    // Route /c/... hoặc /m/... quyết định ngôn ngữ active. Cả 2 bank đã tải sẵn lúc hydrate
    // → chỉ chuyển con trỏ `vocabularies` + api language, KHÔNG gọi lại mạng (không loading screen).
    setActiveLanguage: (lang) => {
        const valid = lang === "mandarin" || lang === "cantonese" ? lang : "cantonese";
        if (get().language === valid && get().vocabularies) return;
        const bank = valid === "mandarin" ? get().mandarinVocabularies : get().cantoneseVocabularies;
        setApiLanguage(valid);
        set({ language: valid, vocabularies: bank, vocabularyTotal: bank.length });
    },

    createVocabulary: (vocab) => {
        const label = vocab.hanTraditional || vocab.vietMeanings || vocab.engMeanings || "";
        logMutStart("Create vocabulary", label, vocab);
        assertAdmin();
        const bankKey = get().language === "mandarin" ? "mandarinVocabularies" : "cantoneseVocabularies";
        const prev = get().vocabularies;
        const prevBank = get()[bankKey];
        const item = indexVocabulary(vocab, prev.length);
        set({
            vocabularies: [...prev, item],
            [bankKey]: [...prevBank, item],
            vocabularyTotal: get().vocabularyTotal + 1,
        });
        return syncMutation(async () => {
            const saved = await api.createVocabulary(vocabularyLangPayload(stripSearchIndex(item), get().language));
            logMutDone("Create vocabulary", label, saved);
            invalidateVocabularyBrowseCache();
            const savedLegacy = indexVocabulary(vocabLangToLegacy(saved, get().language));
            set({
                vocabularies: updateVocabularyInList(get().vocabularies, item.id, {
                    ...savedLegacy,
                    _sortSeq: item._sortSeq,
                }),
                [bankKey]: updateVocabularyInList(get()[bankKey], item.id, {
                    ...savedLegacy,
                    _sortSeq: item._sortSeq,
                }),
                vocabulariesRevision: get().vocabulariesRevision + 1,
            });
        }).catch(() =>
            set({ vocabularies: prev, [bankKey]: prevBank, vocabularyTotal: Math.max(0, get().vocabularyTotal - 1) }),
        );
    },

    // ⚠️ 2026-09-02: thêm `lang` override — OCR chọn ngôn ngữ quét có thể khác ngôn ngữ trang.
    // Khi targetLang khác ngôn ngữ active → chỉ cập nhật bank index đúng, KHÔNG đụng list active.
    createVocabularyAwait: async (vocab, lang) => {
        assertAdmin();
        const targetLang = lang === "mandarin" ? "mandarin" : get().language;
        const isActiveLang = targetLang === get().language;
        const bankKey = targetLang === "mandarin" ? "mandarinVocabularies" : "cantoneseVocabularies";
        const prev = get().vocabularies;
        const prevBank = get()[bankKey];
        const item = indexVocabulary(normalizeVocabularyFields(vocab), prev.length);
        set({
            ...(isActiveLang ? { vocabularies: [...prev, item] } : {}),
            [bankKey]: [...prevBank, item],
            vocabularyTotal: get().vocabularyTotal + 1,
        });
        try {
            const saved = await api.createVocabulary(vocabularyLangPayload(stripSearchIndex(item), targetLang));
            invalidateVocabularyBrowseCache();
            invalidateDataCache();
            const savedLegacy = indexVocabulary(vocabLangToLegacy(saved, targetLang));
            set({
                ...(isActiveLang
                    ? {
                          vocabularies: updateVocabularyInList(get().vocabularies, item.id, {
                              ...savedLegacy,
                              _sortSeq: item._sortSeq,
                          }),
                      }
                    : {}),
                [bankKey]: updateVocabularyInList(get()[bankKey], item.id, {
                    ...savedLegacy,
                    _sortSeq: item._sortSeq,
                }),
                vocabulariesRevision: get().vocabulariesRevision + 1,
                vocabularyTotal: get().vocabularyTotal,
            });
            return saved;
        } catch (err) {
            set({
                ...(isActiveLang ? { vocabularies: prev } : {}),
                [bankKey]: prevBank,
                vocabularyTotal: Math.max(0, get().vocabularyTotal - 1),
            });
            throw err;
        }
    },

    createGrammar: (item) => {
        log("Create grammar", item);
        assertAdmin();
        const entry = indexGrammarItem(item);
        const prev = get().grammarBank;
        set({ grammarBank: [...prev, entry] });
        return syncMutation(() => api.createGrammar(stripSearchIndex(entry))).catch((err) => {
            set({ grammarBank: prev });
            throw err;
        });
    },

    createGrammarAwait: async (item) => {
        assertAdmin();
        const title = item.title?.trim() ?? "";
        const prev = get().grammarBank;
        const existing = prev.find((g) => g.title?.trim() === title);
        if (existing) return existing;

        const entry = indexGrammarItem(item, prev.length);
        set({ grammarBank: [...prev, entry] });
        try {
            const saved = await api.createGrammar(stripSearchIndex(entry));
            invalidateDataCache();
            set({
                grammarBank: updateGrammarInList(get().grammarBank, entry.id, saved),
            });
            return saved;
        } catch (err) {
            set({ grammarBank: prev });
            throw err;
        }
    },

    editVocabulary: (idOrVocab, patch) => {
        assertAdmin();
        const { id, snapshot } = resolveVocabularyTarget(idOrVocab);
        const bankKey = get().language === "mandarin" ? "mandarinVocabularies" : "cantoneseVocabularies";
        const prev = get().vocabularies;
        const prevBank = get()[bankKey];
        let existing = prev.find((w) => w.id === id);
        if (!existing && snapshot) {
            existing = indexVocabulary(snapshot);
        }
        if (!existing) return;

        // Payload model mới (mandarin/cantonese) hoặc per-language (readings) → convert
        // về legacy cho store so sánh + optimistic update; gửi payload MỚI lên API.
        const isLangPayload =
            patch && typeof patch === "object" && !Array.isArray(patch) && Array.isArray(patch.readings);
        const isNewPayload =
            patch && typeof patch === "object" && !Array.isArray(patch) && (patch.mandarin || patch.cantonese);
        const legacyPatch = isLangPayload
            ? vocabLangToLegacy({ id, ...patch }, get().language)
            : isNewPayload
              ? vocabNewToLegacy({ id, mandarin: patch.mandarin, cantonese: patch.cantonese, metadata: patch.metadata })
              : patch;
        const patchFlags = patch ?? {};
        const legacyPatchWithFlags = {
            ...legacyPatch,
            favorite: Boolean(patchFlags.favorite ?? existing.favorite),
            mastered: Boolean(patchFlags.mastered ?? existing.mastered),
            pureCantonese: Boolean(patchFlags.pureCantonese ?? existing.pureCantonese),
        };

        const merged = normalizeVocabularyFields({ ...existing, ...legacyPatchWithFlags });
        if (vocabularyContentEqual(existing, merged)) return;

        const label =
            existing.hanTraditional || existing.vietMeanings || existing.engMeanings || `#${String(id).slice(0, 8)}`;
        logMutStart("Update vocabulary", label, patch);
        let nextVocabularies = prev.some((w) => w.id === id)
            ? updateVocabularyInList(prev, id, { ...legacyPatchWithFlags, updatedAt: new Date().toISOString() })
            : [
                  ...prev,
                  indexVocabulary(
                      { ...existing, ...legacyPatchWithFlags, updatedAt: new Date().toISOString() },
                      prev.length,
                  ),
              ];
        const nextBank = prevBank.some((w) => w.id === id)
            ? updateVocabularyInList(prevBank, id, { ...legacyPatchWithFlags, updatedAt: new Date().toISOString() })
            : [
                  ...prevBank,
                  indexVocabulary(
                      { ...existing, ...legacyPatchWithFlags, updatedAt: new Date().toISOString() },
                      prevBank.length,
                  ),
              ];

        const vocab = nextVocabularies.find((w) => w.id === id);
        set({ vocabularies: nextVocabularies, [bankKey]: nextBank });
        if (vocab) {
            patchVocabularyInBrowseCache(id, {
                engMeanings: vocab.engMeanings,
                engExamples: vocab.engExamples,
                hanTraditional: vocab.hanTraditional,
                vietMeanings: vocab.vietMeanings,
                vietExamples: vocab.vietExamples,
                sinoVietnamese: vocab.sinoVietnamese,
                jyutping: vocab.jyutping,
                romanization: vocab.romanization,
                favorite: vocab.favorite,
            });
            return syncMutation(async () => {
                const current = get().vocabularies.find((w) => w.id === id);
                if (!current) return;
                const saved = await api.updateVocabulary(
                    id,
                    isLangPayload || isNewPayload
                        ? { id, ...patch }
                        : vocabularyLangPayload(stripSearchIndex(current), get().language),
                );
                const savedLegacy = indexVocabulary(vocabLangToLegacy(saved, get().language));
                logMutDone("Update vocabulary", label, saved);
                set({
                    vocabularies: updateVocabularyInList(get().vocabularies, id, savedLegacy),
                    [bankKey]: updateVocabularyInList(get()[bankKey], id, savedLegacy),
                });
                patchVocabularyInBrowseCache(id, {
                    engMeanings: savedLegacy.engMeanings,
                    engExamples: savedLegacy.engExamples,
                    hanTraditional: savedLegacy.hanTraditional,
                    vietMeanings: savedLegacy.vietMeanings,
                    vietExamples: savedLegacy.vietExamples,
                    sinoVietnamese: savedLegacy.sinoVietnamese,
                    jyutping: savedLegacy.jyutping,
                    romanization: savedLegacy.romanization,
                    favorite: savedLegacy.favorite,
                });
            }).catch((err) => {
                set({ vocabularies: prev, [bankKey]: prevBank });
                throw err;
            });
        }
    },

    // Cập nhật vocab theo NGÔN NGỮ TƯỜNG MINH (không phụ thuộc get().language) — dùng khi
    // full sync từ Mandarin ngay trong mode Cantonese (editVocabularyLang(id, "mandarin", payload)).
    // Payload là per-language (vocabularyLangPayload). (2026-08-21)
    editVocabularyLang: async (id, lang, patch) => {
        assertAdmin();
        const valid = lang === "mandarin" || lang === "cantonese" ? lang : "cantonese";
        const bankKey = valid === "mandarin" ? "mandarinVocabularies" : "cantoneseVocabularies";
        const prev = get()[bankKey];
        const existing = prev.find((w) => w.id === id);
        if (!existing) return;
        const legacyPatch = vocabLangToLegacy({ id, ...patch }, valid);
        const merged = normalizeVocabularyFields({ ...existing, ...legacyPatch });
        if (vocabularyContentEqual(existing, merged)) return;
        const label =
            existing.hanTraditional || existing.vietMeanings || existing.engMeanings || `#${String(id).slice(0, 8)}`;
        logMutStart("Update vocabulary (lang)", label, patch);
        const nextBank = prev.some((w) => w.id === id)
            ? updateVocabularyInList(prev, id, { ...legacyPatch, updatedAt: new Date().toISOString() })
            : [
                  ...prev,
                  indexVocabulary({ ...existing, ...legacyPatch, updatedAt: new Date().toISOString() }, prev.length),
              ];
        const patchActive = get().language === valid;
        set({ [bankKey]: nextBank });
        if (patchActive) set({ vocabularies: nextBank, vocabularyTotal: nextBank.length });
        const prevApiLang = getApiLanguage();
        try {
            setApiLanguage(valid);
            const saved = await api.updateVocabulary(id, patch);
            const savedLegacy = indexVocabulary(vocabLangToLegacy(saved, valid));
            const syncedBank = updateVocabularyInList(get()[bankKey], id, savedLegacy);
            set({ [bankKey]: syncedBank });
            if (patchActive) set({ vocabularies: syncedBank, vocabularyTotal: syncedBank.length });
            logMutDone("Update vocabulary (lang)", label, saved);
            patchVocabularyInBrowseCache(id, {
                engMeanings: savedLegacy.engMeanings,
                engExamples: savedLegacy.engExamples,
                hanTraditional: savedLegacy.hanTraditional,
                vietMeanings: savedLegacy.vietMeanings,
                vietExamples: savedLegacy.vietExamples,
                sinoVietnamese: savedLegacy.sinoVietnamese,
                jyutping: savedLegacy.jyutping,
                romanization: savedLegacy.romanization,
                favorite: savedLegacy.favorite,
            });
        } catch (err) {
            set({ [bankKey]: prev });
            if (patchActive) set({ vocabularies: prev, vocabularyTotal: prev.length });
            throw err;
        } finally {
            setApiLanguage(prevApiLang);
        }
    },

    syncHanVariantsAll: async () => {
        assertAdmin();
        const result = await api.backfillHanVariants();
        invalidateVocabularyBrowseCache();
        invalidateDataCache();
        await get().refreshVocabularies();
        set((s) => ({ vocabulariesRevision: s.vocabulariesRevision + 1 }));
        return result;
    },

    editGrammar: (id, patch) => {
        assertAdmin();
        const prev = get().grammarBank;
        const existing = prev.find((g) => g.id === id);
        if (!existing) return;

        const title = (patch.title ?? existing.title).trim();
        const details = patch.details ?? existing.details ?? [];
        const notes = patch.notes ?? existing.notes ?? [];
        const structure = (patch.structure ?? existing.structure ?? "").trim();
        const examples = patch.examples ?? existing.examples ?? [];
        const important = "important" in patch ? Boolean(patch.important) : Boolean(existing.important);
        const mastered = "mastered" in patch ? Boolean(patch.mastered) : Boolean(existing.mastered);

        log("Update grammar", existing);
        const grammarBank = updateGrammarInList(prev, id, {
            ...patch,
            title,
            details,
            notes,
            structure,
            examples,
            important,
            mastered,
        });
        const item = grammarBank.find((g) => g.id === id);
        set({ grammarBank });
        if (item) {
            return syncMutation(() => api.updateGrammar(id, stripSearchIndex(item))).catch((err) => {
                set({ grammarBank: prev });
                throw err;
            });
        }
    },

    // ⚠️ 2026-09-20: cặp đánh dấu theo user (thay "important" cũ):
    //   ❤️ favorite  → user_favorite_vocabularies
    //   🚫 disliked  → user_disliked_vocabularies (KHÔNG vào flashcard random + hiện ở /profile)
    // 2 trạng thái LOẠI TRỪ NHAU ⇒ bật cái này tự bỏ cái kia (optimistic + rollback, backend cũng vậy).
    // `lang` xác định ngôn ngữ của vocab (id uuid unique toàn cục nên Set không cần theo dõi lang).
    toggleVocabularyFavorite: (id, lang, favorite) => {
        assertSignedIn();
        const valid = lang === "mandarin" || lang === "cantonese" ? lang : "cantonese";
        const prev = get().favoriteVocabularyIds;
        const prevDisliked = get().dislikedVocabularyIds;
        const has = prev.includes(id);
        if (Boolean(favorite) === has) return Promise.resolve();
        const next = Boolean(favorite) ? [...prev, id] : prev.filter((x) => x !== id);
        set({
            favoriteVocabularyIds: next,
            ...(Boolean(favorite) && { dislikedVocabularyIds: prevDisliked.filter((x) => x !== id) }),
        });
        return syncMutation(() => api.setVocabularyFavorite(valid, id, Boolean(favorite)), {
            requireAdmin: false,
        }).catch((err) => {
            set({ favoriteVocabularyIds: prev, dislikedVocabularyIds: prevDisliked });
            throw err;
        });
    },

    toggleVocabularyDisliked: (id, lang, disliked) => {
        assertSignedIn();
        const valid = lang === "mandarin" || lang === "cantonese" ? lang : "cantonese";
        const prev = get().dislikedVocabularyIds;
        const prevFavorite = get().favoriteVocabularyIds;
        const has = prev.includes(id);
        if (Boolean(disliked) === has) return Promise.resolve();
        const next = Boolean(disliked) ? [...prev, id] : prev.filter((x) => x !== id);
        set({
            dislikedVocabularyIds: next,
            ...(Boolean(disliked) && { favoriteVocabularyIds: prevFavorite.filter((x) => x !== id) }),
        });
        return syncMutation(() => api.setVocabularyDisliked(valid, id, Boolean(disliked)), {
            requireAdmin: false,
        }).catch((err) => {
            set({ dislikedVocabularyIds: prev, favoriteVocabularyIds: prevFavorite });
            throw err;
        });
    },

    // ⚠️ 2026-09-02: cập nhật tiến độ mastered (0-100%) — bảng user_vocabulary_mastery (mọi user đã đăng nhập).
    // Optimistic cập nhật map → API → rollback khi lỗi. `lang` xác định ngôn ngữ của vocab.
    updateVocabularyMastery: (lang, id, progress) => {
        assertSignedIn();
        const valid = lang === "mandarin" || lang === "cantonese" ? lang : "cantonese";
        const prev = get().vocabularyMastery;
        const prevProgress = prev?.[valid]?.[id] ?? 0;
        const clamped = Math.max(0, Math.min(100, Math.round(Number(progress) || 0)));
        if (prevProgress === clamped) return Promise.resolve();
        const next = { ...prev, [valid]: { ...(prev?.[valid] ?? {}), [id]: clamped } };
        set({ vocabularyMastery: next });
        return syncMutation(() => api.setVocabularyMastery(valid, id, clamped), {
            requireAdmin: false,
        }).catch((err) => {
            set({ vocabularyMastery: prev });
            throw err;
        });
    },

    toggleGrammarImportant: (id) => {
        log("Toggle grammar important", id);
        assertAdmin();
        const prev = get().grammarBank;
        const grammarBank = toggleGrammarField(prev, id, "important");
        const item = grammarBank.find((g) => g.id === id);
        set({ grammarBank });
        if (item) {
            syncMutation(() => api.updateGrammar(id, stripSearchIndex(item))).catch(() => set({ grammarBank: prev }));
        }
    },

    toggleMastered: () => {}, // user_vocabularies đã bỏ (2026-08-17) — progress vocabulary không còn

    setVocabularyStudyProgress: () => {}, // user_vocabularies đã bỏ (2026-08-17) — progress vocabulary không còn

    toggleGrammarMastered: (id) => {
        log("Toggle grammar mastered", id);
        assertSignedIn();
        const prev = get().grammarBank;
        const grammarBank = toggleGrammarField(prev, id, "mastered");
        const item = grammarBank.find((g) => g.id === id);
        set({ grammarBank });
        if (item) {
            syncMutation(() => api.updateGrammar(id, stripSearchIndex(item)), { requireAdmin: false }).catch(() =>
                set({ grammarBank: prev }),
            );
        }
    },

    removeVocabulary: (id) => {
        assertAdmin();
        // 2026-08-23: đồng bộ CẢ bank index (mandarin/cantoneseVocabularies) — nếu chỉ xóa
        // khỏi `vocabularies` (active) thì khi đổi ngôn ngữ setActiveLanguage lấy lại từ bank
        // cũ → từ đã xóa HIỆN LẠI trong bảng. (cùng pattern editVocabularyLang)
        const bankKey = get().language === "mandarin" ? "mandarinVocabularies" : "cantoneseVocabularies";
        const prevVocabularies = get().vocabularies;
        const prevBank = get()[bankKey];
        const removed = prevVocabularies.find((w) => w.id === id);
        const label =
            removed?.hanTraditional || removed?.vietMeanings || removed?.engMeanings || `#${String(id).slice(0, 8)}`;
        logMutStart("Delete vocabulary", label);
        const nextVocabularies = deleteVocabularyFromList(prevVocabularies, id);
        const nextBank = deleteVocabularyFromList(prevBank, id);
        const prevVocabularyTotal = get().vocabularyTotal;
        const prevMastered = get().masteredVocabularyCount;
        const prevRevision = get().vocabulariesRevision;
        set({
            vocabularies: nextVocabularies,
            [bankKey]: nextBank,
            vocabularyTotal: Math.max(0, prevVocabularyTotal - 1),
            masteredVocabularyCount: removed?.mastered ? Math.max(0, prevMastered - 1) : prevMastered,
            vocabulariesRevision: prevRevision + 1,
        });
        syncMutation(() =>
            api.deleteVocabulary(id).then((r) => {
                logMutDone("Delete vocabulary", label);
                return r;
            }),
        ).catch(() =>
            set({
                vocabularies: prevVocabularies,
                [bankKey]: prevBank,
                vocabularyTotal: prevVocabularyTotal,
                masteredVocabularyCount: prevMastered,
                vocabulariesRevision: prevRevision,
            }),
        );
    },

    mergeVocabularies: (incoming) => {
        if (!incoming?.length) return;
        set((s) => {
            const byId = new Map(s.vocabularies.map((w) => [w.id, w]));
            for (const raw of incoming) {
                const existing = byId.get(raw.id);
                const keepExistingContent = existing && vocabTimeMs(existing) > vocabTimeMs(raw);
                const incomingNewer = !existing || vocabTimeMs(raw) >= vocabTimeMs(existing);
                const payload = existing
                    ? {
                          ...raw,
                          ...(keepExistingContent
                              ? {
                                    engMeanings: existing.engMeanings,
                                    hanTraditional: existing.hanTraditional,
                                    hanSimplified: existing.hanSimplified,
                                    vietMeanings: existing.vietMeanings,
                                    sinoVietnamese: existing.sinoVietnamese,
                                    jyutping: existing.jyutping,
                                    vietExamples: existing.vietExamples,
                                    romanization: existing.romanization,
                                    updatedAt: existing.updatedAt,
                                }
                              : {}),
                          favorite: incomingNewer ? Boolean(raw.favorite) : Boolean(existing.favorite),
                          mastered: incomingNewer ? Boolean(raw.mastered) : Boolean(existing.mastered),
                          vietExamples: keepExistingContent
                              ? existing.vietExamples
                              : "vietExamples" in raw
                                ? raw.vietExamples || undefined
                                : existing?.vietExamples,
                      }
                    : raw;
                byId.set(raw.id, indexVocabulary(payload, existing?._sortSeq ?? byId.size));
            }
            const vocabularies = Array.from(byId.values());
            return { vocabularies };
        });
    },

    ensureVocabulariesByIds: async (ids) => {
        const list = [...new Set((ids ?? []).map(String).filter(Boolean))];
        if (list.length === 0) return;
        const loaded = new Set(get().vocabularies.map((w) => String(w.id)));
        const missing = list.filter((id) => !loaded.has(id));
        if (missing.length === 0) return;
        const fetched = await api.fetchVocabulariesByIds(missing);
        get().mergeVocabularies(fetched);
    },

    /** Re-fetch all vocabulary from server (after backfill etc.). */
    refreshVocabularies: async () => {
        const remote = await api.fetchFullData();
        const indexed = indexCloudPayload({
            vocabularies: remote.vocabularies ?? [],
            grammars: [],
        });
        set({
            vocabularies: indexed.vocabularies,
            vocabularyTotal: remote.vocabularyTotal ?? indexed.vocabularies.length,
            masteredVocabularyCount: remote.masteredVocabularyCount ?? 0,
            vocabulariesRevision: get().vocabulariesRevision + 1,
        });
    },

    removeGrammar: (id) => {
        assertAdmin();
        const prev = get().grammarBank;
        log("Delete grammar", prev.find((g) => g.id === id) ?? id);
        const grammarBank = deleteGrammarFromList(prev, id);
        set({ grammarBank });
        syncMutation(() => api.deleteGrammar(id)).catch(() => set({ grammarBank: prev }));
    },

    // ── Tags (dùng chung toàn app — CHỈ admin tạo/đổi tên/xóa + gán cho từ) — 2026-09-27 ──

    fetchTags: async (force = false) => {
        if (!force && get().tags.length > 0) return get().tags;
        // Dedupe concurrent fetch (nhiều chỗ mở picker cùng lúc).
        if (tagsFetchPromise) return tagsFetchPromise;
        tagsFetchPromise = (async () => {
            try {
                const result = await api.fetchTags();
                set({ tags: Array.isArray(result) ? result : [] });
                return get().tags;
            } finally {
                tagsFetchPromise = null;
            }
        })();
        return tagsFetchPromise;
    },

    createTag: async (name) => {
        const saved = await api.createTag({ name });
        set((s) => ({ tags: sortTags([...s.tags, saved]) }));
        return saved;
    },

    // ⚠️ 2026-09-27: nhận PATCH từng phần — `{ name }` (đổi tên, BE chuẩn hóa Title Case)
    // hoặc `{ color }` (đổi màu tag). OPTIMISTIC, lỗi → rollback.
    updateTag: async (id, patch) => {
        const prev = get().tags;
        set((s) => ({ tags: sortTags(s.tags.map((tg) => (tg.id === id ? { ...tg, ...patch } : tg))) }));
        try {
            const saved = await api.updateTag(id, patch);
            set((s) => ({ tags: sortTags(s.tags.map((tg) => (tg.id === id ? { ...tg, ...saved } : tg))) }));
            return saved;
        } catch (err) {
            set({ tags: prev });
            throw err;
        }
    },

    deleteTag: async (id) => {
        const prev = get().tags;
        // ⚠️ 2026-09-27: OPTIMISTIC — gỡ khỏi catalogue NGAY (trước đây chờ round-trip Supabase
        // → tag còn nằm trên UI vài trăm ms → vài giây khi mạng chậm). Lỗi → khôi phục.
        set((s) => ({ tags: s.tags.filter((tg) => tg.id !== id) }));
        try {
            await api.deleteTag(id);
        } catch (err) {
            set({ tags: prev });
            throw err;
        }
    },

    // Gán/gỡ tag cho từ — cập nhật luôn số lượng từ của tag trong catalogue (optimistic).
    setVocabularyTag: async (lang, vocabularyId, tagId, tagged) => {
        const valid = lang === "mandarin" || lang === "cantonese" ? lang : "cantonese";
        const prev = get().tags;
        set((s) => ({
            tags: s.tags.map((tg) =>
                tg.id === tagId
                    ? { ...tg, vocabularyCount: Math.max(0, (tg.vocabularyCount ?? 0) + (tagged ? 1 : -1)) }
                    : tg,
            ),
        }));
        try {
            await api.setVocabularyTag({ lang: valid, vocabularyId, tagId, tagged });
        } catch (err) {
            set({ tags: prev });
            throw err;
        }
        return { ok: true };
    },

    // ── Vocabulary Sets (custom user groups) ──

    fetchVocabularySets: async () => {
        // ⚠️ 2026-09-02: sets đã có trong bootstrap (hydrateFromCloud/loadLanguage set sẵn) →
        // không gọi lại /api/vocabulary-sets khi mount (VocabularyBankPage/Picker/Manager).
        if (get().vocabularySets.length > 0) return get().vocabularySets;
        // Dedupe concurrent fetches (VocabularyBankPage + VocabularyBankListPanel mount cùng lúc → 2 API call).
        if (vocabularySetsFetchPromise) return vocabularySetsFetchPromise;
        vocabularySetsFetchPromise = (async () => {
            try {
                const result = await api.fetchVocabularySets();
                set({ vocabularySets: result });
                return result;
            } finally {
                vocabularySetsFetchPromise = null;
            }
        })();
        return vocabularySetsFetchPromise;
    },

    createVocabularySet: async (payload) => {
        const saved = await api.createVocabularySet(payload);
        set((s) => ({ vocabularySets: [...s.vocabularySets, saved] }));
        return saved;
    },

    updateVocabularySet: async (id, patch) => {
        const saved = await api.updateVocabularySet(id, patch);
        set((s) => ({
            vocabularySets: s.vocabularySets.map((st) => (st.id === id ? { ...st, ...saved } : st)),
        }));
        return saved;
    },

    deleteVocabularySet: async (id) => {
        await api.deleteVocabularySet(id);
        set((s) => ({ vocabularySets: s.vocabularySets.filter((st) => st.id !== id) }));
    },

    // ⚠️ 2026-09-02: bộ từ tách theo ngôn ngữ — set object từ API có
    // mandarinVocabularyIds/cantoneseVocabularyIds + mandarinCount/cantoneseCount. add/remove phải
    // truyền lang để ghi đúng join table; cập nhật store theo mảng của đúng ngôn ngữ.
    addVocabularyToSet: async (setId, vocabularyId, lang) => {
        const valid = lang === "mandarin" || lang === "cantonese" ? lang : "cantonese";
        await api.addVocabularyToSet(setId, vocabularyId, valid);
        set((s) => ({
            vocabularySets: s.vocabularySets.map((st) => {
                if (st.id !== setId) return st;
                const idKey = valid === "mandarin" ? "mandarinVocabularyIds" : "cantoneseVocabularyIds";
                const countKey = valid === "mandarin" ? "mandarinCount" : "cantoneseCount";
                const ids = st[idKey] ?? [];
                if (ids.includes(vocabularyId)) return st;
                return { ...st, [countKey]: (st[countKey] ?? 0) + 1, [idKey]: [...ids, vocabularyId] };
            }),
        }));
    },

    removeVocabularyFromSet: async (setId, vocabularyId, lang) => {
        const valid = lang === "mandarin" || lang === "cantonese" ? lang : "cantonese";
        await api.removeVocabularyFromSet(setId, vocabularyId, valid);
        set((s) => ({
            vocabularySets: s.vocabularySets.map((st) => {
                if (st.id !== setId) return st;
                const idKey = valid === "mandarin" ? "mandarinVocabularyIds" : "cantoneseVocabularyIds";
                const countKey = valid === "mandarin" ? "mandarinCount" : "cantoneseCount";
                return {
                    ...st,
                    [countKey]: Math.max(0, (st[countKey] ?? 0) - 1),
                    [idKey]: (st[idKey] ?? []).filter((v) => v !== vocabularyId),
                };
            }),
        }));
    },
}));

export const useLanguage = () => useAppStore((s) => s.language);
export const useVocabularies = () => useAppStore((s) => s.vocabularies);
export const useMandarinVocabularies = () => useAppStore((s) => s.mandarinVocabularies);
export const useCantoneseVocabularies = () => useAppStore((s) => s.cantoneseVocabularies);
export const useFavoriteVocabularyIds = () => useAppStore((s) => s.favoriteVocabularyIds);
export const useDislikedVocabularyIds = () => useAppStore((s) => s.dislikedVocabularyIds);
export const useVocabularyMastery = () => useAppStore((s) => s.vocabularyMastery);
export const useVocabularySets = () => useAppStore((s) => s.vocabularySets);
export const useTags = () => useAppStore((s) => s.tags);
export const useGrammarBank = () => useAppStore((s) => s.grammarBank);
export const useDataLoading = () => useAppStore((s) => s.dataLoading);
export const useDataError = () => useAppStore((s) => s.dataError);
export const useDataHydrated = () => useAppStore((s) => s.hydrated);
export const useDataLoadingStep = () => useAppStore((s) => s.dataLoadingStep);
export const useVocabularyCount = () => useAppStore((s) => s.vocabularyTotal);
export const useVocabulariesRevision = () => useAppStore((s) => s.vocabulariesRevision);
export const useGrammarCount = () => useAppStore((s) => s.grammarBank.length);
export const useMasteredVocabularyCount = () => useAppStore((s) => s.masteredVocabularyCount);

export const useAppActions = () =>
    useAppStore(
        useShallow((s) => ({
            createVocabulary: s.createVocabulary,
            createVocabularyAwait: s.createVocabularyAwait,
            createGrammar: s.createGrammar,
            createGrammarAwait: s.createGrammarAwait,
            editVocabulary: s.editVocabulary,
            editVocabularyLang: s.editVocabularyLang,
            editGrammar: s.editGrammar,
            toggleVocabularyFavorite: s.toggleVocabularyFavorite,
            toggleVocabularyDisliked: s.toggleVocabularyDisliked,
            updateVocabularyMastery: s.updateVocabularyMastery,
            toggleGrammarImportant: s.toggleGrammarImportant,
            toggleMastered: s.toggleMastered,
            setVocabularyStudyProgress: s.setVocabularyStudyProgress,
            toggleGrammarMastered: s.toggleGrammarMastered,
            removeVocabulary: s.removeVocabulary,
            removeGrammar: s.removeGrammar,
            hydrateFromCloud: s.hydrateFromCloud,
            clearData: s.clearData,
            mergeVocabularies: s.mergeVocabularies,
            ensureVocabulariesByIds: s.ensureVocabulariesByIds,
            syncHanVariantsAll: s.syncHanVariantsAll,
            fetchVocabularySets: s.fetchVocabularySets,
            createVocabularySet: s.createVocabularySet,
            updateVocabularySet: s.updateVocabularySet,
            deleteVocabularySet: s.deleteVocabularySet,
            addVocabularyToSet: s.addVocabularyToSet,
            removeVocabularyFromSet: s.removeVocabularyFromSet,
            fetchTags: s.fetchTags,
            createTag: s.createTag,
            updateTag: s.updateTag,
            deleteTag: s.deleteTag,
            setVocabularyTag: s.setVocabularyTag,
        })),
    );
