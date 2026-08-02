/**
 * Han character lookup display helpers.
 * Used by WordRow and WordDetailContent for displaying traditional/simplified variants.
 */

/**
 * Extract traditional + simplified characters for display.
 * Falls back gracefully if either is missing.
 */
export function vocabularyLookupDisplay(word) {
    const traditional = word.hanTraditional || word.traditional || "";
    const simplified = word.hanSimplified || word.simplified || traditional;
    const showSimplified = simplified !== traditional;
    return { traditional, simplified, showSimplified };
}
