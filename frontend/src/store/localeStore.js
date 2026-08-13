import { create } from "zustand";
import { formatMessage, translations } from "../i18n/index.js";

const STORAGE_KEY = "app-locale";

function loadInitialLocale() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved && translations[saved]) return saved;
    } catch {
        /* ignore */
    }
    return "vi";
}

const initialLocale = loadInitialLocale();
document.documentElement.lang = initialLocale;

export const useLocaleStore = create((set) => ({
    locale: initialLocale,

    setLocale: (locale) => {
        if (!translations[locale]) return;
        document.documentElement.lang = locale;
        try {
            localStorage.setItem(STORAGE_KEY, locale);
        } catch {
            /* ignore */
        }
        set({ locale });
    },
}));

export function useLocale() {
    const locale = useLocaleStore((s) => s.locale);
    return {
        locale,
        setLocale: (l) => useLocaleStore.getState().setLocale(l),
        t: translations[locale] ?? translations.vi,
        fmt: formatMessage,
    };
}
