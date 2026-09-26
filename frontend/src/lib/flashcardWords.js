import { WORD_FETCH_PAGE_SIZE } from "./constants.js";
import { api, getApiLanguage } from "./api.js";
import { fetchVocabularyBrowsePage } from "./wordBrowseCache.js";
import { vocabLangToLegacy } from "./dataTransforms.js";

export { FLASHCARD_SESSION_SIZES } from "./flashcardPrefs.js";

function shuffleArray(items) {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function browseParamsForConfig(page, pageSize) {
    return {
        page,
        pageSize,
        sortKey: "createdAt",
        sortDir: "desc",
        filter: "all",
        q: "",
        // ⚠️ 2026-09-02: nguồn random bỏ từ đã mastered (progress >= 100) — backend lọc theo user.
        excludeMastered: 1,
        // ⚠️ 2026-09-20: bỏ từ user đánh dấu 🚫 "không muốn học" (cặp ❤️/🚫 với "yêu thích").
        excludeDisliked: 1,
    };
}

async function collectRandomVocabularies(count, { revision, vocabularyTotal } = {}) {
    if (!vocabularyTotal || count <= 0) return [];
    const lang = getApiLanguage();
    const pageSize = WORD_FETCH_PAGE_SIZE;
    const totalPages = Math.max(1, Math.ceil(vocabularyTotal / pageSize));
    const collected = new Map();
    const target = Math.min(count, vocabularyTotal);
    let attempts = 0;
    const maxAttempts = Math.max(totalPages * 4, 12);

    while (collected.size < target && attempts < maxAttempts) {
        const page = Math.floor(Math.random() * totalPages) + 1;
        const result = await fetchVocabularyBrowsePage(browseParamsForConfig(page, pageSize), { revision });

        for (const vocab of result.items ?? []) {
            if (!collected.has(vocab.id)) collected.set(vocab.id, vocabLangToLegacy(vocab, lang));
            if (collected.size >= target) break;
        }
        attempts++;
    }

    return shuffleArray([...collected.values()]).slice(0, target);
}

// ⚠️ 2026-09-01: multiple decks — deckIds mảng, gộp union + dedupe theo id, random trong đó.
async function collectDeckVocabularies(count, deckIds, lang) {
    try {
        const ids = Array.isArray(deckIds) ? deckIds : deckIds ? [deckIds] : [];
        if (!ids.length) return [];
        const valid = lang === "mandarin" ? "mandarin" : "cantonese";
        const seen = new Map();
        for (const deckId of ids) {
            const deck = await api.fetchFlashcardDeck(deckId).catch(() => null);
            if (!deck) continue;
            const items = valid === "mandarin" ? (deck.mandarinVocabularies ?? []) : (deck.cantoneseVocabularies ?? []);
            for (const v of items) {
                if (!v?.id || seen.has(v.id)) continue;
                seen.set(v.id, vocabLangToLegacy(v, valid));
            }
        }
        if (seen.size === 0) return [];
        return shuffleArray([...seen.values()]).slice(0, count);
    } catch {
        return [];
    }
}

// ⚠️ 2026-09-01: source "user" = gộp TẤT CẢ từ trong mọi bộ thẻ (deck) của user (dedupe theo id),
// random trong đó. Lấy theo ngôn ngữ active.
async function collectUserVocabularies(count, lang) {
    try {
        const decks = await api.fetchFlashcardDecks();
        if (!decks || decks.length === 0) return [];
        const valid = lang === "mandarin" ? "mandarin" : "cantonese";
        const seen = new Map();
        for (const deck of decks) {
            const full = await api.fetchFlashcardDeck(deck.id).catch(() => null);
            if (!full) continue;
            const items = valid === "mandarin" ? (full.mandarinVocabularies ?? []) : (full.cantoneseVocabularies ?? []);
            for (const v of items) {
                if (!v?.id || seen.has(v.id)) continue;
                seen.set(v.id, vocabLangToLegacy(v, valid));
            }
        }
        if (seen.size === 0) return [];
        return shuffleArray([...seen.values()]).slice(0, count);
    } catch {
        return [];
    }
}

/**
 * Lấy danh sách từ cho phiên flashcard — theo NGÔN NGỮ active (`lang`).
 * source: "random" (cả bank app) | "user" (gộp tất cả deck của user) | "deck" (theo các deck, cần deckIds).
 * Trả về items đã convert sang legacy shape (vocabLangToLegacy).
 */
export async function fetchFlashcardVocabularies(
    count,
    { source = "random", deckIds = [], lang, revision, vocabularyTotal } = {},
) {
    if (source === "user") {
        return collectUserVocabularies(count, lang);
    }
    if (source === "deck" && deckIds?.length) {
        return collectDeckVocabularies(count, deckIds, lang);
    }
    return collectRandomVocabularies(count, { revision, vocabularyTotal });
}
