/** Trailing sentence punctuation (Latin + CJK). Does not strip internal dots. */
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

/** Giữ CHỈ ký tự Hán — hán tự KHÔNG được chứa dấu câu/khoảng trắng/ký tự khác (2026-09-08). */
export function keepOnlyHan(value) {
    return [...String(value ?? "")].filter((ch) => /\p{Script=Han}/u.test(ch)).join("");
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

/**
 * Capitalize the first letter of the whole string and of each item
 * after `.`, `!`, `?`, `;` and (optionally) `,`. Used for vietMeanings /
 * engMeanings. Does NOT lowercase the rest — only enforces the leading
 * letter case. `opts.comma` adds `,` to the separator set (used for
 * engMeanings so "capable; smart, brilliant" → "Capable; Smart, Brilliant").
 */
export function capitalizeSentences(value, opts = {}) {
    const s = String(value ?? "").trim();
    if (!s) return s;
    // eslint-disable-next-line no-control-regex
    return opts.comma
        ? s.replace(/(^|[.,!?;/]\s*)(\p{L})/gu, (_m, pre, ch) => pre + ch.toLocaleUpperCase("vi"))
        : s.replace(/(^|[.!?;/]\s*)(\p{L})/gu, (_m, pre, ch) => pre + ch.toLocaleUpperCase("vi"));
}

/**
 * Join a field across the child-table meanings array (`vocabulary_meanings`).
 * Example: vocab.meanings = [{ vietMeanings: "A", engMeanings: "X" }, { vietMeanings: "B", engMeanings: "Y" }]
 *   collectMeaningsField(vocab.meanings, "vietMeanings") → "A; B"
 * Returns "" when there are no meanings or none have the field.
 */
export function collectMeaningsField(meanings, field, limit) {
    if (!Array.isArray(meanings) || meanings.length === 0) return "";
    const sliced = typeof limit === "number" && limit > 0 ? meanings.slice(0, limit) : meanings;
    const parts = sliced.map((m) => String(m?.[field] ?? "").trim()).filter(Boolean);
    return displayMeaning(parts.join("; "));
}

/**
 * Display form for a meaning string: capitalize the first letter of the whole
 * string and of each item after a comma (and `.`, `!`, `?`, `;`). Data is
 * stored lowercase (after sync); this restores nice casing ONLY for display.
 *
 * 2026-09-03: giữa các MỤC NGHĨA NGẮN, separator hiển thị dùng "/" thay cho dấu phẩy
 * (vd "phá vỡ, phá hỏng" → "Phá vỡ / Phá hỏng"). Chỉ áp dụng khi mọi mục đều ngắn
 * (≤ MAX_ITEM ký tự) — câu mô tả DÀI có dấu phẩy bên trong giữ nguyên (tránh bẻ câu).
 * Example: "1, một, số 1, số một" → "1 / Một / Số 1 / Số một".
 */
const MEANING_SLASH_MAX_ITEM = 40;

export function displayMeaning(value) {
    const s = String(value ?? "").trim();
    if (!s) return s;
    const items = s
        .split(/[,;]+/)
        .map((it) => it.trim())
        .filter(Boolean);
    const isShortList = items.length >= 2 && items.every((it) => it.length <= MEANING_SLASH_MAX_ITEM);
    if (isShortList) {
        return items.map((it) => capitalizeSentences(it, { comma: true })).join(" / ");
    }
    return capitalizeSentences(s, { comma: true });
}

/** @param {{ hanTraditional?: string, hanTrad?: string, han?: string }} vocab */
function resolveHanTraditional(vocab) {
    return keepOnlyHan(vocab.hanTraditional ?? vocab.hanTrad ?? vocab.han);
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
    const hanSimplified = keepOnlyHan(vocab.hanSimplified);
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
    // Pure Cantonese words no longer drop pinyin/simplified here — the UI
    // keeps both fields and marks the traditional form with a strikethrough
    // (Cantonese & Mandarin both use the simplified spelling).
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
        favorite: Boolean(existing.favorite || incoming.favorite),
        mastered: Boolean(existing.mastered || incoming.mastered),
        pureCantonese: Boolean(existing.pureCantonese || incoming.pureCantonese),

        createdAt: existing.createdAt ?? incoming.createdAt,
        updatedAt: incoming.updatedAt ?? existing.updatedAt,
    };
}

export function vocabularyContentEqual(a, b) {
    // Compare meanings & romanization while ignoring temp ids used for editing.
    const jsonNoTemp = (v) => JSON.stringify(v ?? [], (k, val) => (k === "_tempId" ? undefined : val));
    return (
        normVocabularyField(a.engMeanings) === normVocabularyField(b.engMeanings) &&
        normVocabularyField(resolveHanTraditional(a)) === normVocabularyField(resolveHanTraditional(b)) &&
        normVocabularyField(a.hanSimplified) === normVocabularyField(b.hanSimplified) &&
        normVocabularyField(a.vietMeanings) === normVocabularyField(b.vietMeanings) &&
        normVocabularyField(a.sinoVietnamese) === normVocabularyField(b.sinoVietnamese) &&
        normVocabularyField(a.jyutping) === normVocabularyField(b.jyutping) &&
        normVocabularyField(a.pinyin) === normVocabularyField(b.pinyin) &&
        String(a.vietExamples ?? "").trim() === String(b.vietExamples ?? "").trim() &&
        Boolean(a.favorite) === Boolean(b.favorite) &&
        Boolean(a.mastered) === Boolean(b.mastered) &&
        String(a.hskLevel ?? "").trim() === String(b.hskLevel ?? "").trim() &&
        Number(a.popularityLevel ?? null) === Number(b.popularityLevel ?? null) &&
        Boolean(a.pureCantonese) === Boolean(b.pureCantonese) &&
        JSON.stringify(a.relatedWords ?? null) === JSON.stringify(b.relatedWords ?? null) &&
        jsonNoTemp(a.meanings) === jsonNoTemp(b.meanings) &&
        jsonNoTemp(a.romanization) === jsonNoTemp(b.romanization)
    );
}
