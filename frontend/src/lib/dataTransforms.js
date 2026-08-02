import { emptyGrammarBankItem, emptySentencePattern } from "../types/word.js";
import { normalizeVocabularyFields } from "./wordNormalize.js";
import { getGrammarSearchBlob } from "./grammarSearch.js";
import { getSentenceSearchBlob } from "./sentenceSearch.js";
import { getVocabularySearchBlob } from "./wordSearch.js";

export function vocabTimestamps(raw) {
    const createdAt = raw.createdAt ?? raw.created_at ?? undefined;
    const updatedAt = raw.updatedAt ?? raw.updated_at ?? undefined;
    return {
        createdAt: createdAt ?? updatedAt,
        updatedAt: updatedAt ?? createdAt,
    };
}

export function vocabAddedAtMs(raw) {
    const { createdAt, updatedAt } = vocabTimestamps(raw);
    for (const value of [createdAt, updatedAt]) {
        if (!value) continue;
        const ms = Date.parse(String(value));
        if (Number.isFinite(ms)) return ms;
    }
    return 0;
}

export function migrateVocabulary(raw) {
    const { kanji, _searchBlob, _sortSeq, addedAt, definitions, ...rest } = raw;
    const timestamps = vocabTimestamps(raw);
    return normalizeVocabularyFields({
        ...rest,
        hanTraditional: raw.hanTraditional ?? raw.hanTrad ?? raw.han ?? kanji ?? "",
        important: raw.important ?? false,
        mastered: raw.mastered ?? false,
        hskLevel: raw.hskLevel ?? raw.hsk_level ?? undefined,
        ...timestamps,
    });
}

export function migrateGrammarBankItem(raw) {
    const { _searchBlob, _sortSeq, addedAt, ...rest } = raw;
    const timestamps = vocabTimestamps(raw);
    return {
        ...emptyGrammarBankItem(),
        ...rest,
        important: raw.important ?? false,
        mastered: raw.mastered ?? false,
        ...timestamps,
    };
}

export function migrateSentencePattern(raw) {
    const { _searchBlob, _sortSeq, addedAt, ...rest } = raw;
    const timestamps = vocabTimestamps(raw);
    return {
        ...emptySentencePattern(),
        ...rest,
        hanTraditional: raw.hanTraditional ?? raw.han ?? "",
        hanSimplified: raw.hanSimplified ?? "",
        wordIds: raw.wordIds ?? raw.word_ids ?? [],
        important: raw.important ?? false,
        mastered: raw.mastered ?? false,
        ...timestamps,
    };
}

/** Pre-index for fast search filtering (client-only, not sent to API). */
export function indexVocabulary(vocab, sortSeq) {
    const migrated = migrateVocabulary(vocab);
    const seq = sortSeq ?? vocab._sortSeq;
    return {
        ...migrated,
        addedAt: vocabAddedAtMs(migrated),
        _searchBlob: getVocabularySearchBlob(migrated),
        ...(seq !== undefined ? { _sortSeq: seq } : {}),
    };
}

export function indexGrammarItem(item, sortSeq) {
    const migrated = migrateGrammarBankItem(item);
    const seq = sortSeq ?? item._sortSeq;
    return {
        ...migrated,
        addedAt: vocabAddedAtMs(migrated),
        _searchBlob: getGrammarSearchBlob(migrated),
        ...(seq !== undefined ? { _sortSeq: seq } : {}),
    };
}

export function indexSentencePattern(item, sortSeq) {
    const migrated = migrateSentencePattern(item);
    const seq = sortSeq ?? item._sortSeq;
    return {
        ...migrated,
        addedAt: vocabAddedAtMs(migrated),
        _searchBlob: getSentenceSearchBlob(migrated),
        ...(seq !== undefined ? { _sortSeq: seq } : {}),
    };
}

export function stripSearchIndex(entity) {
    const { _searchBlob, _sortSeq, addedAt, definitions, ...rest } = entity;
    return rest;
}

export function indexVocabularies(vocabularies) {
    return vocabularies.map((vocab, index) => indexVocabulary(vocab, index));
}

export function indexGrammarBank(items) {
    return items.map((item, index) => indexGrammarItem(item, index));
}

export function indexSentencePatterns(items) {
    return items.map((item, index) => indexSentencePattern(item, index));
}

export function indexCloudPayload({ vocabularies = [], grammars = [], sentencePatterns = [] }) {
    return {
        vocabularies: indexVocabularies(vocabularies),
        grammarBank: indexGrammarBank(grammars),
        sentencePatterns: indexSentencePatterns(sentencePatterns),
    };
}

export function updateVocabularyInList(vocabularies, id, patch) {
    return vocabularies.map((w) =>
        w.id === id ? indexVocabulary({ ...w, ...patch, _sortSeq: w._sortSeq }, w._sortSeq) : w,
    );
}

export function toggleVocabularyField(vocabularies, id, field) {
    return vocabularies.map((w) => (w.id === id ? indexVocabulary({ ...w, [field]: !w[field] }, w._sortSeq) : w));
}

export function deleteVocabularyFromList(vocabularies, id) {
    return vocabularies.filter((w) => w.id !== id);
}

export function updateGrammarInList(items, id, patch) {
    return items.map((g) => (g.id === id ? indexGrammarItem({ ...g, ...patch }, g._sortSeq) : g));
}

export function toggleGrammarField(items, id, field) {
    return items.map((g) => (g.id === id ? indexGrammarItem({ ...g, [field]: !g[field] }, g._sortSeq) : g));
}

export function deleteGrammarFromList(items, id) {
    return items.filter((g) => g.id !== id);
}

export function updateSentenceInList(items, id, patch) {
    return items.map((s) => (s.id === id ? indexSentencePattern({ ...s, ...patch }, s._sortSeq) : s));
}

export function toggleSentenceField(items, id, field) {
    return items.map((s) => (s.id === id ? indexSentencePattern({ ...s, [field]: !s[field] }, s._sortSeq) : s));
}

export function deleteSentenceFromList(items, id) {
    return items.filter((s) => s.id !== id);
}

