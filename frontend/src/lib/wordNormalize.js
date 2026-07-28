/** Trailing sentence punctuation (Latin + CJK). Does not strip internal dots. */
import { ensureHanVariants } from "./opencc.js";
import { SINO_VIETNAMESE_NONE, isSinoVietnameseNone } from "./sinoVietnameseMarkers.js";
import { normalizeSinoVietnameseValue } from "./sinoVietnameseReadings.js";

const TRAILING_PUNCT_RE = /(?:\.{2,}|[\s.,?!…:;，。！？、])+$/u;

export function stripTrailingPunctuation(value) {
    let s = String(value ?? "").trim();
    while (s.length > 0) {
        const next = s.replace(TRAILING_PUNCT_RE, "").trim();
        if (next === s) break;
        s = next;
    }
    return s;
}

export function normVocabularyField(value) {
    return stripTrailingPunctuation(value).toLowerCase();
}

/** Title-case each word (and hyphen segment) for Hán–Việt / Vietnamese / English display. */
function titleCaseSegment(segment) {
    if (!segment) return segment;
    const lower = segment.toLocaleLowerCase("vi");
    return lower.charAt(0).toLocaleUpperCase("vi") + lower.slice(1);
}

function titleCaseToken(token) {
    return token.split("-").map(titleCaseSegment).join("-");
}

export function toDisplayCase(value) {
    return String(value ?? "")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map(titleCaseToken)
        .join(" ");
}

/** @param {{ hanTraditional?: string, hanTrad?: string, han?: string }} vocab */
function resolveHanTraditional(vocab) {
    return stripTrailingPunctuation(vocab.hanTraditional ?? vocab.hanTrad ?? vocab.han);
}

/** Duplicate when Hán tự + romanization match (ignoring trailing punctuation). */
export function vocabularyMergeKey(vocab) {
    return `${normVocabularyField(resolveHanTraditional(vocab))}|${normVocabularyField(vocab.jyutping)}|${normVocabularyField(vocab.pinyin)}`;
}

export function vocabularyKeyIsEmpty(key) {
    return !key.replace(/\|/g, "").length;
}

export function normalizeVocabularyFields(vocab) {
    const hanVariants = ensureHanVariants({
        hanTraditional: resolveHanTraditional(vocab),
        hanSimplified: stripTrailingPunctuation(vocab.hanSimplified),
    });
    const next = {
        ...vocab,
        engMeanings: toDisplayCase(stripTrailingPunctuation(vocab.engMeanings)),
        hanTraditional: hanVariants.hanTraditional,
        hanSimplified: hanVariants.hanSimplified || undefined,
        vietMeanings: toDisplayCase(stripTrailingPunctuation(vocab.vietMeanings)),
    };
    delete next.han;
    if (!hanVariants.hanSimplified) {
        delete next.hanSimplified;
    }
    if (vocab.sinoVietnamese != null && vocab.sinoVietnamese !== "") {
        if (isSinoVietnameseNone(vocab.sinoVietnamese)) {
            next.sinoVietnamese = SINO_VIETNAMESE_NONE;
        } else {
            next.sinoVietnamese = normalizeSinoVietnameseValue(vocab.sinoVietnamese);
        }
    }
    if (vocab.jyutping != null && vocab.jyutping !== "") {
        next.jyutping = stripTrailingPunctuation(vocab.jyutping);
    } else {
        delete next.jyutping;
    }
    if (vocab.pinyin != null && vocab.pinyin !== "") {
        next.pinyin = stripTrailingPunctuation(vocab.pinyin);
    } else {
        delete next.pinyin;
    }
    const vietExamples = String(vocab.vietExamples ?? "").trim();
    if (vietExamples) {
        next.vietExamples = vietExamples;
    } else {
        delete next.vietExamples;
    }
    delete next.popularity;
    delete next.definitions;
    return next;
}

export function mergeVocabularyFieldsPreferFilled(existing, incoming) {
    return {
        id: existing.id,
        engMeanings: "engMeanings" in incoming ? (incoming.engMeanings ?? "") : (existing.engMeanings ?? ""),
        hanTraditional:
            "hanTraditional" in incoming || "hanTrad" in incoming || "han" in incoming
                ? (incoming.hanTraditional ?? incoming.hanTrad ?? incoming.han ?? "")
                : (existing.hanTraditional ?? existing.hanTrad ?? existing.han ?? ""),
        hanSimplified: "hanSimplified" in incoming ? incoming.hanSimplified || undefined : existing.hanSimplified,
        vietMeanings: "vietMeanings" in incoming ? (incoming.vietMeanings ?? "") : (existing.vietMeanings ?? ""),
        sinoVietnamese: "sinoVietnamese" in incoming ? incoming.sinoVietnamese || undefined : existing.sinoVietnamese,
        jyutping: "jyutping" in incoming ? (incoming.jyutping ?? "") : (existing.jyutping ?? ""),
        pinyin: "pinyin" in incoming ? (incoming.pinyin ?? "") : (existing.pinyin ?? ""),
        vietExamples: "vietExamples" in incoming ? incoming.vietExamples || undefined : existing.vietExamples,
        important: Boolean(existing.important || incoming.important),
        mastered: Boolean(existing.mastered || incoming.mastered),

        createdAt: existing.createdAt ?? incoming.createdAt,
        updatedAt: incoming.updatedAt ?? existing.updatedAt,
    };
}

export function vocabularyContentEqual(a, b) {
    return (
        normVocabularyField(a.engMeanings) === normVocabularyField(b.engMeanings) &&
        normVocabularyField(resolveHanTraditional(a)) === normVocabularyField(resolveHanTraditional(b)) &&
        normVocabularyField(a.hanSimplified) === normVocabularyField(b.hanSimplified) &&
        normVocabularyField(a.vietMeanings) === normVocabularyField(b.vietMeanings) &&
        normVocabularyField(a.sinoVietnamese) === normVocabularyField(b.sinoVietnamese) &&
        normVocabularyField(a.jyutping) === normVocabularyField(b.jyutping) &&
        normVocabularyField(a.pinyin) === normVocabularyField(b.pinyin) &&
        String(a.vietExamples ?? "").trim() === String(b.vietExamples ?? "").trim() &&
        Boolean(a.important) === Boolean(b.important) &&
        Boolean(a.mastered) === Boolean(b.mastered) &&
        String(a.hskLevel ?? "").trim() === String(b.hskLevel ?? "").trim() &&
        JSON.stringify(a.meanings ?? []) === JSON.stringify(b.meanings ?? [])
    );
}
