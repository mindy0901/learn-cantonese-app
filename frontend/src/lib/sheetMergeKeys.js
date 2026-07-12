import {
  mergeWordFieldsPreferFilled,
  normalizeWordFields,
  wordContentEqual,
  wordKeyIsEmpty,
  wordMergeKey,
} from './wordNormalize.js'

export { wordMergeKey, wordContentEqual, normalizeWordFields }

export function grammarMergeKey(item) {
  return `${normGrammar(item.title)}|${normGrammar(item.content)}`
}

export function lessonMergeKey(lesson) {
  return normGrammar(lesson.name)
}

function normGrammar(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
}

export function grammarContentEqual(a, b) {
  return (
    normGrammar(a.title) === normGrammar(b.title) &&
    normGrammar(a.content) === normGrammar(b.content) &&
    Boolean(a.important) === Boolean(b.important) &&
    Boolean(a.mastered) === Boolean(b.mastered)
  )
}

export function lessonContentEqual(a, b) {
  if (normGrammar(a.name) !== normGrammar(b.name)) return false
  const aWords = [...(a.wordIds ?? [])].sort().join(',')
  const bWords = [...(b.wordIds ?? [])].sort().join(',')
  if (aWords !== bWords) return false
  const aGrammar = (a.grammar ?? [])
    .map((g) => `${normGrammar(g.title)}|${normGrammar(g.content)}`)
    .sort()
    .join(';;')
  const bGrammar = (b.grammar ?? [])
    .map((g) => `${normGrammar(g.title)}|${normGrammar(g.content)}`)
    .sort()
    .join(';;')
  return aGrammar === bGrammar
}

export { wordKeyIsEmpty, mergeWordFieldsPreferFilled as mergeWordFieldsForPreview }
