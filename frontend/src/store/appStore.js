import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import {
  createLessonEntity,
  deleteGrammarFromList,
  deleteLessonFromList,
  deleteSentenceFromList,
  deleteWordFromList,
  indexCloudPayload,
  indexGrammarItem,
  indexSentencePattern,
  indexWord,
  migrateLesson,
  stripSearchIndex,
  toggleGrammarField,
  toggleLessonGrammarMasteredInList,
  toggleSentenceField,
  toggleWordField,
  updateGrammarInList,
  updateLessonInList,
  updateSentenceInList,
  updateWordInList,
} from '../lib/dataTransforms.js'
import { invalidateWordBrowseCache, patchWordInBrowseCache } from '../lib/wordBrowseCache.js'
import { api } from '../lib/api.js'
import { INITIAL_WORD_PAGES, PAGE_SIZE, WORD_FETCH_PAGE_SIZE } from '../lib/constants.js'
import { log, logWarn, logError } from '../lib/actionLog.js'
import { normalizeWordFields, wordContentEqual } from '../lib/wordNormalize.js'
import { normalizePopularity } from '../lib/wordPopularity.js'
import { useAuthStore } from './authStore.js'
import { findWordIdsInSentence } from '../lib/sentencePatternMatch.js'

const LEGACY_DATA_KEY = 'cantonese-app-data'

/** Dedupe concurrent full word-bank loads. */
let loadAllWordsPromise = null
/** Dedupe concurrent cloud hydrates (e.g. React Strict Mode). */
let hydrateFromCloudPromise = null

function assertAdmin() {
  if (!useAuthStore.getState().user?.isAdmin) {
    throw new Error('Admin only')
  }
}

function assertSignedIn() {
  if (!useAuthStore.getState().user) {
    throw new Error('Sign in required')
  }
}

function resolveWordTarget(idOrWord) {
  if (idOrWord && typeof idOrWord === 'object') {
    return { id: idOrWord.id, snapshot: idOrWord }
  }
  return { id: idOrWord, snapshot: undefined }
}

function wordTimeMs(word) {
  const value = word?.updatedAt ?? word?.createdAt
  const ms = Date.parse(String(value ?? ''))
  return Number.isFinite(ms) ? ms : 0
}

function toggleWordFlagInStore(words, id, field, snapshot) {
  let existing = words.find((w) => w.id === id)
  if (!existing && snapshot) {
    existing = indexWord(snapshot)
  }
  if (!existing) return null

  const nextWords = words.some((w) => w.id === id)
    ? toggleWordField(words, id, field)
    : [...words, indexWord({ ...existing, [field]: !existing[field] }, words.length)]

  return {
    words: nextWords,
    word: nextWords.find((w) => w.id === id),
  }
}

async function syncMutation(action, { requireAdmin = true } = {}) {
  if (requireAdmin) assertAdmin()
  else assertSignedIn()
  try {
    return await action()
  } catch (err) {
    logWarn("Cloud sync failed", err instanceof Error ? err.message : err)
    throw err
  }
}

async function migrateLegacyLocalIfNeeded() {
  const user = useAuthStore.getState().user
  if (!user?.isAdmin) return

  const raw = localStorage.getItem(LEGACY_DATA_KEY)
  if (!raw) return

  try {
    const parsed = JSON.parse(raw)
    const hasLocal =
      (parsed.words?.length ?? 0) > 0 ||
      (parsed.grammarBank?.length ?? 0) > 0 ||
      (parsed.lessons?.length ?? 0) > 0

    if (hasLocal) {
      log("Migrate legacy data")
      const remote = await api.fetchFromCloud()
      const cloudEmpty =
        (remote.words?.length ?? 0) === 0 &&
        (remote.grammarBank?.length ?? 0) === 0 &&
        (remote.lessons?.length ?? 0) === 0

      if (cloudEmpty) {
        await api.uploadToCloud({
          types: ['words', 'grammar', 'lessons'],
          words: parsed.words ?? [],
          grammarBank: parsed.grammarBank ?? [],
          lessons: parsed.lessons ?? [],
        })
      }
    }

    localStorage.removeItem(LEGACY_DATA_KEY)
  } catch (err) {
    logWarn("Legacy migration failed", err instanceof Error ? err.message : err)
  }
}

