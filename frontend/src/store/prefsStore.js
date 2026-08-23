import { create } from "zustand";
import { DEFAULT_PREFS, loadPrefs, savePrefs } from "../lib/prefs.js";

const initial = loadPrefs();

export const usePrefsStore = create((set, get) => ({
    wordBank: initial.wordBank,
    grammarBank: initial.grammarBank,
    flashcard: initial.flashcard,

    setWordBankPrefs: (patch) => {
        const wordBank = { ...get().wordBank, ...patch };
        const next = { ...get(), wordBank };
        savePrefs({
            wordBank,
            grammarBank: next.grammarBank,
            flashcard: next.flashcard,
        });
        set({ wordBank });
    },

    setGrammarBankPrefs: (patch) => {
        const grammarBank = { ...get().grammarBank, ...patch };
        const next = { ...get(), grammarBank };
        savePrefs({ wordBank: next.wordBank, grammarBank, flashcard: next.flashcard });
        set({ grammarBank });
    },

    setFlashcardPrefs: (patch) => {
        const flashcard = { ...get().flashcard, ...patch };
        const next = { ...get(), flashcard };
        savePrefs({
            wordBank: next.wordBank,
            grammarBank: next.grammarBank,
            flashcard,
        });
        set({ flashcard });
    },

    resetPrefs: () => {
        const fresh = structuredClone(DEFAULT_PREFS);
        savePrefs(fresh);
        set(fresh);
    },
}));

export const useWordBankPrefs = () => usePrefsStore((s) => s.wordBank);
export const useGrammarBankPrefs = () => usePrefsStore((s) => s.grammarBank);
