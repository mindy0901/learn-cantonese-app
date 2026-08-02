import { isSinoVietnameseNone } from "./sinoVietnameseMarkers.js";
import { displaySinoVietnamese, hasFilledSinoVietnamese } from "./sinoVietnameseReadings.js";

/** Table summary from top-level english / vietnamese fields. */
export function vocabularyFieldSummary(vocab, field) {
    return String(vocab[field] ?? "").trim();
}

/** True when Sino-Vietnamese, Vietnamese, or English is still empty / placeholder-only. */
export function isVocabularyFieldPending(vocab, field) {
    if (field === "sinoVietnamese") {
        const sinoVietnamese = String(vocab?.sinoVietnamese ?? "").trim();
        if (!sinoVietnamese) return true;
        if (isSinoVietnameseNone(sinoVietnamese)) return false;
        return !hasFilledSinoVietnamese(sinoVietnamese);
    }
    return !vocabularyFieldSummary(vocab, field);
}

/** Display value for a vocabulary field, or the localized "updating" label when pending. */
export function vocabularyFieldDisplayText(vocab, field, updatingLabel) {
    if (field === "sinoVietnamese") {
        const sinoVietnamese = String(vocab?.sinoVietnamese ?? "").trim();
        if (!sinoVietnamese) return updatingLabel || "pending";
        if (!isSinoVietnameseNone(sinoVietnamese) && !hasFilledSinoVietnamese(sinoVietnamese)) {
            return updatingLabel;
        }
        return displaySinoVietnamese(sinoVietnamese);
    }
    return vocabularyFieldSummary(vocab, field) || updatingLabel || "pending";
}

/** Traditional Chinese characters for tables and lists. */
export function displayHan(vocab) {
    return String(vocab.hanTraditional ?? vocab.hanTrad ?? vocab.han ?? "").trim();
}

/** Jyutping for tables and lists. */
export function displayRomanization(vocab) {
    return String(vocab.jyutping ?? "").trim();
}
