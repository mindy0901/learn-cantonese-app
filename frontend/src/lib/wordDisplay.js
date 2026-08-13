import { isSinoVietnameseNone } from "./sinoVietnameseMarkers.js";
import { displaySinoVietnamese, hasFilledSinoVietnamese } from "./sinoVietnameseReadings.js";
import { collectMeaningsField } from "./wordNormalize.js";

/** The vocabulary's romanization array (merged pronunciations). */
export function vocabRomanizations(vocab) {
    return Array.isArray(vocab?.romanization) ? vocab.romanization : [];
}

/**
 * Join a per-pronunciation field across `romanization` (e.g. pinyin/jyutping/
 * sinoVietnamese) with " / ", mirroring the legacy flat column value.
 */
export function vocabRomanizationField(vocab, field) {
    const roms = vocabRomanizations(vocab);
    const seen = [];
    for (const r of roms) {
        const v = String(r?.[field] ?? "").trim();
        if (v && !seen.includes(v)) seen.push(v);
    }
    return seen.join(" / ");
}

/** Flat list of every meaning across all pronunciations (deduped by id).
 *  Manual meanings được nhân đôi ở cả reading pinyin lẫn jyutping — dedupe
 *  theo `id` để summary bảng không lặp. */
export function vocabMeanings(vocab) {
    const roms = vocabRomanizations(vocab);
    const seen = new Set();
    const out = [];
    for (const r of roms) {
        for (const m of Array.isArray(r?.meanings) ? r.meanings : []) {
            if (m?.id && seen.has(m.id)) continue;
            if (m?.id) seen.add(m.id);
            out.push(m);
        }
    }
    return out;
}

/** Table summary from the child-table meanings first, falling back to flat fields. */
export function vocabularyFieldSummary(vocab, field) {
    if (field === "vietMeanings" || field === "engMeanings") {
        const joined =
            collectMeaningsField(vocabMeanings(vocab), field) || collectMeaningsField(vocab?.meanings, field);
        if (joined) return joined;
    }
    return String(vocab?.[field] ?? "").trim();
}

/** True when Sino-Vietnamese, Vietnamese, or English is still empty / placeholder-only. */
export function isVocabularyFieldPending(vocab, field) {
    if (field === "sinoVietnamese") {
        const sinoVietnamese = String(
            vocabRomanizationField(vocab, "sinoVietnamese") || (vocab?.sinoVietnamese ?? ""),
        ).trim();
        if (!sinoVietnamese) return true;
        if (isSinoVietnameseNone(sinoVietnamese)) return false;
        return !hasFilledSinoVietnamese(sinoVietnamese);
    }
    return !vocabularyFieldSummary(vocab, field);
}

/** Display value for a vocabulary field, or the localized "updating" label when pending. */
export function vocabularyFieldDisplayText(vocab, field, updatingLabel) {
    if (field === "sinoVietnamese") {
        const sinoVietnamese = String(
            vocabRomanizationField(vocab, "sinoVietnamese") || (vocab?.sinoVietnamese ?? ""),
        ).trim();
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
    return String(vocabRomanizationField(vocab, "jyutping") || (vocab.jyutping ?? "")).trim();
}
