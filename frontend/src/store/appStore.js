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
import { saveDataCache, invalidateDataCache } from "../lib/dataCache.js";

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

/** Dedupe concurrent vocabulary-sets fetches (WordBankPage + WordBankListPanel). */
let vocabularySetsFetchPromise = null;

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
    hanCharacters: [],
    hanCharacterTotal: 0,
    hanCharactersRevision: 0,
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
    // Map HK → gợi ý mandarin (precompute lúc load — tra map khi click vocab thay vì gọi API từng từ).
    hkSuggestionMap: {},

    clearData: () => {
        log("Clear app data");
        invalidateDataCache();
        set({
            vocabularies: [],
            vocabularyTotal: 0,
            masteredVocabularyCount: 0,
            vocabulariesRevision: 0,
            grammarBank: [],
            hanCharacters: [],
            hanCharacterTotal: 0,
            hanCharactersRevision: 0,
            vocabularySets: [],
            mandarinVocabularies: [],
            cantoneseVocabularies: [],
            hkSuggestionMap: {},
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
                set({ dataLoadingStep: "loading-data" });
                // Tải song song: full data + map HK→mandarin gợi ý (precompute — tra map khi
                // click vocab thay vì gọi API từng từ, hết giật). (2026-08-21)
                const [remote, hkSuggestionMap] = await Promise.all([
                    api.fetchFullData(),
                    api.fetchHkSuggestionMap().catch(() => ({})),
                ]);
                logFetchDone({
                    mandarin: remote.mandarinVocabularies?.length ?? 0,
                    cantonese: remote.cantoneseVocabularies?.length ?? 0,
                    grammar: remote.grammars?.length ?? 0,
                    hanCharacters: remote.hanCharacterTotal ?? remote.hanCharacters?.length ?? 0,
                });
                // Save raw payload to cache for next cold start
                set({ dataLoadingStep: "saving-cache" });
                await saveDataCache(remote);
                set({ dataLoadingStep: "indexing" });
                const grammarIndexed = indexCloudPayload({ vocabularies: [], grammars: remote.grammars ?? [] });
                const mandarinBank = indexVocabularies(
                    (remote.mandarinVocabularies ?? []).map((v) => vocabLangToLegacy(v, "mandarin")),
                );
                const cantoneseBank = indexVocabularies(
                    (remote.cantoneseVocabularies ?? []).map((v) => vocabLangToLegacy(v, "cantonese")),
                );
                const active = get().language === "mandarin" ? mandarinBank : cantoneseBank;
                set({
                    mandarinVocabularies: mandarinBank,
                    cantoneseVocabularies: cantoneseBank,
                    vocabularies: active,
                    vocabularyTotal: active.length,
                    masteredVocabularyCount: 0, // user_vocabularies đã bỏ
                    grammarBank: grammarIndexed.grammarBank,
                    hanCharacters: remote.hanCharacters ?? [],
                    hanCharacterTotal: remote.hanCharacters?.length ?? 0,
                    hkSuggestionMap,
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
            const [mandarinRows, cantoneseRows, hkSuggestionMap] = await Promise.all([
                api.fetchLanguageData("mandarin"),
                api.fetchLanguageData("cantonese"),
                api.fetchHkSuggestionMap().catch(() => ({})),
            ]);
            const mandarinBank = indexVocabularies((mandarinRows ?? []).map((v) => vocabLangToLegacy(v, "mandarin")));
            const cantoneseBank = indexVocabularies(
                (cantoneseRows ?? []).map((v) => vocabLangToLegacy(v, "cantonese")),
            );
            const bank = valid === "mandarin" ? mandarinBank : cantoneseBank;
            setApiLanguage(valid);
            set({
                language: valid,
                mandarinVocabularies: mandarinBank,
                cantoneseVocabularies: cantoneseBank,
                vocabularies: bank,
                vocabularyTotal: bank.length,
                masteredVocabularyCount: 0,
                hkSuggestionMap,
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

    createVocabularyAwait: async (vocab) => {
        assertAdmin();
        const bankKey = get().language === "mandarin" ? "mandarinVocabularies" : "cantoneseVocabularies";
        const prev = get().vocabularies;
        const prevBank = get()[bankKey];
        const item = indexVocabulary(normalizeVocabularyFields(vocab), prev.length);
        set({
            vocabularies: [...prev, item],
            [bankKey]: [...prevBank, item],
            vocabularyTotal: get().vocabularyTotal + 1,
        });
        try {
            const saved = await api.createVocabulary(vocabularyLangPayload(stripSearchIndex(item), get().language));
            invalidateVocabularyBrowseCache();
            invalidateDataCache();
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
                vocabularyTotal: get().vocabularyTotal,
            });
            return saved;
        } catch (err) {
            set({ vocabularies: prev, [bankKey]: prevBank, vocabularyTotal: Math.max(0, get().vocabularyTotal - 1) });
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
            important: Boolean(patchFlags.important ?? existing.important),
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
                important: vocab.important,
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
                    important: savedLegacy.important,
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
                important: savedLegacy.important,
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

    toggleImportant: () => {}, // user_vocabularies đã bỏ (2026-08-17) — progress vocabulary không còn

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
                          important: incomingNewer ? Boolean(raw.important) : Boolean(existing.important),
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

    /** Re-fetch all han characters from server. */
    refreshHanCharacters: async () => {
        const remote = await api.fetchFullData();
        set({
            hanCharacters: remote.hanCharacters ?? [],
            hanCharacterTotal: remote.hanCharacterTotal ?? remote.hanCharacters?.length ?? 0,
            hanCharactersRevision: get().hanCharactersRevision + 1,
        });
    },

    /** Merge han characters into store (upsert by id). */
    mergeHanCharacters: (incoming) => {
        if (!incoming?.length) return;
        set((s) => {
            const byId = new Map(s.hanCharacters.map((h) => [h.id, h]));
            for (const item of incoming) {
                byId.set(item.id, { ...byId.get(item.id), ...item });
            }
            return {
                hanCharacters: Array.from(byId.values()),
                hanCharacterTotal: byId.size,
                hanCharactersRevision: s.hanCharactersRevision + 1,
            };
        });
    },

    /** Remove a han character from store. */
    removeHanCharacter: (id) => {
        set((s) => {
            const next = s.hanCharacters.filter((h) => h.id !== id);
            if (next.length === s.hanCharacters.length) return {};
            return {
                hanCharacters: next,
                hanCharacterTotal: next.length,
                hanCharactersRevision: s.hanCharactersRevision + 1,
            };
        });
    },

    /** Bump han characters revision to trigger re-renders. */
    bumpHanCharactersRevision: () => {
        set((s) => ({ hanCharactersRevision: s.hanCharactersRevision + 1 }));
    },

    editHanCharacter: (id, patch) => {
        assertAdmin();
        const prev = get().hanCharacters;
        const existing = prev.find((h) => h.id === id);
        if (!existing) return;

        const merged = { ...existing, ...patch, updatedAt: new Date().toISOString() };
        const label = existing.hanSimplified || `#${String(id).slice(0, 8)}`;
        logMutStart("Update han char", label, patch);

        const next = prev.map((h) => (h.id === id ? merged : h));
        set({ hanCharacters: next, hanCharactersRevision: get().hanCharactersRevision + 1 });

        syncMutation(async () => {
            const current = get().hanCharacters.find((h) => h.id === id);
            if (!current) return;
            const saved = await api.updateHanCharacter(id, stripSearchIndex(current));
            logMutDone("Update han char", label, saved);
            set((s) => ({
                hanCharacters: s.hanCharacters.map((h) => (h.id === id ? { ...h, ...saved } : h)),
                hanCharactersRevision: s.hanCharactersRevision + 1,
            }));
        }).catch(() => set({ hanCharacters: prev }));
    },

    removeGrammar: (id) => {
        assertAdmin();
        const prev = get().grammarBank;
        log("Delete grammar", prev.find((g) => g.id === id) ?? id);
        const grammarBank = deleteGrammarFromList(prev, id);
        set({ grammarBank });
        syncMutation(() => api.deleteGrammar(id)).catch(() => set({ grammarBank: prev }));
    },

    // ── Vocabulary Sets (custom user groups) ──

    fetchVocabularySets: async () => {
        // Dedupe concurrent fetches (WordBankPage + WordBankListPanel mount cùng lúc → 2 API call).
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

    addVocabularyToSet: async (setId, vocabularyId) => {
        await api.addVocabularyToSet(setId, vocabularyId);
        set((s) => ({
            vocabularySets: s.vocabularySets.map((st) =>
                st.id === setId && !st.vocabularyIds.includes(vocabularyId)
                    ? { ...st, count: st.count + 1, vocabularyIds: [...st.vocabularyIds, vocabularyId] }
                    : st,
            ),
        }));
    },

    removeVocabularyFromSet: async (setId, vocabularyId) => {
        await api.removeVocabularyFromSet(setId, vocabularyId);
        set((s) => ({
            vocabularySets: s.vocabularySets.map((st) =>
                st.id === setId
                    ? {
                          ...st,
                          count: Math.max(0, st.count - 1),
                          vocabularyIds: st.vocabularyIds.filter((v) => v !== vocabularyId),
                      }
                    : st,
            ),
        }));
    },
}));

export const useLanguage = () => useAppStore((s) => s.language);
export const useVocabularies = () => useAppStore((s) => s.vocabularies);
export const useMandarinVocabularies = () => useAppStore((s) => s.mandarinVocabularies);
export const useCantoneseVocabularies = () => useAppStore((s) => s.cantoneseVocabularies);
export const useHkSuggestionMap = () => useAppStore((s) => s.hkSuggestionMap);
export const useVocabularySets = () => useAppStore((s) => s.vocabularySets);
export const useGrammarBank = () => useAppStore((s) => s.grammarBank);
export const useDataLoading = () => useAppStore((s) => s.dataLoading);
export const useDataError = () => useAppStore((s) => s.dataError);
export const useDataHydrated = () => useAppStore((s) => s.hydrated);
export const useDataLoadingStep = () => useAppStore((s) => s.dataLoadingStep);
export const useVocabularyCount = () => useAppStore((s) => s.vocabularyTotal);
export const useVocabulariesRevision = () => useAppStore((s) => s.vocabulariesRevision);
export const useHanCharacters = () => useAppStore((s) => s.hanCharacters);
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
            toggleImportant: s.toggleImportant,
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
            mergeHanCharacters: s.mergeHanCharacters,
            removeHanCharacter: s.removeHanCharacter,
            bumpHanCharactersRevision: s.bumpHanCharactersRevision,
            editHanCharacter: s.editHanCharacter,
            refreshHanCharacters: s.refreshHanCharacters,
            fetchVocabularySets: s.fetchVocabularySets,
            createVocabularySet: s.createVocabularySet,
            updateVocabularySet: s.updateVocabularySet,
            deleteVocabularySet: s.deleteVocabularySet,
            addVocabularyToSet: s.addVocabularyToSet,
            removeVocabularyFromSet: s.removeVocabularyFromSet,
        })),
    );
