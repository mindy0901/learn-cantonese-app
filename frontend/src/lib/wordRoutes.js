import { useAppStore } from "../store/appStore.js";

/** Prefix ngôn ngữ cho route (2026-08-22 — route tách ngôn ngữ, KHÔNG còn mode toggle). */
export function languageRoutePrefix(lang) {
    return lang === "mandarin" ? "m" : "c";
}

/** Đường dẫn chi tiết 1 từ — tự lấy ngôn ngữ active từ store (route-driven). */
export function vocabularyDetailPath(han) {
    const lang = useAppStore.getState().language;
    return `/${languageRoutePrefix(lang)}/vocabulary/${encodeURIComponent(String(han ?? ""))}`;
}

/** Đường dẫn kho từ vựng — theo ngôn ngữ active. */
export function vocabularyBankPath() {
    const lang = useAppStore.getState().language;
    return `/${languageRoutePrefix(lang)}/vocabulary`;
}
