/**
 * Han character lookup display helpers.
 * Used by VocabularyDetailContent for displaying traditional/simplified variants.
 */

/**
 * Extract han forms for display — CHỈ dùng cặp simp + hk.
 * Dạng đỏ (thay vai "phồn thể") = hanHongKong; `traditional` giữ để tương thích
 * code cũ (VocabularyDetailContent), giờ trỏ về HK.
 */
export function vocabularyLookupDisplay(word) {
    const traditional = word.hanHongKong || word.hanTraditional || word.traditional || "";
    const simplified = word.hanSimplified || word.simplified || "";
    const hongKong = word.hanHongKong ?? "";
    // showSimplified = hiện 2 cột khi CÓ cả simp + hk và khác nhau.
    const showSimplified = Boolean(traditional) && Boolean(simplified) && simplified !== traditional;
    return { traditional, simplified, hongKong, showSimplified };
}
