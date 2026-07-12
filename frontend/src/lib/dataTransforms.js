import { emptyGrammar, emptyGrammarBankItem, emptySentencePattern } from '../types/word.js'
import { normalizeWordFields } from './wordNormalize.js'
import { getGrammarSearchBlob } from './grammarSearch.js'
import { getSentenceSearchBlob } from './sentenceSearch.js'
import { getWordSearchBlob } from './wordSearch.js'

export function wordTimestamps(raw) {
  const createdAt = raw.createdAt ?? raw.created_at ?? undefined
  const updatedAt = raw.updatedAt ?? raw.updated_at ?? undefined
  return {
    createdAt: createdAt ?? updatedAt,
    updatedAt: updatedAt ?? createdAt,
  }
}

export function wordAddedAtMs(raw) {
  const { createdAt, updatedAt } = wordTimestamps(raw)
  for (const value of [createdAt, updatedAt]) {
    if (!value) continue
    const ms = Date.parse(String(value))
    if (Number.isFinite(ms)) return ms
  }
  return 0
}

export function migrateWord(raw) {
  const { kanji, _searchBlob, _sortSeq, addedAt, definitions, ...rest } = raw
  const timestamps = wordTimestamps(raw)
  return normalizeWordFields({
    ...rest,
    hanTraditional: raw.hanTraditional ?? raw.hanTrad ?? raw.han ?? kanji ?? '',
    important: raw.important ?? false,
    mastered: raw.mastered ?? false,
    ...timestamps,
  })
}

export function migrateGrammarBankItem(raw) {
  const { _searchBlob, _sortSeq, addedAt, ...rest } = raw
  const timestamps = wordTimestamps(raw)
  return {
    ...emptyGrammarBankItem(),
    ...rest,
    important: raw.important ?? false,
    mastered: raw.mastered ?? false,
    ...timestamps,
  }
}

export function migrateSentencePattern(raw) {
  const { _searchBlob, _sortSeq, addedAt, ...rest } = raw
  const timestamps = wordTimestamps(raw)
  return {
    ...emptySentencePattern(),
    ...rest,
    hanTraditional: raw.hanTraditional ?? raw.han ?? '',
    hanSimplified: raw.hanSimplified ?? '',
    wordIds: raw.wordIds ?? raw.word_ids ?? [],
    important: raw.important ?? false,
    mastered: raw.mastered ?? false,
    ...timestamps,
  }
}

export function migrateLesson(raw) {
  if (!raw) return null
  return {
    id: raw.id,
    name: raw.name,
    wordIds: raw.wordIds ?? [],
    grammar: Array.isArray(raw.grammar)
      ? raw.grammar.map((g) => ({ ...g, mastered: g.mastered ?? false }))
      : [],
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt ?? raw.createdAt,
  }
}

/** Pre-index for fast search filtering (client-only, not sent to API). */
export function indexWord(word, sortSeq) {
  const migrated = migrateWord(word)
  const seq = sortSeq ?? word._sortSeq
  return {
    ...migrated,
    addedAt: wordAddedAtMs(migrated),
    _searchBlob: getWordSearchBlob(migrated),
    ...(seq !== undefined ? { _sortSeq: seq } : {}),
  }
}

export function indexGrammarItem(item, sortSeq) {
  const migrated = migrateGrammarBankItem(item)
  const seq = sortSeq ?? item._sortSeq
  return {
    ...migrated,
    addedAt: wordAddedAtMs(migrated),
    _searchBlob: getGrammarSearchBlob(migrated),
    ...(seq !== undefined ? { _sortSeq: seq } : {}),
  }
}

export function indexSentencePattern(item, sortSeq) {
  const migrated = migrateSentencePattern(item)
  const seq = sortSeq ?? item._sortSeq
  return {
    ...migrated,
    addedAt: wordAddedAtMs(migrated),
    _searchBlob: getSentenceSearchBlob(migrated),
    ...(seq !== undefined ? { _sortSeq: seq } : {}),
  }
}

export function stripSearchIndex(entity) {
  const { _searchBlob, _sortSeq, addedAt, definitions, ...rest } = entity
  return rest
}

export function indexWords(words) {
  return words.map((word, index) => indexWord(word, index))
}

export function indexGrammarBank(items) {
  return items.map((item, index) => indexGrammarItem(item, index))
}

export function indexSentencePatterns(items) {
  return items.map((item, index) => indexSentencePattern(item, index))
}

export function indexCloudPayload({ words = [], grammarBank = [], lessons = [], sentencePatterns = [] }) {
  return {
    words: indexWords(words),
    grammarBank: indexGrammarBank(grammarBank),
    lessons: lessons.map(migrateLesson),
    sentencePatterns: indexSentencePatterns(sentencePatterns),
  }
}

export function updateWordInList(words, id, patch) {
  return words.map((w) =>
    w.id === id ? indexWord({ ...w, ...patch, _sortSeq: w._sortSeq }, w._sortSeq) : w,
  )
}

export function toggleWordField(words, id, field) {
  return words.map((w) =>
    w.id === id ? indexWord({ ...w, [field]: !w[field] }, w._sortSeq) : w,
  )
}

export function deleteWordFromList(words, lessons, id) {
  return {
    words: words.filter((w) => w.id !== id),
    lessons: lessons.map((l) => ({
      ...l,
      wordIds: l.wordIds.filter((wid) => wid !== id),
    })),
  }
}

export function updateGrammarInList(items, id, patch) {
  return items.map((g) => (g.id === id ? indexGrammarItem({ ...g, ...patch }, g._sortSeq) : g))
}

export function toggleGrammarField(items, id, field) {
  return items.map((g) => (g.id === id ? indexGrammarItem({ ...g, [field]: !g[field] }, g._sortSeq) : g))
}

export function deleteGrammarFromList(items, id) {
  return items.filter((g) => g.id !== id)
}

export function updateSentenceInList(items, id, patch) {
  return items.map((s) => (s.id === id ? indexSentencePattern({ ...s, ...patch }, s._sortSeq) : s))
}

export function toggleSentenceField(items, id, field) {
  return items.map((s) => (s.id === id ? indexSentencePattern({ ...s, [field]: !s[field] }, s._sortSeq) : s))
}

export function deleteSentenceFromList(items, id) {
  return items.filter((s) => s.id !== id)
}

export function toggleLessonGrammarMasteredInList(lessons, lessonId, grammarId) {
  const now = new Date().toISOString()
  return lessons.map((l) =>
    l.id !== lessonId
      ? l
      : {
          ...l,
          grammar: l.grammar.map((g) =>
            g.id === grammarId ? { ...g, mastered: !g.mastered } : g,
          ),
          updatedAt: now,
        },
  )
}

export function createLessonEntity(name, wordIds, grammar = []) {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    name,
    wordIds,
    grammar: grammar.length > 0 ? grammar : [emptyGrammar()],
    createdAt: now,
    updatedAt: now,
  }
}

export function updateLessonInList(lessons, id, patch) {
  const now = new Date().toISOString()
  return lessons.map((l) => (l.id === id ? { ...l, ...patch, updatedAt: now } : l))
}

export function deleteLessonFromList(lessons, id) {
  return lessons.filter((l) => l.id !== id)
}
