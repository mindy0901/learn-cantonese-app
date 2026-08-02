import { loadPrefs, savePrefs } from "./prefs.js";

export const FLASHCARD_SESSION_SIZES = [20, 50, 100];

export const FLASHCARD_SOURCES = ["due", "random", "deck"];

export const FLASHCARD_SCOPES = ["all", "important", "lowProgress"];

export const FLASHCARD_CARD_MODES = ["hanToMeaning", "meaningToHan", "jyutpingToHan"];

export const DEFAULT_FLASHCARD_PREFS = {
    source: "due",
    scope: "all",
    cardMode: "hanToMeaning",
    hideJyutping: false,
    sessionSize: 20,
    deckId: null,
};

export function loadFlashcardPrefs() {
    const prefs = loadPrefs();
    const saved = prefs.flashcard ?? {};
    const sessionSize = FLASHCARD_SESSION_SIZES.includes(saved.sessionSize)
        ? saved.sessionSize
        : DEFAULT_FLASHCARD_PREFS.sessionSize;
    return {
        ...DEFAULT_FLASHCARD_PREFS,
        ...saved,
        source: FLASHCARD_SOURCES.includes(saved.source) ? saved.source : DEFAULT_FLASHCARD_PREFS.source,
        scope: FLASHCARD_SCOPES.includes(saved.scope) ? saved.scope : DEFAULT_FLASHCARD_PREFS.scope,
        cardMode: FLASHCARD_CARD_MODES.includes(saved.cardMode) ? saved.cardMode : DEFAULT_FLASHCARD_PREFS.cardMode,
        hideJyutping: Boolean(saved.hideJyutping),
        sessionSize,
        deckId: saved.deckId ?? null,
    };
}

export function saveFlashcardPrefs(patch) {
    const prefs = loadPrefs();
    prefs.flashcard = { ...loadFlashcardPrefs(), ...patch };
    savePrefs(prefs);
    return prefs.flashcard;
}
