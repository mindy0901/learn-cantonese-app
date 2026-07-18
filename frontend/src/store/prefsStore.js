import { create } from 'zustand'
import { DEFAULT_PREFS, loadPrefs, savePrefs } from '../lib/prefs.js'

const initial = loadPrefs()

export const usePrefsStore = create((set, get) => ({
  wordBank: initial.wordBank,
  grammarBank: initial.grammarBank,
  sentenceBank: initial.sentenceBank,
  flashcard: initial.flashcard,
  lessons: initial.lessons,

  setWordBankPrefs: (patch) => {
    const wordBank = { ...get().wordBank, ...patch }
    const next = { ...get(), wordBank }
    savePrefs({ wordBank, grammarBank: next.grammarBank, sentenceBank: next.sentenceBank, flashcard: next.flashcard, lessons: next.lessons })
    set({ wordBank })
  },

  setGrammarBankPrefs: (patch) => {
    const grammarBank = { ...get().grammarBank, ...patch }
    const next = { ...get(), grammarBank }
    savePrefs({ wordBank: next.wordBank, grammarBank, sentenceBank: next.sentenceBank, flashcard: next.flashcard, lessons: next.lessons })
    set({ grammarBank })
  },

  setSentenceBankPrefs: (patch) => {
    const sentenceBank = { ...get().sentenceBank, ...patch }
    const next = { ...get(), sentenceBank }
    savePrefs({ wordBank: next.wordBank, grammarBank: next.grammarBank, sentenceBank, flashcard: next.flashcard, lessons: next.lessons })
    set({ sentenceBank })
  },

  setFlashcardPrefs: (patch) => {
    const flashcard = { ...get().flashcard, ...patch }
    const next = { ...get(), flashcard }
    savePrefs({ wordBank: next.wordBank, grammarBank: next.grammarBank, sentenceBank: next.sentenceBank, flashcard, lessons: next.lessons })
    set({ flashcard })
  },

  setLessonsPrefs: (patch) => {
    const lessons = { ...get().lessons, ...patch }
    const next = { ...get(), lessons }
    savePrefs({ wordBank: next.wordBank, grammarBank: next.grammarBank, sentenceBank: next.sentenceBank, flashcard: next.flashcard, lessons })
    set({ lessons })
  },

  resetPrefs: () => {
    const fresh = structuredClone(DEFAULT_PREFS)
    savePrefs(fresh)
    set(fresh)
  },
}))

export const useWordBankPrefs = () => usePrefsStore((s) => s.wordBank)
export const useGrammarBankPrefs = () => usePrefsStore((s) => s.grammarBank)
export const useSentenceBankPrefs = () => usePrefsStore((s) => s.sentenceBank)
export const useFlashcardPrefs = () => usePrefsStore((s) => s.flashcard)
export const useLessonsPrefs = () => usePrefsStore((s) => s.lessons)
