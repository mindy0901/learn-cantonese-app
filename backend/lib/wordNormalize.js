/** Trailing sentence punctuation (Latin + CJK). Does not strip internal dots. */
import { ensureHanVariants } from "./opencc.js";
import { inferDialect } from "./wordDialect.js";
import { mergePopularity, normalizePopularity } from "./wordPopularity.js";
import { HAN_VIET_NONE, isHanVietNone } from "./hanVietMarkers.js";
import { normalizeHanVietValue } from "./hanVietReadings.js";

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

export function normWordField(value) {
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

/** @param {{ hanTraditional?: string, hanTrad?: string, han?: string }} word */
function resolveHanTraditional(word) {
    return stripTrailingPunctuation(word.hanTraditional ?? word.hanTrad ?? word.han);
}

/** Duplicate when dialect + Hán tự + romanization match (ignoring trailing punctuation). */
export function wordMergeKey(word) {
    const dialect = inferDialect(word);
    return `${dialect}|${normWordField(resolveHanTraditional(word))}|${normWordField(word.jyutping)}|${normWordField(word.pinyin)}`;
}

export function wordKeyIsEmpty(key) {
    return !key.replace(/\|/g, "").length;
}

export function normalizeWordFields(word) {
    const hanVariants = ensureHanVariants({
        hanTraditional: resolveHanTraditional(word),
        hanSimplified: stripTrailingPunctuation(word.hanSimplified),
    });
    const next = {
        ...word,
        english: toDisplayCase(stripTrailingPunctuation(word.english)),
        hanTraditional: hanVariants.hanTraditional,
        hanSimplified: hanVariants.hanSimplified || undefined,
        vietnamese: toDisplayCase(stripTrailingPunctuation(word.vietnamese)),
    };
    delete next.han;
    if (!hanVariants.hanSimplified) {
        delete next.hanSimplified;
    }
    if (word.hanViet != null && word.hanViet !== "") {
        if (isHanVietNone(word.hanViet)) {
            next.hanViet = HAN_VIET_NONE;
        } else {
            next.hanViet = normalizeHanVietValue(word.hanViet);
        }
    }
    if (word.jyutping != null && word.jyutping !== "") {
        next.jyutping = stripTrailingPunctuation(word.jyutping);
    } else {
        delete next.jyutping;
    }
    if (word.pinyin != null && word.pinyin !== "") {
        next.pinyin = stripTrailingPunctuation(word.pinyin);
    } else {
        delete next.pinyin;
    }
    next.dialect = inferDialect(next);
    const vietnameseDetail = String(word.vietnameseDetail ?? "").trim();
    if (vietnameseDetail) {
        next.vietnameseDetail = vietnameseDetail;
    } else {
        delete next.vietnameseDetail;
    }
    const popularity = normalizePopularity(word.popularity);
    if (popularity !== null) {
        next.popularity = popularity;
    } else {
        delete next.popularity;
    }
    delete next.definitions;
    return next;
}

export function mergeWordFieldsPreferFilled(existing, incoming) {
    return {
        id: existing.id,
        english: "english" in incoming ? (incoming.english ?? "") : (existing.english ?? ""),
        hanTraditional:
            "hanTraditional" in incoming || "hanTrad" in incoming || "han" in incoming
                ? (incoming.hanTraditional ?? incoming.hanTrad ?? incoming.han ?? "")
                : (existing.hanTraditional ?? existing.hanTrad ?? existing.han ?? ""),
        hanSimplified: "hanSimplified" in incoming ? incoming.hanSimplified || undefined : existing.hanSimplified,
        vietnamese: "vietnamese" in incoming ? (incoming.vietnamese ?? "") : (existing.vietnamese ?? ""),
        hanViet: "hanViet" in incoming ? incoming.hanViet || undefined : existing.hanViet,
        jyutping: "jyutping" in incoming ? (incoming.jyutping ?? "") : (existing.jyutping ?? ""),
        pinyin: "pinyin" in incoming ? (incoming.pinyin ?? "") : (existing.pinyin ?? ""),
        dialect: "dialect" in incoming ? (incoming.dialect ?? existing.dialect) : (existing.dialect ?? "cantonese"),
        vietnameseDetail:
            "vietnameseDetail" in incoming ? incoming.vietnameseDetail || undefined : existing.vietnameseDetail,
        important: Boolean(existing.important || incoming.important),
        mastered: Boolean(existing.mastered || incoming.mastered),
        popularity: mergePopularity(
            "popularity" in incoming ? incoming.popularity : existing.popularity,
            existing.popularity,
        ),
        createdAt: existing.createdAt ?? incoming.createdAt,
        updatedAt: incoming.updatedAt ?? existing.updatedAt,
    };
}

export function wordContentEqual(a, b) {
    return (
        normWordField(a.english) === normWordField(b.english) &&
        normWordField(resolveHanTraditional(a)) === normWordField(resolveHanTraditional(b)) &&
        normWordField(a.hanSimplified) === normWordField(b.hanSimplified) &&
        normWordField(a.vietnamese) === normWordField(b.vietnamese) &&
        normWordField(a.hanViet) === normWordField(b.hanViet) &&
        normWordField(a.jyutping) === normWordField(b.jyutping) &&
        normWordField(a.pinyin) === normWordField(b.pinyin) &&
        inferDialect(a) === inferDialect(b) &&
        Boolean(a.important) === Boolean(b.important) &&
        Boolean(a.mastered) === Boolean(b.mastered)
    );
}
