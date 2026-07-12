function hanVariantsForMatch(entity) {
  const forms = new Set()
  const trad = entity.hanTraditional ?? entity.han_traditional ?? ''
  const simp = entity.hanSimplified ?? entity.han_simplified ?? ''
  if (trad.trim()) forms.add(trad.trim())
  if (simp.trim()) forms.add(simp.trim())
  return [...forms]
}

function sentenceHanTexts(pattern) {
  return hanVariantsForMatch(pattern)
}

export function hanAppearsInText(needle, haystack) {
  if (!needle || !haystack) return false
  return haystack.includes(needle)
}

export function sentenceMatchesWord(pattern, word) {
  const wordId = word.id
  const wordIds = pattern.wordIds ?? pattern.word_ids ?? []
  if (wordId && wordIds.includes(wordId)) return true

  const sentences = sentenceHanTexts(pattern)
  const forms = hanVariantsForMatch(word)
  return forms.some((form) => sentences.some((sentence) => hanAppearsInText(form, sentence)))
}

export function filterSentencePatternsForWord(patterns, word) {
  return patterns.filter((pattern) => sentenceMatchesWord(pattern, word))
}

export function findWordIdsInSentence(pattern, words) {
  const ids = new Set(pattern.wordIds ?? pattern.word_ids ?? [])
  const sentences = sentenceHanTexts(pattern)
  for (const word of words) {
    const forms = hanVariantsForMatch(word)
    if (forms.some((form) => sentences.some((sentence) => hanAppearsInText(form, sentence)))) {
      if (word.id) ids.add(word.id)
    }
  }
  return [...ids]
}
