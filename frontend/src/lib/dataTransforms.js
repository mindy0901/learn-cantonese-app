import { emptyGrammarBankItem, emptySentencePattern } from "../types/word.js";
import { normalizeVocabularyFields } from "./wordNormalize.js";

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

/**
 * Adapter (2026-08-14): API model mới `{ id, mandarin, cantonese, metadata }`
 * → old-shape store object (han* flat + romanization typed array + meanings legacy).
 * Store giữ shape cũ để ~20 consumer files không phải đổi; payload gửi lên API
 * được build lại theo model mới ở `vocabularyDraftPayload`.
 */
export function vocabNewToLegacy(raw) {
    const man = raw.mandarin ?? {};
    const can = raw.cantonese ?? {};
    const meta = raw.metadata ?? {};
    const manReadings = Array.isArray(man.readings) ? man.readings : [];
    const canReadings = Array.isArray(can.readings) ? can.readings : [];

    const meaningToLegacy = (m, side) => ({
        id: m.id,
        category: m.category ?? "",
        vietMeanings: [m.zh ?? "", m.yue ?? "", m.vi ?? ""].filter(Boolean).join("; "),
        engMeanings: m.en ?? "",
        examples: (m.examples ?? []).map((ex) => ({
            id: ex.id,
            hanSimplified: side === "mandarin" ? (ex.zh ?? "") : "",
            hanTraditional: side === "cantonese" ? (ex.yue ?? "") : "",
            hanExample: [ex.zh ?? "", ex.yue ?? ""].filter(Boolean).join("\n"),
            jyutpingExample: side === "cantonese" ? (ex.romanization ?? "") : "",
            pinyinExample: side === "mandarin" ? (ex.romanization ?? "") : "",
            vietExamples: ex.vi ?? "",
            engExamples: ex.en ?? "",
            position: ex.position ?? 0,
        })),
        position: m.position ?? 0,
    });

    const readingToLegacy = (r, side) => ({
        id: r.id,
        type: side === "mandarin" ? "pinyin" : "jyutping",
        pinyin: side === "mandarin" ? (r.romanization ?? "") : "",
        jyutping: side === "cantonese" ? (r.romanization ?? "") : "",
        sinoVietnamese: r.sino_vietnamese ?? "",
        meanings: (r.meanings ?? []).map((m) => meaningToLegacy(m, side)),
    });

    const romanization = [
        ...manReadings.map((r) => readingToLegacy(r, "mandarin")),
        ...canReadings.map((r) => readingToLegacy(r, "cantonese")),
    ];
    const meanings = [
        ...manReadings.flatMap((r) => (r.meanings ?? []).map((m) => meaningToLegacy(m, "mandarin"))),
        ...canReadings.flatMap((r) => (r.meanings ?? []).map((m) => meaningToLegacy(m, "cantonese"))),
    ];
    const joinReadings = (rs) =>
        [...new Set(rs.map((r) => String(r.romanization ?? "").trim()).filter(Boolean))].join(" ");

    return {
        id: raw.id,
        hanSimplified: String(man.hanzi_simplified ?? can.hanzi_simplified ?? "").trim() || undefined,
        hanTraditional: String(man.hanzi_traditional ?? "").trim(),
        hanHongKong: String(can.hanzi_traditional ?? "").trim() || undefined,
        pinyin: joinReadings(manReadings),
        jyutping: joinReadings(canReadings),
        sinoVietnamese: [
            ...new Set(
                [...manReadings, ...canReadings].map((r) => String(r.sino_vietnamese ?? "").trim()).filter(Boolean),
            ),
        ].join(" "),
        vietMeanings: meanings
            .map((m) => m.vietMeanings)
            .filter(Boolean)
            .join("; "),
        engMeanings: meanings
            .map((m) => m.engMeanings)
            .filter(Boolean)
            .join("; "),
        meanings,
        romanization,
        hskLevel: meta.hsk_level ?? "",
        boost: meta.popularity ?? null,
        frequency: meta.frequency ?? null,
        movieWordRank: meta.movie_word_rank ?? null,
        bookWordRank: meta.book_word_rank ?? null,
        pureCantonese: Boolean(meta.pure_cantonese ?? false),
        createdAt: meta.created_at ?? meta.updated_at,
        updatedAt: meta.updated_at ?? meta.created_at,
    };
}

export function migrateVocabulary(raw) {
    const { kanji, _searchBlob, _sortSeq, addedAt, definitions, mandarin, cantonese, metadata, ...rest } = raw;
    const isNewModel = (mandarin && typeof mandarin === "object") || (cantonese && typeof cantonese === "object");
    const source = isNewModel ? vocabNewToLegacy(raw) : raw;
    const timestamps = vocabTimestamps(source);
    return normalizeVocabularyFields({
        ...source,
        hanTraditional: source.hanTraditional ?? raw.hanTrad ?? raw.han ?? kanji ?? "",
        important: source.important ?? raw.important ?? false,
        mastered: source.mastered ?? raw.mastered ?? false,
        hskLevel: source.hskLevel ?? raw.hsk_level ?? undefined,
        pureCantonese: Boolean(source.pureCantonese ?? raw.pure_cantonese ?? false),
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

/** Pre-index for stable sorting (client-only, not sent to API). */
export function indexVocabulary(vocab, sortSeq) {
    const migrated = migrateVocabulary(vocab);
    const seq = sortSeq ?? vocab._sortSeq;
    return {
        ...migrated,
        addedAt: vocabAddedAtMs(migrated),
        ...(seq !== undefined ? { _sortSeq: seq } : {}),
    };
}

export function indexGrammarItem(item, sortSeq) {
    const migrated = migrateGrammarBankItem(item);
    const seq = sortSeq ?? item._sortSeq;
    return {
        ...migrated,
        addedAt: vocabAddedAtMs(migrated),
        ...(seq !== undefined ? { _sortSeq: seq } : {}),
    };
}

export function indexSentencePattern(item, sortSeq) {
    const migrated = migrateSentencePattern(item);
    const seq = sortSeq ?? item._sortSeq;
    return {
        ...migrated,
        addedAt: vocabAddedAtMs(migrated),
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
