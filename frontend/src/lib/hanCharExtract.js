import { toHanSimplified, toHanHK } from './opencc.js'

/**
 * Extract unique Chinese characters from word strings.
 * Matches CJK Unified Ideographs (U+4E00–U+9FFF) and Extension A (U+3400–U+4DBF).
 */
const HAN_REGEX = /[\u3400-\u4dbf\u4e00-\u9fff]/g;

/**
 * Extract unique Chinese characters from an array of words.
 * Scans hanTraditional and hanSimplified fields.
 * @param {Array<{hanTraditional?: string, hanSimplified?: string}>} words
 * @returns {string[]} unique characters sorted by Unicode code point
 */
export function extractHanCharsFromWords(words) {
    const chars = new Set();
    for (const word of words) {
        const text = (word.hanTraditional ?? "") + (word.hanSimplified ?? "");
        for (const ch of text) {
            if (HAN_REGEX.test(ch)) chars.add(ch);
        }
        HAN_REGEX.lastIndex = 0; // reset regex after test()
    }
    return [...chars].sort((a, b) => a.localeCompare(b, "zh"));
}

/**
 * Find characters present in words but missing from hanCharacters.
 * Checks both hanSimplified and hanTraditional fields, including OpenCC variants.
 * @param {Array<{hanTraditional?: string, hanSimplified?: string}>} words
 * @param {Array<{hanSimplified: string, hanTraditional?: string}>} hanCharacters
 * @returns {string[]} characters to add
 */
export function findMissingHanChars(words, hanCharacters) {
    const wordChars = extractHanCharsFromWords(words);
    const existing = new Set();
    for (const h of hanCharacters) {
        if (h.hanSimplified) existing.add(h.hanSimplified);
        if (h.hanTraditional) existing.add(h.hanTraditional);
    }

    const hasVariant = (ch) => {
        if (existing.has(ch)) return true;
        // Check OpenCC variants (冲 ↔ 衝, 系 ↔ 係, etc.)
        const simp = toHanSimplified(ch);
        if (simp !== ch && existing.has(simp)) return true;
        const trad = toHanHK(ch);
        if (trad !== ch && existing.has(trad)) return true;
        return false;
    };

    return wordChars.filter((ch) => !hasVariant(ch));
}
