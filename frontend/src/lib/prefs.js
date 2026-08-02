const STORAGE_KEY = "cantonese-app-prefs";

export const DEFAULT_PREFS = {
    wordBank: {
        filter: "all",
        showImportant: false,
        showMastered: false,
        hskLevel: "all",
        sortKey: "sinoVietnamese",
        sortDir: "asc",
    },
    grammarBank: {
        filter: "all",
        sortKey: "title",
        sortDir: "asc",
    },
    sentenceBank: {
        filter: "all",
        sortKey: "hanTraditional",
        sortDir: "asc",
    },
    flashcard: {},
};

function mergeSection(defaults, saved) {
    if (!saved || typeof saved !== "object") return { ...defaults };
    return { ...defaults, ...saved };
}

function mergeWordBankPrefs(defaults, saved) {
    const merged = mergeSection(defaults, saved);
    if (merged.sortKey === "mastered") {
        return { ...merged, sortKey: defaults.sortKey };
    }
    return merged;
}

export function loadPrefs() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return structuredClone(DEFAULT_PREFS);
        const parsed = JSON.parse(raw);
        return {
            wordBank: mergeWordBankPrefs(DEFAULT_PREFS.wordBank, parsed.wordBank),
            grammarBank: mergeSection(DEFAULT_PREFS.grammarBank, parsed.grammarBank),
            sentenceBank: mergeSection(DEFAULT_PREFS.sentenceBank, parsed.sentenceBank),
            flashcard: mergeSection(DEFAULT_PREFS.flashcard, parsed.flashcard ?? parsed.study),
        };
    } catch {
        return structuredClone(DEFAULT_PREFS);
    }
}

export function savePrefs(prefs) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}
