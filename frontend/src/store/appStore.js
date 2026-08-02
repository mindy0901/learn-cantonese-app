import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import {
    deleteGrammarFromList,
    deleteSentenceFromList,
    deleteVocabularyFromList,
    indexCloudPayload,
    indexGrammarItem,
    indexSentencePattern,
    indexVocabulary,
    stripSearchIndex,
    toggleGrammarField,
    toggleSentenceField,
    toggleVocabularyField,
    updateGrammarInList,
    updateSentenceInList,
    updateVocabularyInList,
} from "../lib/dataTransforms.js";
import { invalidateVocabularyBrowseCache, patchVocabularyInBrowseCache } from "../lib/wordBrowseCache.js";
import { api } from "../lib/api.js";
import { log, logWarn, logError, logFetchDone, logMutStart, logMutDone } from "../lib/actionLog.js";
import { normalizeVocabularyFields, vocabularyContentEqual } from "../lib/wordNormalize.js";
import { useAuthStore } from "./authStore.js";
import { findWordIdsInSentence } from "../lib/sentencePatternMatch.js";
import { saveDataCache, loadDataCache, invalidateDataCache } from "../lib/dataCache.js";

const LEGACY_DATA_KEY = "cantonese-app-data";

/** Dedupe concurrent cloud hydrates (e.g. React Strict Mode). */
let hydrateFromCloudPromise = null;

function assertAdmin() {
    if (!useAuthStore.getState().user?.isAdmin) {
        throw new Error("Admin only");
    }
}

