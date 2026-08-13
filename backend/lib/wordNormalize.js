/** Trailing sentence punctuation (Latin + CJK). Does not strip internal dots. */
import { SINO_VIETNAMESE_NONE, isSinoVietnameseNone } from "./sinoVietnameseMarkers.js";
import { normalizeSinoVietnameseValue } from "./sinoVietnameseReadings.js";

const TRAILING_PUNCT_RE = /(?:\.{2,}|[\s.,?!…:;，。！？、])+$/u;

/**
 * Convert CJK/Chinese punctuation to ASCII in GENERATED romanization output
 * (pinyin/jyutping). The han source keeps its CJK punctuation (。，…), but the
 * romanization line should use normal ASCII punctuation with no stray spaces.
 * e.g. "wǒ de bà ba … yuán 。" → "wǒ de bà ba … yuán."
 */
export function normalizeRomanizationPunctuation(value) {
    return (
        String(value ?? "")
            .replace(/[。]/g, ".")
            .replace(/[，、]/g, ",")
            .replace(/[！]/g, "!")
            .replace(/[？]/g, "?")
            .replace(/[；]/g, ";")
            .replace(/[：]/g, ":")
            .replace(/[（]/g, "(")
            .replace(/[）]/g, ")")
            .replace(/[「」『』“”]/g, '"')
            .replace(/[‘’]/g, "'")
            // Remove stray spaces before closing punctuation / after opening punctuation.
            .replace(/\s+([.,!?;:)])/g, "$1")
            .replace(/([(])\s+/g, "$1")
    );
}

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
        .map((token) => {
            // Erhua suffix: keep lowercase "r"
            if (token === "r" || token === "R") return "r";
            return titleCaseToken(token);
        })
        .join(" ");
}

/**
 * Capitalize the first letter of the whole string and of each item after
 * `.`, `!`, `?`, `;` and (optionally) `,`. Used for vietMeanings / engMeanings.
 * Does NOT lowercase the rest — only enforces the leading letter case.
 * `opts.comma` adds `,` (used for engMeanings).
 */
export function capitalizeSentences(value, opts = {}) {
    const s = String(value ?? "").trim();
    if (!s) return s;
    return opts.comma
        ? s.replace(/(^|[.,!?;/]\s*)(\p{L})/gu, (_m, pre, ch) => pre + ch.toLocaleUpperCase("vi"))
        : s.replace(/(^|[.!?;/]\s*)(\p{L})/gu, (_m, pre, ch) => pre + ch.toLocaleUpperCase("vi"));
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
    const hanTraditional = resolveHanTraditional(vocab);
    const hanSimplified = stripTrailingPunctuation(vocab.hanSimplified);
    const next = {
        ...vocab,
        engMeanings: capitalizeSentences(stripTrailingPunctuation(vocab.engMeanings), { comma: true }),
        hanTraditional,
        hanSimplified: hanSimplified || undefined,
        vietMeanings: capitalizeSentences(stripTrailingPunctuation(vocab.vietMeanings)),
    };
    delete next.han;
    if (!hanSimplified) {
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
        next.jyutping = stripTrailingPunctuation(vocab.jyutping).toLowerCase();
    } else {
        delete next.jyutping;
    }
    if (vocab.pinyin != null && vocab.pinyin !== "") {
        next.pinyin = stripTrailingPunctuation(vocab.pinyin).toLowerCase();
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
        Boolean(a.important) === Boolean(b.important) &&
        Boolean(a.mastered) === Boolean(b.mastered)
    );
}
