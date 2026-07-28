import { expandHanSearchTerms, ensureHanVariants } from "./opencc.js";

export function normalizeSearchText(text) {
    return String(text ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .replace(/đ/g, "d")
        .replace(/[–—−]/g, "-")
        .replace(/\s+/g, " ")
        .trim();
}

/** Vietnamese tone combining marks (Unicode NFD): huyền, sắc, hỏi, ngã, nặng */
const TONE_MARKS = /[\u0300\u0301\u0303\u0309\u0323]/g;

/**
 * Strip only Vietnamese tone marks while keeping vowel diacritics (ă, â, ê, ô, ơ, ư).
 * "lướng" → "lương" (tilde removed, horn kept)
 * "lương" → "lương" (unchanged — no tone marks)
 */
export function stripTones(text) {
    return String(text ?? "")
        .normalize("NFD")
        .replace(TONE_MARKS, "")
        .normalize("NFC"); // recompose to precomposed form
}

/**
 * Check whether the text contains Vietnamese tone marks (≠ vowel diacritics).
 * "lướng" → true (has ngã), "lương" → false (only vowel ươ), "luong" → false
 */
export function hasToneDiacritics(text) {
    const stripped = stripTones(text);
    // Compare after lowercasing — if stripping tones changed the string, it had tones
    return stripped.toLowerCase() !== String(text ?? "").toLowerCase();
}

/** Expand a query into normalized variants (OpenCC Han, accent-less, tone-less romanization, tokens). */
export function searchQueryVariants(text) {
    const raw = String(text ?? "").trim();
    const normalized = normalizeSearchText(raw);
    const variants = new Set();

    for (const term of expandHanSearchTerms(raw)) {
        variants.add(term);
    }

    if (normalized) {
        variants.add(normalized);
        const noTones = normalized.replace(/\d/g, "").replace(/\s+/g, " ").trim();
        if (noTones) variants.add(noTones);

        const noSpaces = normalized.replace(/\s/g, "");
        if (noSpaces) variants.add(noSpaces);

        const noTonesNoSpaces = noTones.replace(/\s/g, "");
        if (noTonesNoSpaces) variants.add(noTonesNoSpaces);

        for (const token of normalized.split(/\s+/).filter(Boolean)) {
            variants.add(token);
            const bare = token.replace(/\d/g, "");
            if (bare) variants.add(bare);
        }
    }

    return [...variants].filter(Boolean);
}

function romanizationTokens(value) {
    const base = normalizeSearchText(value);
    return [...base.split(/\s+/).filter(Boolean), base.replace(/\d/g, ""), base.replace(/\s/g, "")];
}

export function getVocabularySearchBlob(vocab) {
    const { hanTraditional, hanSimplified } = ensureHanVariants({
        hanTraditional: vocab.hanTraditional,
        hanSimplified: vocab.hanSimplified,
    });
    const hanTerms = [...new Set([...expandHanSearchTerms(hanTraditional), ...expandHanSearchTerms(hanSimplified)])];

    const parts = [
        vocab.engMeanings,
        hanTraditional,
        hanSimplified,
        ...hanTerms,
        vocab.vietMeanings,
        vocab.vietExamples ?? "",
        vocab.sinoVietnamese ?? "",
        vocab.cantonese ?? "",
        vocab.category ?? "",
        ...(vocab.jyutping ? romanizationTokens(vocab.jyutping) : []),
        ...(vocab.pinyin ? romanizationTokens(vocab.pinyin) : []),
    ];
    return parts.map(normalizeSearchText).filter(Boolean).join(" ");
}