function assertSignedIn() {
    if (!useAuthStore.getState().user) {
        throw new Error("Sign in required");
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
        const hasLocal =
            (parsed.words?.length ?? 0) > 0 ||
            (parsed.grammarBank?.length ?? 0) > 0;

        if (hasLocal) {
            log("Migrate legacy data");
            const remote = await api.fetchFromCloud();
            const cloudEmpty =
                (remote.vocabularies?.length ?? 0) === 0 &&
                (remote.grammars?.length ?? 0) === 0;

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
    sentencePatterns: [],
    hanCharacters: [],
    hanCharacterTotal: 0,
    hanCharactersRevision: 0,
    dataLoading: false,
    dataError: null, // { message: string, status?: number } | null
    hydrated: false,

    clearData: () => {
        log("Clear app data");
        invalidateDataCache();
        set({
            vocabularies: [],
            vocabularyTotal: 0,
            masteredVocabularyCount: 0,
            vocabulariesRevision: 0,
            grammarBank: [],
            sentencePatterns: [],
            hanCharacters: [],
            hanCharacterTotal: 0,
            hanCharactersRevision: 0,
            dataLoading: false,
            dataError: null,
            hydrated: false,
        });
    },

    hydrateFromCloud: async () => {
        if (hydrateFromCloudPromise) return hydrateFromCloudPromise;

        hydrateFromCloudPromise = (async () => {
            set({ dataLoading: true, dataError: null });

            // Step 0: Try to load from cache for instant display
            const cached = loadDataCache();
            if (cached) {
                try {
                    const indexed = indexCloudPayload({
                        vocabularies: cached.vocabularies ?? [],
                        grammars: cached.grammars ?? [],
                        sentencePatterns: cached.sentencePatterns ?? [],
                    });
                    set({
                        ...indexed,
                        vocabularyTotal: cached.vocabularyTotal ?? indexed.vocabularies.length,
                        masteredVocabularyCount: cached.masteredVocabularyCount ?? 0,
                        hanCharacters: cached.hanCharacters ?? [],
                        hanCharacterTotal: cached.hanCharacterTotal ?? cached.hanCharacters?.length ?? 0,
                        dataLoading: false,
                        dataError: null,
                        hydrated: true,
                    });
                } catch {
                    // Cache parse error — silently ignore, will fetch from API
                    invalidateDataCache();
                }
            }

            try {
                if (useAuthStore.getState().user?.isAdmin) {
                    await migrateLegacyLocalIfNeeded();
                }
                const remote = await api.fetchFullData();
                logFetchDone({
                    vocabularies: remote.vocabularies?.length ?? 0,
                    grammar: remote.grammars?.length ?? 0,
                    sentences: remote.sentencePatterns?.length ?? 0,
                    hanCharacters: remote.hanCharacterTotal ?? remote.hanCharacters?.length ?? 0,
                });
                // Save raw payload to cache for next cold start
                saveDataCache(remote);
                const indexed = indexCloudPayload({
                    vocabularies: remote.vocabularies ?? [],
                    grammars: remote.grammars ?? [],
                    sentencePatterns: remote.sentencePatterns ?? [],
                });
                set({
                    ...indexed,
                    vocabularyTotal: remote.vocabularyTotal ?? indexed.vocabularies.length,
                    masteredVocabularyCount: remote.masteredVocabularyCount ?? 0,
                    hanCharacters: remote.hanCharacters ?? [],
                    hanCharacterTotal: remote.hanCharacterTotal ?? remote.hanCharacters?.length ?? 0,
                    dataLoading: false,
                    dataError: null,
                    hydrated: true,
                });
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                const status = err instanceof Error && "status" in err ? err.status : undefined;
                logError("Fetch all Data failed", message);
                // If we already loaded from cache, keep showing cached data
                if (!cached) {
                    set({
                        dataLoading: false,
                        dataError: { message, status },
                        hydrated: false,
                    });
                }
                throw err;
            } finally {
                hydrateFromCloudPromise = null;
            }
        })();

        return hydrateFromCloudPromise;
    },

    createVocabulary: (vocab) => {
        const label = vocab.hanTraditional || vocab.vietMeanings || vocab.engMeanings || "";
        logMutStart("Create vocabulary", label, vocab);
        assertAdmin();
        const prev = get().vocabularies;
        const item = indexVocabulary(vocab, prev.length);
        set({ vocabularies: [...prev, item], vocabularyTotal: get().vocabularyTotal + 1 });
        return syncMutation(async () => {
            const saved = await api.createVocabulary(stripSearchIndex(item));
            logMutDone("Create vocabulary", label, saved);
            invalidateVocabularyBrowseCache();
            set({
                vocabularies: updateVocabularyInList(get().vocabularies, item.id, {
                    ...saved,
                    _sortSeq: item._sortSeq,
                }),
                vocabulariesRevision: get().vocabulariesRevision + 1,
            });
        }).catch(() => set({ vocabularies: prev, vocabularyTotal: Math.max(0, get().vocabularyTotal - 1) }));
    },

    createVocabularyAwait: async (vocab) => {
        assertAdmin();
        const prev = get().vocabularies;
        const item = indexVocabulary(normalizeVocabularyFields(vocab), prev.length);
        set({ vocabularies: [...prev, item], vocabularyTotal: get().vocabularyTotal + 1 });
        try {
            const saved = await api.createVocabulary(stripSearchIndex(item));
            invalidateVocabularyBrowseCache();
            invalidateDataCache();
            set({
                vocabularies: updateVocabularyInList(get().vocabularies, item.id, {
                    ...saved,
                    _sortSeq: item._sortSeq,
                }),
                vocabulariesRevision: get().vocabulariesRevision + 1,
                vocabularyTotal: get().vocabularyTotal,
            });
            return saved;
        } catch (err) {
            set({ vocabularies: prev, vocabularyTotal: Math.max(0, get().vocabularyTotal - 1) });
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
        const prev = get().vocabularies;
        let existing = prev.find((w) => w.id === id);
        if (!existing && snapshot) {
            existing = indexVocabulary(snapshot);
        }
        if (!existing) return;

        const merged = normalizeVocabularyFields({ ...existing, ...patch });
        if (vocabularyContentEqual(existing, merged)) return;

        const label =
            existing.hanTraditional || existing.vietMeanings || existing.engMeanings || `#${String(id).slice(0, 8)}`;
        logMutStart("Update vocabulary", label, patch);
        let nextVocabularies = prev.some((w) => w.id === id)
            ? updateVocabularyInList(prev, id, { ...patch, updatedAt: new Date().toISOString() })
            : [...prev, indexVocabulary({ ...existing, ...patch, updatedAt: new Date().toISOString() }, prev.length)];

        const vocab = nextVocabularies.find((w) => w.id === id);
        set({ vocabularies: nextVocabularies });
        if (vocab) {
            patchVocabularyInBrowseCache(id, {
                engMeanings: vocab.engMeanings,
                engExamples: vocab.engExamples,
                hanTraditional: vocab.hanTraditional,
                vietMeanings: vocab.vietMeanings,
                vietExamples: vocab.vietExamples,
                sinoVietnamese: vocab.sinoVietnamese,
                jyutping: vocab.jyutping,
                important: vocab.important,
            });
            return syncMutation(async () => {
                const current = get().vocabularies.find((w) => w.id === id);
                if (!current) return;
                const saved = await api.updateVocabulary(id, stripSearchIndex(current));
                logMutDone("Update vocabulary", label, saved);
                set({ vocabularies: updateVocabularyInList(get().vocabularies, id, saved) });
                patchVocabularyInBrowseCache(id, {
                    engMeanings: saved.engMeanings,
                    engExamples: saved.engExamples,
                    hanTraditional: saved.hanTraditional,
                    vietMeanings: saved.vietMeanings,
                    vietExamples: saved.vietExamples,
                    sinoVietnamese: saved.sinoVietnamese,
                    jyutping: saved.jyutping,
                    important: saved.important,
                });
            }).catch((err) => {
                set({ vocabularies: prev });
                throw err;
            });
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

    syncPinyinAll: async () => {
        assertAdmin();
        const result = await api.backfillPinyin();
        invalidateVocabularyBrowseCache();
        invalidateDataCache();
        await get().refreshVocabularies();
        set((s) => ({ vocabulariesRevision: s.vocabulariesRevision + 1 }));
        return result;
    },

    syncJyutpingAll: async () => {
        assertAdmin();
        const result = await api.backfillJyutping();
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

    toggleImportant: (idOrVocab) => {
        const { id, snapshot } = resolveVocabularyTarget(idOrVocab);
        log("Toggle vocabulary important", snapshot ?? id);
        assertSignedIn();
        const prev = get().vocabularies;
        const toggled = toggleVocabularyFlagInStore(prev, id, "important", snapshot);
        if (!toggled) return;
        const { vocabularies, vocab } = toggled;
        set({ vocabularies });
        patchVocabularyInBrowseCache(id, { important: vocab.important });
        syncMutation(
            async () => {
                const saved = await api.patchVocabularyFlags(id, { important: vocab.important }, snapshot ?? vocab);
                set({ vocabularies: updateVocabularyInList(get().vocabularies, id, saved) });
                patchVocabularyInBrowseCache(id, { important: saved.important });
            },
            { requireAdmin: false },
        ).catch(() => set({ vocabularies: prev }));
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

    toggleMastered: (idOrVocab) => {
        const { id, snapshot } = resolveVocabularyTarget(idOrVocab);
        log("Toggle vocabulary mastered", snapshot ?? id);
        assertSignedIn();
        const prev = get().vocabularies;
        const existing = prev.find((w) => w.id === id) ?? snapshot;
        const toggled = toggleVocabularyFlagInStore(prev, id, "mastered", snapshot);
        if (!toggled) return;
        const { vocabularies, vocab } = toggled;
        const masteredDelta =
            existing && vocab && Boolean(existing.mastered) !== Boolean(vocab.mastered) ? (vocab.mastered ? 1 : -1) : 0;
        const prevMastered = get().masteredVocabularyCount;
        set({
            vocabularies,
            masteredVocabularyCount: Math.max(0, prevMastered + masteredDelta),
        });
        patchVocabularyInBrowseCache(id, { mastered: vocab.mastered });
        syncMutation(
            async () => {
                const saved = await api.patchVocabularyFlags(id, { mastered: vocab.mastered }, snapshot ?? vocab);
                set({ vocabularies: updateVocabularyInList(get().vocabularies, id, saved) });
                patchVocabularyInBrowseCache(id, { mastered: saved.mastered });
            },
            { requireAdmin: false },
        ).catch(() => set({ vocabularies: prev, masteredVocabularyCount: prevMastered }));
    },

    setVocabularyStudyProgress: (idOrVocab, progress, options = {}) => {
        const { id, snapshot } = resolveVocabularyTarget(idOrVocab);
        const clamped = Math.max(0, Math.min(100, Math.round(Number(progress) || 0)));
        const nextMastered = "mastered" in options ? Boolean(options.mastered) : clamped >= 100;
        log("Update vocabulary progress", snapshot ?? id);
        assertSignedIn();
        const prev = get().vocabularies;
        let existing = prev.find((w) => w.id === id);
        if (!existing && snapshot) {
            existing = indexVocabulary(snapshot);
        }
        if (!existing) return;

        const studiedAt = new Date().toISOString();
        const patch = { studyProgress: clamped, mastered: nextMastered, studyProgressAt: studiedAt };
        const nextVocabularies = prev.some((w) => w.id === id)
            ? updateVocabularyInList(prev, id, patch)
            : [...prev, indexVocabulary({ ...existing, ...patch }, prev.length)];

        const masteredDelta = Boolean(existing.mastered) !== Boolean(nextMastered) ? (nextMastered ? 1 : -1) : 0;
        const prevMastered = get().masteredVocabularyCount;
        set({
            vocabularies: nextVocabularies,
            masteredVocabularyCount: Math.max(0, prevMastered + masteredDelta),
        });
        patchVocabularyInBrowseCache(id, patch);
        const vocab = nextVocabularies.find((w) => w.id === id);
        return syncMutation(
            async () => {
                const saved = await api.patchVocabularyFlags(
                    id,
                    { studyProgress: clamped, mastered: nextMastered },
                    snapshot ?? vocab,
                );
                set({ vocabularies: updateVocabularyInList(get().vocabularies, id, saved) });
                patchVocabularyInBrowseCache(id, {
                    studyProgress: saved.studyProgress,
                    studyProgressAt: saved.studyProgressAt,
                    mastered: saved.mastered,
                });
            },
            { requireAdmin: false },
        ).catch(() => set({ vocabularies: prev, masteredVocabularyCount: prevMastered }));
    },

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
        const prevVocabularies = get().vocabularies;
        const removed = prevVocabularies.find((w) => w.id === id);
        const label =
            removed?.hanTraditional || removed?.vietMeanings || removed?.engMeanings || `#${String(id).slice(0, 8)}`;
        logMutStart("Delete vocabulary", label);
        const nextVocabularies = deleteVocabularyFromList(prevVocabularies, id);
        const prevVocabularyTotal = get().vocabularyTotal;
        const prevMastered = get().masteredVocabularyCount;
        const prevRevision = get().vocabulariesRevision;
        set({
            vocabularies: nextVocabularies,
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
            sentencePatterns: [],
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

    createSentence: (item) => {
        log("Create sentence", item);
        assertAdmin();
        const wordIds = findWordIdsInSentence(item, get().vocabularies);
        const entry = indexSentencePattern({ ...item, wordIds });
        const prev = get().sentencePatterns;
        set({ sentencePatterns: [...prev, entry] });
        syncMutation(async () => {
            const saved = await api.createSentencePattern(stripSearchIndex(entry));
            set({
                sentencePatterns: updateSentenceInList(get().sentencePatterns, entry.id, saved),
            });
        }).catch(() => set({ sentencePatterns: prev }));
    },

    createSentenceAwait: async (item) => {
        assertAdmin();
        const prev = get().sentencePatterns;
        const wordIds = findWordIdsInSentence(item, get().vocabularies);
        const entry = indexSentencePattern({ ...item, wordIds }, prev.length);
        set({ sentencePatterns: [...prev, entry] });
        try {
            const saved = await syncMutation(() => api.createSentencePattern(stripSearchIndex(entry)));
            set({
                sentencePatterns: updateSentenceInList(get().sentencePatterns, entry.id, saved),
            });
            return saved;
        } catch (err) {
            set({ sentencePatterns: prev });
            throw err;
        }
    },

    editSentence: (id, patch) => {
        assertAdmin();
        const prev = get().sentencePatterns;
        const existing = prev.find((s) => s.id === id);
        if (!existing) return;

        const hanTraditional = (patch.hanTraditional ?? existing.hanTraditional).trim();
        const hanSimplified = (patch.hanSimplified ?? existing.hanSimplified ?? "").trim();
        const jyutping = (patch.jyutping ?? existing.jyutping ?? "").trim();
        const pinyin = (patch.pinyin ?? existing.pinyin ?? "").trim();
        const vietnamese = (patch.vietnamese ?? existing.vietnamese).trim();
        const english = (patch.english ?? existing.english ?? "").trim();
        const important = "important" in patch ? Boolean(patch.important) : Boolean(existing.important);
        const mastered = "mastered" in patch ? Boolean(patch.mastered) : Boolean(existing.mastered);

        log("Update sentence", existing);
        const merged = {
            ...existing,
            ...patch,
            hanTraditional,
            hanSimplified,
            jyutping,
            pinyin,
            vietnamese,
            english,
            important,
            mastered,
        };
        const wordIds = findWordIdsInSentence(merged, get().vocabularies);
        const sentencePatterns = updateSentenceInList(prev, id, { ...merged, wordIds });
        const item = sentencePatterns.find((s) => s.id === id);
        set({ sentencePatterns });
        if (item) {
            syncMutation(async () => {
                const saved = await api.updateSentencePattern(id, stripSearchIndex(item));
                set({
                    sentencePatterns: updateSentenceInList(get().sentencePatterns, id, saved),
                });
            }).catch(() => set({ sentencePatterns: prev }));
        }
    },

    editSentenceAwait: async (id, patch) => {
        assertAdmin();
        const prev = get().sentencePatterns;
        const existing = prev.find((s) => s.id === id);
        if (!existing) return;

        const hanTraditional = (patch.hanTraditional ?? existing.hanTraditional).trim();
        const hanSimplified = (patch.hanSimplified ?? existing.hanSimplified ?? "").trim();
        const jyutping = (patch.jyutping ?? existing.jyutping ?? "").trim();
        const pinyin = (patch.pinyin ?? existing.pinyin ?? "").trim();
        const vietnamese = (patch.vietnamese ?? existing.vietnamese).trim();
        const english = (patch.english ?? existing.english ?? "").trim();
        const important = "important" in patch ? Boolean(patch.important) : Boolean(existing.important);
        const mastered = "mastered" in patch ? Boolean(patch.mastered) : Boolean(existing.mastered);

        log("Update sentence", existing);
        const merged = {
            ...existing,
            ...patch,
            hanTraditional,
            hanSimplified,
            jyutping,
            pinyin,
            vietnamese,
            english,
            important,
            mastered,
        };
        const wordIds = findWordIdsInSentence(merged, get().vocabularies);
        const sentencePatterns = updateSentenceInList(prev, id, { ...merged, wordIds });
        const item = sentencePatterns.find((s) => s.id === id);
        if (!item) return;
        set({ sentencePatterns });
        try {
            const saved = await syncMutation(() => api.updateSentencePattern(id, stripSearchIndex(item)));
            set({
                sentencePatterns: updateSentenceInList(get().sentencePatterns, id, saved),
            });
            return saved;
        } catch (err) {
            set({ sentencePatterns: prev });
            throw err;
        }
    },

    toggleSentenceImportant: (id) => {
        log("Toggle sentence important", id);
        assertAdmin();
        const prev = get().sentencePatterns;
        const sentencePatterns = toggleSentenceField(prev, id, "important");
        const item = sentencePatterns.find((s) => s.id === id);
        set({ sentencePatterns });
        if (item) {
            syncMutation(() => api.updateSentencePattern(id, stripSearchIndex(item))).catch(() =>
                set({ sentencePatterns: prev }),
            );
        }
    },

    toggleSentenceMastered: (id) => {
        log("Toggle sentence mastered", id);
        assertSignedIn();
        const prev = get().sentencePatterns;
        const sentencePatterns = toggleSentenceField(prev, id, "mastered");
        const item = sentencePatterns.find((s) => s.id === id);
        set({ sentencePatterns });
        if (item) {
            syncMutation(() => api.updateSentencePattern(id, stripSearchIndex(item)), { requireAdmin: false }).catch(
                () => set({ sentencePatterns: prev }),
            );
        }
    },

    removeSentence: (id) => {
        assertAdmin();
        const prev = get().sentencePatterns;
        log("Delete sentence", prev.find((s) => s.id === id) ?? id);
        const sentencePatterns = deleteSentenceFromList(prev, id);
        set({ sentencePatterns });
        syncMutation(() => api.deleteSentencePattern(id)).catch(() => set({ sentencePatterns: prev }));
    },

}));

export const useVocabularies = () => useAppStore((s) => s.vocabularies);
export const useGrammarBank = () => useAppStore((s) => s.grammarBank);
export const useSentencePatterns = () => useAppStore((s) => s.sentencePatterns);
export const useDataLoading = () => useAppStore((s) => s.dataLoading);
export const useDataError = () => useAppStore((s) => s.dataError);
export const useDataHydrated = () => useAppStore((s) => s.hydrated);
export const useVocabularyCount = () => useAppStore((s) => s.vocabularyTotal);
export const useVocabulariesRevision = () => useAppStore((s) => s.vocabulariesRevision);
export const useHanCharacters = () => useAppStore((s) => s.hanCharacters);
export const useHanCharacterTotal = () => useAppStore((s) => s.hanCharacterTotal);
export const useHanCharactersRevision = () => useAppStore((s) => s.hanCharactersRevision);
export const useGrammarCount = () => useAppStore((s) => s.grammarBank.length);
export const useSentenceCount = () => useAppStore((s) => s.sentencePatterns.length);
export const useMasteredVocabularyCount = () => useAppStore((s) => s.masteredVocabularyCount);

export const useAppActions = () =>
    useAppStore(
        useShallow((s) => ({
            createVocabulary: s.createVocabulary,
            createVocabularyAwait: s.createVocabularyAwait,
            createGrammar: s.createGrammar,
            createGrammarAwait: s.createGrammarAwait,
            createSentence: s.createSentence,
            createSentenceAwait: s.createSentenceAwait,
            editVocabulary: s.editVocabulary,
            editGrammar: s.editGrammar,
            editSentence: s.editSentence,
            editSentenceAwait: s.editSentenceAwait,
            toggleImportant: s.toggleImportant,
            toggleGrammarImportant: s.toggleGrammarImportant,
            toggleSentenceImportant: s.toggleSentenceImportant,
            toggleMastered: s.toggleMastered,
            setVocabularyStudyProgress: s.setVocabularyStudyProgress,
            toggleGrammarMastered: s.toggleGrammarMastered,
            toggleSentenceMastered: s.toggleSentenceMastered,
            removeVocabulary: s.removeVocabulary,
            removeGrammar: s.removeGrammar,
            removeSentence: s.removeSentence,
            hydrateFromCloud: s.hydrateFromCloud,
            clearData: s.clearData,
            mergeVocabularies: s.mergeVocabularies,
            ensureVocabulariesByIds: s.ensureVocabulariesByIds,
            syncHanVariantsAll: s.syncHanVariantsAll,
            syncPinyinAll: s.syncPinyinAll,
            syncJyutpingAll: s.syncJyutpingAll,
            mergeHanCharacters: s.mergeHanCharacters,
            removeHanCharacter: s.removeHanCharacter,
            bumpHanCharactersRevision: s.bumpHanCharactersRevision,
            editHanCharacter: s.editHanCharacter,
            refreshHanCharacters: s.refreshHanCharacters,
        })),
    );