export const useAppStore = create((set, get) => ({
  words: [],
  wordTotal: 0,
  masteredWordCount: 0,
  wordsRevision: 0,
  wordsFullyLoaded: false,
  wordsLoadingAll: false,
  grammarBank: [],
  sentencePatterns: [],
  lessons: [],
  dataLoading: false,
  dataError: null,
  hydrated: false,

  clearData: () => {
    log("Clear app data")
    set({
      words: [],
      wordTotal: 0,
      masteredWordCount: 0,
      wordsRevision: 0,
      wordsFullyLoaded: false,
      wordsLoadingAll: false,
      grammarBank: [],
      sentencePatterns: [],
      lessons: [],
      dataLoading: false,
      dataError: null,
      hydrated: false,
    })
  },

  hydrateFromCloud: async () => {
    if (hydrateFromCloudPromise) return hydrateFromCloudPromise

    hydrateFromCloudPromise = (async () => {
      log("Get app data")
      set({ dataLoading: true, dataError: null })
      try {
        if (useAuthStore.getState().user?.isAdmin) {
          await migrateLegacyLocalIfNeeded()
        }
        const remote = await api.fetchFromCloud({
          wordPages: INITIAL_WORD_PAGES,
          wordPageSize: PAGE_SIZE,
        })
        const indexed = indexCloudPayload({
          words: remote.words ?? [],
          grammarBank: remote.grammarBank ?? [],
          lessons: remote.lessons ?? [],
          sentencePatterns: remote.sentencePatterns ?? [],
        })
        set({
          ...indexed,
          wordTotal: remote.wordTotal ?? indexed.words.length,
          masteredWordCount: remote.masteredWordCount ?? 0,
          wordsFullyLoaded:
            (remote.wordTotal ?? indexed.words.length) > 0 &&
            indexed.words.length >= (remote.wordTotal ?? indexed.words.length),
          wordsLoadingAll: false,
          dataLoading: false,
          dataError: null,
          hydrated: true,
        })
        log("Get app data done", remote.wordTotal ?? indexed.words.length)
      } catch (err) {
        logError("Get app data failed", err instanceof Error ? err.message : String(err))
        set({
          dataLoading: false,
          dataError: err instanceof Error ? err.message : 'Failed to load data',
          hydrated: false,
        })
        throw err
      } finally {
        hydrateFromCloudPromise = null
      }
    })()

    return hydrateFromCloudPromise
  },

  createWord: (word) => {
    log("Create word", word)
    assertAdmin()
    const prev = get().words
    const item = indexWord(word, prev.length)
    set({ words: [...prev, item], wordTotal: get().wordTotal + 1 })
    syncMutation(async () => {
      const saved = await api.createWord(stripSearchIndex(item))
      invalidateWordBrowseCache()
      set({
        words: updateWordInList(get().words, item.id, { ...saved, _sortSeq: item._sortSeq }),
        wordsRevision: get().wordsRevision + 1,
      })
    }).catch(() => set({ words: prev, wordTotal: Math.max(0, get().wordTotal - 1) }))
  },

  createWordAwait: async (word) => {
    assertAdmin()
    const prev = get().words
    const item = indexWord(normalizeWordFields(word), prev.length)
    set({ words: [...prev, item], wordTotal: get().wordTotal + 1 })
    try {
      const saved = await api.createWord(stripSearchIndex(item))
      invalidateWordBrowseCache()
      set({
        words: updateWordInList(get().words, item.id, { ...saved, _sortSeq: item._sortSeq }),
        wordsRevision: get().wordsRevision + 1,
        wordTotal: get().wordTotal,
      })
      return saved
    } catch (err) {
      set({ words: prev, wordTotal: Math.max(0, get().wordTotal - 1) })
      throw err
    }
  },

  createGrammar: (item) => {
    log("Create grammar", item)
    assertAdmin()
    const entry = indexGrammarItem(item)
    const prev = get().grammarBank
    set({ grammarBank: [...prev, entry] })
    syncMutation(() => api.createGrammar(stripSearchIndex(entry))).catch(() => set({ grammarBank: prev }))
  },

  createGrammarAwait: async (item) => {
    assertAdmin()
    const title = item.title?.trim() ?? ''
    const content = item.content?.trim() ?? ''
    const prev = get().grammarBank
    const existing = prev.find(
      (g) => g.title?.trim() === title && g.content?.trim() === content,
    )
    if (existing) return existing

    const entry = indexGrammarItem(item, prev.length)
    set({ grammarBank: [...prev, entry] })
    try {
      const saved = await api.createGrammar(stripSearchIndex(entry))
      set({
        grammarBank: updateGrammarInList(get().grammarBank, entry.id, saved),
      })
      return saved
    } catch (err) {
      set({ grammarBank: prev })
      throw err
    }
  },

  editWord: (idOrWord, patch) => {
    assertAdmin()
    const { id, snapshot } = resolveWordTarget(idOrWord)
    const prev = get().words
    let existing = prev.find((w) => w.id === id)
    if (!existing && snapshot) {
      existing = indexWord(snapshot)
    }
    if (!existing) return

    const merged = normalizeWordFields({ ...existing, ...patch })
    if (wordContentEqual(existing, merged)) return

    log("Update word", existing)
    let nextWords = prev.some((w) => w.id === id)
      ? updateWordInList(prev, id, { ...patch, updatedAt: new Date().toISOString() })
      : [...prev, indexWord({ ...existing, ...patch, updatedAt: new Date().toISOString() }, prev.length)]

    const word = nextWords.find((w) => w.id === id)
    set({ words: nextWords })
    if (word) {
      patchWordInBrowseCache(id, {
        english: word.english,
        hanTraditional: word.hanTraditional,
        vietnamese: word.vietnamese,
        hanViet: word.hanViet,
        jyutping: word.jyutping,
        vietnameseDetail: word.vietnameseDetail,
        important: word.important,
      })
      syncMutation(async () => {
        const current = get().words.find((w) => w.id === id)
        if (!current) return
        const saved = await api.updateWord(id, stripSearchIndex(current))
        set({ words: updateWordInList(get().words, id, saved) })
        patchWordInBrowseCache(id, {
          english: saved.english,
          hanTraditional: saved.hanTraditional,
          vietnamese: saved.vietnamese,
          hanViet: saved.hanViet,
          jyutping: saved.jyutping,
          vietnameseDetail: saved.vietnameseDetail,
          important: saved.important,
        })
      }).catch(() => set({ words: prev }))
    }
  },

  syncHanVietAll: async (updates, { onProgress, signal } = {}) => {
    assertAdmin()
    if (!updates?.length) return { updated: 0, cancelled: false }

    let completed = 0
    const total = updates.length

    for (const update of updates) {
      if (signal?.aborted) {
        return { updated: completed, cancelled: true }
      }

      onProgress?.({ done: completed, total, current: update })

      const nextWords = updateWordInList(get().words, update.id, {
        hanViet: update.hanViet,
        updatedAt: new Date().toISOString(),
      })
      set({ words: nextWords })
      patchWordInBrowseCache(update.id, { hanViet: update.hanViet })

      await syncMutation(async () => {
        if (signal?.aborted) return
        const current = get().words.find((w) => w.id === update.id)
        if (!current) return
        const saved = await api.updateWord(update.id, stripSearchIndex(current))
        set({ words: updateWordInList(get().words, update.id, saved) })
        patchWordInBrowseCache(update.id, { hanViet: saved.hanViet })
      })

      if (signal?.aborted) {
        return { updated: completed, cancelled: true }
      }

      completed++
      onProgress?.({ done: completed, total })
    }

    return { updated: completed, cancelled: false }
  },

  syncHanVariantsAll: async () => {
    assertAdmin()
    const result = await api.backfillHanVariants()
    invalidateWordBrowseCache()

    const { wordTotal, wordsFullyLoaded } = get()
    if (wordTotal > 0 && wordsFullyLoaded) {
      set({ wordsFullyLoaded: false })
      await get().ensureAllWordsLoaded()
    } else {
      set((s) => ({
        words: s.words.map((w) => normalizeWordFields(w)),
      }))
    }

    set((s) => ({ wordsRevision: s.wordsRevision + 1 }))
    return result
  },

  syncPinyinAll: async () => {
    assertAdmin()
    const result = await api.backfillPinyin()
    invalidateWordBrowseCache()

    const { wordTotal, wordsFullyLoaded } = get()
    if (wordTotal > 0 && wordsFullyLoaded) {
      set({ wordsFullyLoaded: false })
      await get().ensureAllWordsLoaded()
    } else {
      set((s) => ({
        words: s.words.map((w) => normalizeWordFields(w)),
      }))
    }

    set((s) => ({ wordsRevision: s.wordsRevision + 1 }))
    return result
  },

  editGrammar: (id, patch) => {
    assertAdmin()
    const prev = get().grammarBank
    const existing = prev.find((g) => g.id === id)
    if (!existing) return

    const title = (patch.title ?? existing.title).trim()
    const content = (patch.content ?? existing.content).trim()
    const important = 'important' in patch ? Boolean(patch.important) : Boolean(existing.important)
    const mastered = 'mastered' in patch ? Boolean(patch.mastered) : Boolean(existing.mastered)
    if (
      title === existing.title.trim() &&
      content === existing.content.trim() &&
      important === Boolean(existing.important) &&
      mastered === Boolean(existing.mastered)
    ) return

    log("Update grammar", existing)
    const grammarBank = updateGrammarInList(prev, id, { ...patch, title, content, important, mastered })
    const item = grammarBank.find((g) => g.id === id)
    set({ grammarBank })
    if (item) {
      syncMutation(() => api.updateGrammar(id, stripSearchIndex(item))).catch(() => set({ grammarBank: prev }))
    }
  },

  toggleImportant: (idOrWord) => {
    const { id, snapshot } = resolveWordTarget(idOrWord)
    log("Toggle word important", snapshot ?? id)
    assertSignedIn()
    const prev = get().words
    const toggled = toggleWordFlagInStore(prev, id, 'important', snapshot)
    if (!toggled) return
    const { words, word } = toggled
    set({ words })
    patchWordInBrowseCache(id, { important: word.important })
    syncMutation(
      async () => {
        const saved = await api.patchWordFlags(id, { important: word.important }, snapshot ?? word)
        set({ words: updateWordInList(get().words, id, saved) })
        patchWordInBrowseCache(id, { important: saved.important })
      },
      { requireAdmin: false },
    ).catch(() => set({ words: prev }))
  },

  toggleGrammarImportant: (id) => {
    log("Toggle grammar important", id)
    assertAdmin()
    const prev = get().grammarBank
    const grammarBank = toggleGrammarField(prev, id, 'important')
    const item = grammarBank.find((g) => g.id === id)
    set({ grammarBank })
    if (item) {
      syncMutation(() => api.updateGrammar(id, stripSearchIndex(item))).catch(() => set({ grammarBank: prev }))
    }
  },

  toggleMastered: (idOrWord) => {
    const { id, snapshot } = resolveWordTarget(idOrWord)
    log("Toggle word mastered", snapshot ?? id)
    assertSignedIn()
    const prev = get().words
    const existing = prev.find((w) => w.id === id) ?? snapshot
    const toggled = toggleWordFlagInStore(prev, id, 'mastered', snapshot)
    if (!toggled) return
    const { words, word } = toggled
    const masteredDelta =
      existing && word && Boolean(existing.mastered) !== Boolean(word.mastered)
        ? word.mastered
          ? 1
          : -1
        : 0
    const prevMastered = get().masteredWordCount
    set({
      words,
      masteredWordCount: Math.max(0, prevMastered + masteredDelta),
    })
    patchWordInBrowseCache(id, { mastered: word.mastered })
    syncMutation(
      async () => {
        const saved = await api.patchWordFlags(id, { mastered: word.mastered }, snapshot ?? word)
        set({ words: updateWordInList(get().words, id, saved) })
        patchWordInBrowseCache(id, { mastered: saved.mastered })
      },
      { requireAdmin: false },
    ).catch(() => set({ words: prev, masteredWordCount: prevMastered }))
  },

  setWordStudyProgress: (idOrWord, progress, options = {}) => {
    const { id, snapshot } = resolveWordTarget(idOrWord)
    const clamped = Math.max(0, Math.min(100, Math.round(Number(progress) || 0)))
    const nextMastered =
      'mastered' in options ? Boolean(options.mastered) : clamped >= 100
    log("Update word progress", snapshot ?? id)
    assertSignedIn()
    const prev = get().words
    let existing = prev.find((w) => w.id === id)
    if (!existing && snapshot) {
      existing = indexWord(snapshot)
    }
    if (!existing) return

    const studiedAt = new Date().toISOString()
    const patch = { studyProgress: clamped, mastered: nextMastered, studyProgressAt: studiedAt }
    const nextWords = prev.some((w) => w.id === id)
      ? updateWordInList(prev, id, patch)
      : [...prev, indexWord({ ...existing, ...patch }, prev.length)]

    const masteredDelta =
      Boolean(existing.mastered) !== Boolean(nextMastered) ? (nextMastered ? 1 : -1) : 0
    const prevMastered = get().masteredWordCount
    set({
      words: nextWords,
      masteredWordCount: Math.max(0, prevMastered + masteredDelta),
    })
    patchWordInBrowseCache(id, patch)
    const word = nextWords.find((w) => w.id === id)
    return syncMutation(
      async () => {
        const saved = await api.patchWordFlags(
          id,
          { studyProgress: clamped, mastered: nextMastered },
          snapshot ?? word,
        )
        set({ words: updateWordInList(get().words, id, saved) })
        patchWordInBrowseCache(id, {
          studyProgress: saved.studyProgress,
          studyProgressAt: saved.studyProgressAt,
          mastered: saved.mastered,
        })
      },
      { requireAdmin: false },
    ).catch(() => set({ words: prev, masteredWordCount: prevMastered }))
  },

  setWordPopularity: (idOrWord, level) => {
    const { id, snapshot } = resolveWordTarget(idOrWord)
    const popularity = normalizePopularity(level)
    log("Update word popularity", snapshot ?? id)
    assertSignedIn()
    const prev = get().words
    let existing = prev.find((w) => w.id === id)
    if (!existing && snapshot) {
      existing = indexWord(snapshot)
    }
    if (!existing) return

    const nextWords = prev.some((w) => w.id === id)
      ? updateWordInList(prev, id, { popularity: popularity ?? undefined })
      : [...prev, indexWord({ ...existing, popularity: popularity ?? undefined }, prev.length)]

    const word = nextWords.find((w) => w.id === id)
    set({ words: nextWords })
    patchWordInBrowseCache(id, { popularity: word?.popularity })
    return syncMutation(
      async () => {
        const saved = await api.patchWordFlags(id, { popularity: popularity ?? null }, snapshot ?? word)
        set({ words: updateWordInList(get().words, id, saved) })
        patchWordInBrowseCache(id, { popularity: saved.popularity })
      },
      { requireAdmin: false },
    ).catch((err) => {
      logWarn("Update word popularity failed", err instanceof Error ? err.message : err)
      set({ words: prev })
      patchWordInBrowseCache(id, { popularity: existing.popularity })
      throw err
    })
  },

  toggleGrammarMastered: (id) => {
    log("Toggle grammar mastered", id)
    assertSignedIn()
    const prev = get().grammarBank
    const grammarBank = toggleGrammarField(prev, id, 'mastered')
    const item = grammarBank.find((g) => g.id === id)
    set({ grammarBank })
    if (item) {
      syncMutation(() => api.updateGrammar(id, stripSearchIndex(item)), { requireAdmin: false }).catch(() =>
        set({ grammarBank: prev }),
      )
    }
  },

  toggleLessonGrammarMastered: (lessonId, grammarId) => {
    log("Toggle lesson grammar mastered", grammarId)
    assertSignedIn()
    const prev = get().lessons
    const lessons = toggleLessonGrammarMasteredInList(prev, lessonId, grammarId)
    const lesson = lessons.find((l) => l.id === lessonId)
    set({ lessons })
    if (lesson) {
      syncMutation(() => api.updateLesson(lessonId, lesson), { requireAdmin: false }).catch(() =>
        set({ lessons: prev }),
      )
    }
  },

  removeWord: (id) => {
    assertAdmin()
    const { words: prevWords, lessons: prevLessons } = get()
    const removed = prevWords.find((w) => w.id === id)
    log("Delete word", removed ?? id)
    const next = deleteWordFromList(prevWords, prevLessons, id)
    const prevWordTotal = get().wordTotal
    const prevMastered = get().masteredWordCount
    const prevRevision = get().wordsRevision
    set({
      ...next,
      wordTotal: Math.max(0, prevWordTotal - 1),
      masteredWordCount: removed?.mastered ? Math.max(0, prevMastered - 1) : prevMastered,
      wordsRevision: prevRevision + 1,
    })
    syncMutation(() => api.deleteWord(id)).catch(() =>
      set({
        words: prevWords,
        lessons: prevLessons,
        wordTotal: prevWordTotal,
        masteredWordCount: prevMastered,
        wordsRevision: prevRevision,
      }),
    )
  },

  mergeWords: (incoming) => {
    if (!incoming?.length) return
    set((s) => {
      const byId = new Map(s.words.map((w) => [w.id, w]))
      for (const raw of incoming) {
        const existing = byId.get(raw.id)
        const keepExistingContent = existing && wordTimeMs(existing) > wordTimeMs(raw)
        const incomingNewer = !existing || wordTimeMs(raw) >= wordTimeMs(existing)
        const payload = existing
          ? {
              ...raw,
              ...(keepExistingContent
                ? {
                    english: existing.english,
                    hanTraditional: existing.hanTraditional,
                    hanSimplified: existing.hanSimplified,
                    vietnamese: existing.vietnamese,
                    hanViet: existing.hanViet,
                    jyutping: existing.jyutping,
                    vietnameseDetail: existing.vietnameseDetail,
                    updatedAt: existing.updatedAt,
                  }
                : {}),
              important: incomingNewer ? Boolean(raw.important) : Boolean(existing.important),
              mastered: incomingNewer ? Boolean(raw.mastered) : Boolean(existing.mastered),
              vietnameseDetail:
                keepExistingContent
                  ? existing.vietnameseDetail
                  : 'vietnameseDetail' in raw
                    ? raw.vietnameseDetail || undefined
                    : existing?.vietnameseDetail,
              popularity:
                incomingNewer && 'popularity' in raw
                  ? raw.popularity ?? undefined
                  : existing?.popularity ?? raw?.popularity,
            }
          : raw
        byId.set(raw.id, indexWord(payload, existing?._sortSeq ?? byId.size))
      }
      const words = Array.from(byId.values())
      return {
        words,
        wordsFullyLoaded: s.wordTotal > 0 && words.length >= s.wordTotal,
      }
    })
  },

  ensureWordsByIds: async (ids) => {
    const list = [...new Set((ids ?? []).map(String).filter(Boolean))]
    if (list.length === 0) return
    const loaded = new Set(get().words.map((w) => String(w.id)))
    const missing = list.filter((id) => !loaded.has(id))
    if (missing.length === 0) return
    const fetched = await api.fetchWordsByIds(missing)
    get().mergeWords(fetched)
  },

  ensureAllWordsLoaded: async () => {
    const { wordTotal, words, wordsFullyLoaded } = get()
    if (wordTotal === 0) return words
    if (wordsFullyLoaded) return words
    if (loadAllWordsPromise) return loadAllWordsPromise

    loadAllWordsPromise = (async () => {
      log("Load all words", `${words.length}/${wordTotal}`)
      set({ wordsLoadingAll: true })
      try {
        const byId = new Map(get().words.map((w) => [w.id, w]))
        const pageSize = WORD_FETCH_PAGE_SIZE
        const totalPages = Math.max(1, Math.ceil(wordTotal / pageSize))

        for (let page = 1; page <= totalPages; page++) {
          const result = await api.browseWords({
            page,
            pageSize,
            sortKey: 'createdAt',
            sortDir: 'desc',
          })
          for (const raw of result.items ?? []) {
            const existing = byId.get(raw.id)
            byId.set(raw.id, indexWord(raw, existing?._sortSeq ?? byId.size))
          }
        }

        const allWords = Array.from(byId.values())
        set({
          words: allWords,
          wordsFullyLoaded: allWords.length >= wordTotal,
          wordsLoadingAll: false,
        })
        log("Load all words done", `${allWords.length}/${wordTotal}`)
        return allWords
      } catch (err) {
        set({ wordsLoadingAll: false })
        throw err
      } finally {
        loadAllWordsPromise = null
      }
    })()

    return loadAllWordsPromise
  },

  removeGrammar: (id) => {
    assertAdmin()
    const prev = get().grammarBank
    log("Delete grammar", prev.find((g) => g.id === id) ?? id)
    const grammarBank = deleteGrammarFromList(prev, id)
    set({ grammarBank })
    syncMutation(() => api.deleteGrammar(id)).catch(() => set({ grammarBank: prev }))
  },

  createSentence: (item) => {
    log("Create sentence", item)
    assertAdmin()
    const wordIds = findWordIdsInSentence(item, get().words)
    const entry = indexSentencePattern({ ...item, wordIds })
    const prev = get().sentencePatterns
    set({ sentencePatterns: [...prev, entry] })
    syncMutation(async () => {
      const saved = await api.createSentencePattern(stripSearchIndex(entry))
      set({
        sentencePatterns: updateSentenceInList(get().sentencePatterns, entry.id, saved),
      })
    }).catch(() => set({ sentencePatterns: prev }))
  },

  createSentenceAwait: async (item) => {
    assertAdmin()
    const prev = get().sentencePatterns
    const wordIds = findWordIdsInSentence(item, get().words)
    const entry = indexSentencePattern({ ...item, wordIds }, prev.length)
    set({ sentencePatterns: [...prev, entry] })
    try {
      const saved = await syncMutation(() => api.createSentencePattern(stripSearchIndex(entry)))
      set({
        sentencePatterns: updateSentenceInList(get().sentencePatterns, entry.id, saved),
      })
      return saved
    } catch (err) {
      set({ sentencePatterns: prev })
      throw err
    }
  },

  editSentence: (id, patch) => {
    assertAdmin()
    const prev = get().sentencePatterns
    const existing = prev.find((s) => s.id === id)
    if (!existing) return

    const hanTraditional = (patch.hanTraditional ?? existing.hanTraditional).trim()
    const hanSimplified = (patch.hanSimplified ?? existing.hanSimplified ?? '').trim()
    const jyutping = (patch.jyutping ?? existing.jyutping ?? '').trim()
    const pinyin = (patch.pinyin ?? existing.pinyin ?? '').trim()
    const vietnamese = (patch.vietnamese ?? existing.vietnamese).trim()
    const english = (patch.english ?? existing.english ?? '').trim()
    const important = 'important' in patch ? Boolean(patch.important) : Boolean(existing.important)
    const mastered = 'mastered' in patch ? Boolean(patch.mastered) : Boolean(existing.mastered)

    log("Update sentence", existing)
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
    }
    const wordIds = findWordIdsInSentence(merged, get().words)
    const sentencePatterns = updateSentenceInList(prev, id, { ...merged, wordIds })
    const item = sentencePatterns.find((s) => s.id === id)
    set({ sentencePatterns })
    if (item) {
      syncMutation(async () => {
        const saved = await api.updateSentencePattern(id, stripSearchIndex(item))
        set({
          sentencePatterns: updateSentenceInList(get().sentencePatterns, id, saved),
        })
      }).catch(() => set({ sentencePatterns: prev }))
    }
  },

  editSentenceAwait: async (id, patch) => {
    assertAdmin()
    const prev = get().sentencePatterns
    const existing = prev.find((s) => s.id === id)
    if (!existing) return

    const hanTraditional = (patch.hanTraditional ?? existing.hanTraditional).trim()
    const hanSimplified = (patch.hanSimplified ?? existing.hanSimplified ?? '').trim()
    const jyutping = (patch.jyutping ?? existing.jyutping ?? '').trim()
    const pinyin = (patch.pinyin ?? existing.pinyin ?? '').trim()
    const vietnamese = (patch.vietnamese ?? existing.vietnamese).trim()
    const english = (patch.english ?? existing.english ?? '').trim()
    const important = 'important' in patch ? Boolean(patch.important) : Boolean(existing.important)
    const mastered = 'mastered' in patch ? Boolean(patch.mastered) : Boolean(existing.mastered)

    log("Update sentence", existing)
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
    }
    const wordIds = findWordIdsInSentence(merged, get().words)
    const sentencePatterns = updateSentenceInList(prev, id, { ...merged, wordIds })
    const item = sentencePatterns.find((s) => s.id === id)
    if (!item) return
    set({ sentencePatterns })
    try {
      const saved = await syncMutation(() => api.updateSentencePattern(id, stripSearchIndex(item)))
      set({
        sentencePatterns: updateSentenceInList(get().sentencePatterns, id, saved),
      })
      return saved
    } catch (err) {
      set({ sentencePatterns: prev })
      throw err
    }
  },

  toggleSentenceImportant: (id) => {
    log("Toggle sentence important", id)
    assertAdmin()
    const prev = get().sentencePatterns
    const sentencePatterns = toggleSentenceField(prev, id, 'important')
    const item = sentencePatterns.find((s) => s.id === id)
    set({ sentencePatterns })
    if (item) {
      syncMutation(() => api.updateSentencePattern(id, stripSearchIndex(item))).catch(() =>
        set({ sentencePatterns: prev }),
      )
    }
  },

  toggleSentenceMastered: (id) => {
    log("Toggle sentence mastered", id)
    assertSignedIn()
    const prev = get().sentencePatterns
    const sentencePatterns = toggleSentenceField(prev, id, 'mastered')
    const item = sentencePatterns.find((s) => s.id === id)
    set({ sentencePatterns })
    if (item) {
      syncMutation(() => api.updateSentencePattern(id, stripSearchIndex(item)), { requireAdmin: false }).catch(
        () => set({ sentencePatterns: prev }),
      )
    }
  },

  removeSentence: (id) => {
    assertAdmin()
    const prev = get().sentencePatterns
    log("Delete sentence", prev.find((s) => s.id === id) ?? id)
    const sentencePatterns = deleteSentenceFromList(prev, id)
    set({ sentencePatterns })
    syncMutation(() => api.deleteSentencePattern(id)).catch(() => set({ sentencePatterns: prev }))
  },

  addLesson: (name, wordIds, grammar) => {
    log("Create lesson", name)
    assertAdmin()
    const lesson = createLessonEntity(name, wordIds, grammar)
    const prev = get().lessons
    set({ lessons: [...prev, lesson] })
    syncMutation(() => api.createLesson(lesson)).catch(() => set({ lessons: prev }))
    return lesson
  },

  addLessonAwait: async (name, wordIds, grammar) => {
    log("Create lesson", name)
    assertAdmin()
    const lesson = createLessonEntity(name, wordIds, grammar)
    const prev = get().lessons
    set({ lessons: [...prev, lesson] })
    try {
      const saved = await syncMutation(() => api.createLesson(lesson))
      if (!saved) return lesson
      const migrated = migrateLesson(saved)
      set({ lessons: updateLessonInList(get().lessons, lesson.id, migrated) })
      return migrated
    } catch (err) {
      set({ lessons: prev })
      throw err
    }
  },

  editLesson: (id, patch) => {
    log("Update lesson", patch?.name ?? id)
    assertAdmin()
    const prev = get().lessons
    const lessons = updateLessonInList(prev, id, patch)
    const lesson = lessons.find((l) => l.id === id)
    set({ lessons })
    if (lesson) {
      syncMutation(() => api.updateLesson(id, lesson)).catch(() => set({ lessons: prev }))
    }
  },

  editLessonAwait: async (id, patch) => {
    log("Update lesson", patch?.name ?? id)
    assertAdmin()
    const prev = get().lessons
    const lessons = updateLessonInList(prev, id, patch)
    const lesson = lessons.find((l) => l.id === id)
    if (!lesson) return
    set({ lessons })
    try {
      const saved = await syncMutation(() => api.updateLesson(id, lesson))
      if (!saved) return lesson
      const migrated = migrateLesson(saved)
      set({ lessons: updateLessonInList(get().lessons, id, migrated) })
      return migrated
    } catch (err) {
      set({ lessons: prev })
      throw err
    }
  },

  removeLesson: (id) => {
    assertAdmin()
    const prev = get().lessons
    log("Delete lesson", prev.find((l) => l.id === id) ?? id)
    const lessons = deleteLessonFromList(prev, id)
    set({ lessons })
    syncMutation(() => api.deleteLesson(id)).catch(() => set({ lessons: prev }))
  },

  getLesson: (id) => get().lessons.find((l) => l.id === id),
}))

