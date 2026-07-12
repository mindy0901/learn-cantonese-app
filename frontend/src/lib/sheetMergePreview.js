import {
  grammarContentEqual,
  grammarMergeKey,
  lessonContentEqual,
  lessonMergeKey,
  mergeWordFieldsForPreview,
  wordContentEqual,
  wordKeyIsEmpty,
  wordMergeKey,
} from './sheetMergeKeys.js'
import { normalizeWordFields } from './wordNormalize.js'

function mergeWordFields(existing, incoming) {
  return { ...mergeWordFieldsForPreview(existing, incoming), id: existing.id }
}

function mergeGrammarFields(existing, incoming) {
  return {
    ...existing,
    title: incoming.title ?? existing.title,
    content: incoming.content ?? existing.content,
    important: 'important' in incoming ? incoming.important : existing.important,
    mastered: 'mastered' in incoming ? incoming.mastered : existing.mastered,
  }
}

function mergeLessonFields(existing, incoming) {
  const wordIds = [...new Set([...(existing.wordIds ?? []), ...(incoming.wordIds ?? [])])]
  const grammarByKey = new Map()
  for (const g of existing.grammar ?? []) {
    grammarByKey.set(grammarMergeKey(g), { ...g })
  }
  for (const g of incoming.grammar ?? []) {
    const key = grammarMergeKey(g)
    const prev = grammarByKey.get(key)
    if (prev) {
      grammarByKey.set(key, {
        ...prev,
        title: g.title || prev.title,
        content: g.content || prev.content,
      })
    } else {
      grammarByKey.set(key, { ...g })
    }
  }
  return {
    ...existing,
    name: incoming.name || existing.name,
    wordIds,
    grammar: [...grammarByKey.values()],
  }
}

function previewList(incoming, existing, { keyFn, equalFn, mergeFn, skipEmptyKey = false }) {
  const byKey = new Map(existing.map((item) => [keyFn(item), item]))
  let added = 0
  let updated = 0
  let skipped = 0

  for (const item of incoming) {
    const key = keyFn(item)
    if (skipEmptyKey && wordKeyIsEmpty(key)) continue
    const existingItem = byKey.get(key)
    if (!existingItem) {
      added++
      byKey.set(key, item)
    } else {
      const merged = mergeFn(existingItem, item)
      if (equalFn(existingItem, merged)) skipped++
      else updated++
    }
  }

  return {
    added,
    updated,
    skipped,
    totalBefore: existing.length,
    totalAfter: existing.length + added,
    validRows: incoming.length,
  }
}

export function previewWordsMerge(incoming, existingWords) {
  const normalized = incoming.map(normalizeWordFields)
  return previewList(normalized, existingWords.map(normalizeWordFields), {
    keyFn: wordMergeKey,
    equalFn: wordContentEqual,
    mergeFn: mergeWordFields,
    skipEmptyKey: true,
  })
}

export function previewGrammarMerge(incoming, existingGrammar) {
  return previewList(incoming, existingGrammar, {
    keyFn: grammarMergeKey,
    equalFn: grammarContentEqual,
    mergeFn: mergeGrammarFields,
  })
}

export function previewLessonsMerge(incoming, existingLessons) {
  const byKey = new Map(existingLessons.map((l) => [lessonMergeKey(l), l]))
  let added = 0
  let updated = 0
  let skipped = 0

  for (const item of incoming) {
    const key = lessonMergeKey(item)
    const existingItem = byKey.get(key)
    if (!existingItem) {
      added++
      byKey.set(key, item)
    } else {
      const merged = mergeLessonFields(existingItem, item)
      if (lessonContentEqual(existingItem, merged)) skipped++
      else updated++
    }
  }

  return {
    added,
    updated,
    skipped,
    totalBefore: existingLessons.length,
    totalAfter: existingLessons.length + added,
    validRows: incoming.length,
  }
}
