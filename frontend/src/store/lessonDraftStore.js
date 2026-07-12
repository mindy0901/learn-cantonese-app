import { create } from 'zustand'
import { emptyGrammarBankItem, emptyWord } from '../types/word.js'
import { log } from '../lib/actionLog.js'

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
    log("Init lesson draft", name || "untitled")
    set({
      name,
      selectedOrder: dedupeWordIds(wordIds),
      wordExtras: [],
      grammarSelectedOrder,
      grammarExtras,
    })
  },

  reset: () => {
    log("Reset lesson draft")
    set({
      name: '',
      selectedOrder: [],
      wordExtras: [],
      grammarSelectedOrder: [],
      grammarExtras: [],
    })
  },

  setName: (name) => {
    log("Lesson draft name", name)
    set({ name })
  },

  toggleSelected: (id) => {
    const wordId = normalizeWordId(id)
    if (!wordId) return
    log("Toggle draft word", wordId)
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
    log("Clear draft words")
    set({ selectedOrder: [] })
  },

  addWordExtra: (word) => {
    const entry = emptyWord(word)
    log("Add draft word", entry)
    set((state) => ({ wordExtras: [...state.wordExtras, entry] }))
  },

  removeWordExtra: (id) => {
    log("Remove draft word", id)
    set((state) => ({ wordExtras: state.wordExtras.filter((w) => w.id !== id) }))
  },

  addGrammarExtra: (section) => {
    const entry = emptyGrammarBankItem(section)
    log("Add draft grammar", entry)
    set((state) => ({ grammarExtras: [...state.grammarExtras, entry] }))
  },

  removeGrammarExtra: (id) => {
    log("Remove draft grammar", id)
    set((state) => ({ grammarExtras: state.grammarExtras.filter((g) => g.id !== id) }))
  },

  toggleGrammarSelected: (id) => {
    log("Toggle draft grammar", id)
    set((state) => {
      if (state.grammarSelectedOrder.includes(id)) {
        return { grammarSelectedOrder: state.grammarSelectedOrder.filter((x) => x !== id) }
      }
      return { grammarSelectedOrder: [...state.grammarSelectedOrder, id] }
    })
  },

  clearGrammarSelected: () => {
    log("Clear draft grammar")
    set({ grammarSelectedOrder: [] })
  },

  snapshot: () => {
    const { name, selectedOrder, wordExtras, grammarSelectedOrder, grammarExtras } = get()
    return { name, selectedOrder, wordExtras, grammarSelectedOrder, grammarExtras }
  },
}))
