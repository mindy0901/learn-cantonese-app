import { create } from 'zustand'
import { emptyGrammarBankItem, emptyWord } from '../types/word.js'

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
    set({
      name,
      selectedOrder: dedupeWordIds(wordIds),
      wordExtras: [],
      grammarSelectedOrder,
      grammarExtras,
    })
  },

  reset: () => {
    set({
      name: '',
      selectedOrder: [],
      wordExtras: [],
      grammarSelectedOrder: [],
      grammarExtras: [],
    })
  },

  setName: (name) => {
    set({ name })
  },

  toggleSelected: (id) => {
    const wordId = normalizeWordId(id)
    if (!wordId) return
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
    set({ selectedOrder: [] })
  },

  addWordExtra: (word) => {
    const entry = emptyWord(word)
    set((state) => ({ wordExtras: [...state.wordExtras, entry] }))
  },

  removeWordExtra: (id) => {
    set((state) => ({ wordExtras: state.wordExtras.filter((w) => w.id !== id) }))
  },

  addGrammarExtra: (section) => {
    const entry = emptyGrammarBankItem(section)
    set((state) => ({ grammarExtras: [...state.grammarExtras, entry] }))
  },

  removeGrammarExtra: (id) => {
    set((state) => ({ grammarExtras: state.grammarExtras.filter((g) => g.id !== id) }))
  },

  toggleGrammarSelected: (id) => {
    set((state) => {
      if (state.grammarSelectedOrder.includes(id)) {
        return { grammarSelectedOrder: state.grammarSelectedOrder.filter((x) => x !== id) }
      }
      return { grammarSelectedOrder: [...state.grammarSelectedOrder, id] }
    })
  },

  clearGrammarSelected: () => {
    set({ grammarSelectedOrder: [] })
  },

  snapshot: () => {
    const { name, selectedOrder, wordExtras, grammarSelectedOrder, grammarExtras } = get()
    return { name, selectedOrder, wordExtras, grammarSelectedOrder, grammarExtras }
  },
}))
