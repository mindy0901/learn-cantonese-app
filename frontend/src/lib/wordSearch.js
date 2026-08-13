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
