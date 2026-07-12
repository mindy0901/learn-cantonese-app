import { create } from 'zustand'
import { emptyGrammarBankItem, emptyWord } from '../types/word.js'
import { logAction } from '../lib/actionLog.js'

function normalizeWordId(id) {
  return String(id ?? '').trim()
}

function dedupeWordIds(ids) {
  const seen = new Set()
  const out = []
  for (const raw of ids ?? []) {
    const id = normalizeWordId(raw)
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}
function matchGrammarToBank(section, grammarBank) {
  const title = section.title?.trim() ?? ''
  const content = section.content?.trim() ?? ''
  if (!title && !content) return null
  return (
    grammarBank.find((g) => g.title?.trim() === title && g.content?.trim() === content) ?? null
  )
}

export const useLessonDraftStore = create((set, get) => ({
  name: '',
  selectedOrder: [],
  wordExtras: [],
  grammarSelectedOrder: [],
  grammarExtras: [],

  init: ({ name = '', wordIds = [], grammar, grammarBank = [] }) => {
    const grammarSelectedOrder = []
    const grammarExtras = []
    for (const section of grammar ?? []) {
      const match = matchGrammarToBank(section, grammarBank)
      if (match) {
        if (!grammarSelectedOrder.includes(match.id)) grammarSelectedOrder.push(match.id)
      } else if (section.title?.trim() || section.content?.trim()) {
        grammarExtras.push(section)
      }
    }
    logAction('Initialize lesson draft', {
      name,
      wordCount: wordIds.length,
      grammarCount: grammarSelectedOrder.length,
    })
    set({
      name,
      selectedOrder: dedupeWordIds(wordIds),
      wordExtras: [],
      grammarSelectedOrder,
      grammarExtras,
    })
  },

  reset: () => {
    logAction('Reset lesson draft')
    set({
      name: '',
      selectedOrder: [],
      wordExtras: [],
      grammarSelectedOrder: [],
      grammarExtras: [],
    })
  },

  setName: (name) => {
    logAction('Update lesson draft name', { name })
    set({ name })
  },

  toggleSelected: (id) => {
    const wordId = normalizeWordId(id)
    if (!wordId) return
    logAction('Toggle lesson draft vocabulary selection', { wordId })
    set((state) => {
      const order = dedupeWordIds(state.selectedOrder)
      if (order.includes(wordId)) {
        return { selectedOrder: order.filter((x) => x !== wordId) }
      }
      return { selectedOrder: [...order, wordId] }
    })
  },

  setSelectedOrder: (ids) => {
    set({ selectedOrder: dedupeWordIds(ids) })
  },

  clearSelected: () => {
    logAction('Clear lesson draft vocabulary selection')
    set({ selectedOrder: [] })
  },

  addWordExtra: (word) => {
    const entry = emptyWord(word)
    logAction('Add lesson draft custom word', { hanTraditional: entry.hanTraditional })
    set((state) => ({ wordExtras: [...state.wordExtras, entry] }))
  },

  removeWordExtra: (id) => {
    logAction('Remove lesson draft custom word', { wordId: id })
    set((state) => ({ wordExtras: state.wordExtras.filter((w) => w.id !== id) }))
  },

  addGrammarExtra: (section) => {
    const entry = emptyGrammarBankItem(section)
    logAction('Add lesson draft custom grammar', { title: entry.title })
    set((state) => ({ grammarExtras: [...state.grammarExtras, entry] }))
  },

  removeGrammarExtra: (id) => {
    logAction('Remove lesson draft custom grammar', { grammarId: id })
    set((state) => ({ grammarExtras: state.grammarExtras.filter((g) => g.id !== id) }))
  },

  toggleGrammarSelected: (id) => {
    logAction('Toggle lesson draft grammar selection', { grammarId: id })
    set((state) => {
      if (state.grammarSelectedOrder.includes(id)) {
        return { grammarSelectedOrder: state.grammarSelectedOrder.filter((x) => x !== id) }
      }
      return { grammarSelectedOrder: [...state.grammarSelectedOrder, id] }
    })
  },

  clearGrammarSelected: () => {
    logAction('Clear lesson draft grammar selection')
    set({ grammarSelectedOrder: [] })
  },

  snapshot: () => {
    const { name, selectedOrder, wordExtras, grammarSelectedOrder, grammarExtras } = get()
    return { name, selectedOrder, wordExtras, grammarSelectedOrder, grammarExtras }
  },
}))
