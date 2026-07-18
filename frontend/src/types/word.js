export function emptyWord(partial) {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    english: '',
    hanTraditional: '',
    hanSimplified: '',
    dialect: 'cantonese',
    vietnamese: '',
    important: false,
    mastered: false,
    studyProgress: 0,
    studyProgressAt: undefined,
    createdAt: now,
    updatedAt: now,
    ...partial,
  }
}

export function emptyGrammar(partial) {
  return { id: crypto.randomUUID(), title: '', content: '', mastered: false, ...partial }
}

export function emptyGrammarBankItem(partial) {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    title: '',
    content: '',
    important: false,
    mastered: false,
    createdAt: now,
    updatedAt: now,
    ...partial,
  }
}

export function emptyHanCharacter(partial) {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    hanSimplified: '',
    hanViet: '',
    createdAt: now,
    updatedAt: now,
    ...partial,
  }
}

export function emptySentencePattern(partial) {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    hanTraditional: '',
    hanSimplified: '',
    jyutping: '',
    pinyin: '',
    vietnamese: '',
    english: '',
    wordIds: [],
    important: false,
    mastered: false,
    createdAt: now,
    updatedAt: now,
    ...partial,
  }
}