export const useWords = () => useAppStore((s) => s.words)
export const useGrammarBank = () => useAppStore((s) => s.grammarBank)
export const useSentencePatterns = () => useAppStore((s) => s.sentencePatterns)
export const useLessons = () => useAppStore((s) => s.lessons)
export const useDataLoading = () => useAppStore((s) => s.dataLoading)
export const useDataError = () => useAppStore((s) => s.dataError)
export const useDataHydrated = () => useAppStore((s) => s.hydrated)
export const useWordCount = () => useAppStore((s) => s.wordTotal)
export const useWordsRevision = () => useAppStore((s) => s.wordsRevision)
export const useWordsFullyLoaded = () => useAppStore((s) => s.wordsFullyLoaded)
export const useWordsLoadingAll = () => useAppStore((s) => s.wordsLoadingAll)
export const useGrammarCount = () => useAppStore((s) => s.grammarBank.length)
export const useSentenceCount = () => useAppStore((s) => s.sentencePatterns.length)
export const useLessonCount = () => useAppStore((s) => s.lessons.length)
export const useMasteredWordCount = () => useAppStore((s) => s.masteredWordCount)
export const useLesson = (id) =>
  useAppStore((s) => (id ? s.lessons.find((l) => l.id === id) : undefined))

export const useAppActions = () =>
  useAppStore(
    useShallow((s) => ({
      createWord: s.createWord,
      createWordAwait: s.createWordAwait,
      createGrammar: s.createGrammar,
      createGrammarAwait: s.createGrammarAwait,
      createSentence: s.createSentence,
      createSentenceAwait: s.createSentenceAwait,
      editWord: s.editWord,
      editGrammar: s.editGrammar,
      editSentence: s.editSentence,
      editSentenceAwait: s.editSentenceAwait,
      toggleImportant: s.toggleImportant,
      toggleGrammarImportant: s.toggleGrammarImportant,
      toggleSentenceImportant: s.toggleSentenceImportant,
      toggleMastered: s.toggleMastered,
      setWordStudyProgress: s.setWordStudyProgress,
      setWordPopularity: s.setWordPopularity,
      toggleGrammarMastered: s.toggleGrammarMastered,
      toggleSentenceMastered: s.toggleSentenceMastered,
      toggleLessonGrammarMastered: s.toggleLessonGrammarMastered,
      removeWord: s.removeWord,
      removeGrammar: s.removeGrammar,
      removeSentence: s.removeSentence,
      addLesson: s.addLesson,
      addLessonAwait: s.addLessonAwait,
      editLesson: s.editLesson,
      editLessonAwait: s.editLessonAwait,
      removeLesson: s.removeLesson,
      hydrateFromCloud: s.hydrateFromCloud,
      clearData: s.clearData,
      getLesson: s.getLesson,
      mergeWords: s.mergeWords,
      ensureWordsByIds: s.ensureWordsByIds,
      ensureAllWordsLoaded: s.ensureAllWordsLoaded,
      syncHanVietAll: s.syncHanVietAll,
      syncHanVariantsAll: s.syncHanVariantsAll,
      syncPinyinAll: s.syncPinyinAll,
    })),
  )
