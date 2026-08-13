import { create } from "zustand";

const STORAGE_KEY = "cantonese-app-ui";

function normalizeTheme(theme) {
    return theme === "dark" || theme === "light" ? theme : "light";
}

function loadUiState() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            return { theme: normalizeTheme(parsed.theme) };
        }
    } catch {
        /* ignore */
    }
    return { theme: "light" };
}

const initialUi = loadUiState();
document.documentElement.dataset.theme = initialUi.theme;

export const useUiStore = create((set, get) => ({
    theme: initialUi.theme,

    persistUi: (patch) => {
        const next = { theme: get().theme, ...patch };
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
            /* ignore quota/private mode */
        }
        set(patch);
    },

    setTheme: (theme) => {
        document.documentElement.dataset.theme = theme;
        get().persistUi({ theme });
    },

    toggleTheme: () => {
        get().setTheme(get().theme === "dark" ? "light" : "dark");
    },
}));
