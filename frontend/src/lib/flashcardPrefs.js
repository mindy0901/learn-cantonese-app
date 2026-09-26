import { loadPrefs, savePrefs } from "./prefs.js";

export const FLASHCARD_SESSION_SIZES = [20, 50, 100];

// ⚠️ 2026-09: SRS (user_vocabularies) đã bỏ → nguồn: random (toàn bộ app) | user (gộp tất cả deck của
// user) | deck (theo 1 bộ thẻ). Không còn source "due".
export const FLASHCARD_SOURCES = ["random", "user", "deck"];

export const FLASHCARD_SCOPES = ["all"];

export const DEFAULT_FLASHCARD_PREFS = {
    source: "random",
    scope: "all",
    sessionSize: 20,
    deckIds: [],
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
        sessionSize,
        // ⚠️ 2026-09-01: deckIds là lựa chọn theo phiên (session-only) — KHÔNG đọc từ localStorage,
        // luôn reset rỗng sau F5. (Bỏ fallback deckId cũ — tránh khôi phục lựa chọn bộ thẻ cũ.)
        deckIds: [],
    };
}

export function saveFlashcardPrefs(patch) {
    const prefs = loadPrefs();
    const merged = { ...loadFlashcardPrefs(), ...patch };
    // ⚠️ 2026-09-01: deckIds (và deckId legacy) là session-only — KHÔNG lưu localStorage.
    // Giữ deckIds trong state trả về (UI giữ lựa chọn khi đang trong phiên), nhưng bỏ khi persist
    // → sau F5 checkbox chọn bộ từ sẽ reset về rỗng.
    const { deckIds, deckId, ...persisted } = merged;
    prefs.flashcard = persisted;
    savePrefs(prefs);
    return merged;
}
