import { WORD_FETCH_PAGE_SIZE } from "./constants.js";
import { api } from "./api.js";
import { fetchVocabularyBrowsePage } from "./wordBrowseCache.js";
import { compareDueWords, isWordDueForReview, matchesFlashcardScope } from "./flashcardDue.js";

export { FLASHCARD_SESSION_SIZES } from "./flashcardPrefs.js";

function shuffleArray(items) {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function browseFilterForScope(scope) {
    if (scope === "important") return "important";
    return "all";
}

function browseParamsForConfig(config, page, pageSize) {
    const { source, scope } = config;
    const params = {
        page,
        pageSize,
        sortKey: source === "due" ? "studyProgressAt" : "createdAt",
        sortDir: source === "due" ? "asc" : "desc",
        filter: browseFilterForScope(scope),
        q: "",
    };
    if (source === "due") params.studyDue = true;
    if (scope === "lowProgress") params.maxProgress = 49;
    return params;
}

async function fetchLessonVocabulariesByLesson(lesson, { mergeVocabularies } = {}) {
    const ids = lesson?.wordIds ?? [];
    if (!ids.length) return [];
    const vocabularies = await api.fetchVocabulariesByIds(ids);
    mergeVocabularies?.(vocabularies);
    return vocabularies ?? [];
}

function filterLessonPool(vocabularies, config) {
    return vocabularies.filter((vocab) => {
        if (vocab.mastered) return false;
        if (!matchesFlashcardScope(vocab, config.scope)) return false;
        if (config.source === "due") return isWordDueForReview(vocab);
        return true;
    });
}

export async function countDueFlashcardVocabularies({ revision, mergeVocabularies } = {}) {
    try {
        const result = await fetchVocabularyBrowsePage(
            { page: 1, pageSize: 1, studyDue: true, filter: "all", sortKey: "studyProgressAt", sortDir: "asc" },
            { revision },
        );
        mergeVocabularies?.(result.items ?? []);
        return result.total ?? 0;
    } catch {
        return 0;
    }
}

async function collectDueVocabularies(count, config, { mergeVocabularies, revision } = {}) {
    const collected = [];
    let page = 1;
    const pageSize = WORD_FETCH_PAGE_SIZE;
    const maxPages = 40;

    while (collected.length < count && page <= maxPages) {
        const result = await fetchVocabularyBrowsePage(browseParamsForConfig(config, page, pageSize), { revision });
        mergeVocabularies?.(result.items ?? []);

        for (const vocab of result.items ?? []) {
            if (vocab.mastered) continue;
            if (!matchesFlashcardScope(vocab, config.scope)) continue;
            if (!isWordDueForReview(vocab)) continue;
            collected.push(vocab);
            if (collected.length >= count) break;
        }

        if (page >= (result.totalPages ?? 1)) break;
        page++;
    }

    return collected.sort(compareDueWords).slice(0, count);
}

async function collectRandomVocabularies(count, config, { mergeVocabularies, revision, vocabularyTotal } = {}) {
    if (!vocabularyTotal || count <= 0) return [];

    const pageSize = WORD_FETCH_PAGE_SIZE;
    const totalPages = Math.max(1, Math.ceil(vocabularyTotal / pageSize));
    const collected = new Map();
    const target = Math.min(count, vocabularyTotal);
    let attempts = 0;
    const maxAttempts = Math.max(totalPages * 4, 12);

    while (collected.size < target && attempts < maxAttempts) {
        const page = Math.floor(Math.random() * totalPages) + 1;
        const result = await fetchVocabularyBrowsePage(browseParamsForConfig(config, page, pageSize), { revision });
        mergeVocabularies?.(result.items ?? []);

        for (const vocab of result.items ?? []) {
            if (vocab.mastered) continue;
            if (!matchesFlashcardScope(vocab, config.scope)) continue;
            if (!collected.has(vocab.id)) collected.set(vocab.id, vocab);
            if (collected.size >= target) break;
        }
        attempts++;
    }

    return shuffleArray([...collected.values()]).slice(0, target);
}

/**
 * @param {number} count
 * @param {{
 *   source?: string,
 *   scope?: string,
 *   lessonId?: string,
 *   lesson?: { wordIds?: string[] },
 *   mergeVocabularies?: Function,
 *   revision?: number,
 *   vocabularyTotal?: number,
 * }} options
 */
export async function fetchFlashcardVocabularies(
    count,
    {
        source = "random",
        scope = "all",
        lessonId = "",
        lesson = null,
        mergeVocabularies,
        revision,
        vocabularyTotal,
    } = {},
) {
    const config = { source, scope, lessonId };

    if (lessonId && lesson) {
        const pool = filterLessonPool(await fetchLessonVocabulariesByLesson(lesson, { mergeVocabularies }), config);
        const ordered = source === "due" ? [...pool].sort(compareDueWords) : shuffleArray(pool);
        return ordered.slice(0, count);
    }

    if (source === "due") {
        return collectDueVocabularies(count, config, { mergeVocabularies, revision });
    }

    return collectRandomVocabularies(count, config, { mergeVocabularies, revision, vocabularyTotal });
}

/** @deprecated Use fetchFlashcardVocabularies */
export async function fetchRandomFlashcardVocabularies(count, options = {}) {
    return fetchFlashcardVocabularies(count, { ...options, source: "random", scope: "all" });
}
