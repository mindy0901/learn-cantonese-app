import { SINO_VIETNAMESE_NONE, isSinoVietnameseNone, isSinoVietnameseDash } from "./sinoVietnameseMarkers.js";

/** Placeholder for Han characters without a known Sino-Vietnamese reading yet. */
export const SINO_VIETNAMESE_PLACEHOLDER = "•";
/** Previous placeholder kept for reading legacy synced values. */
export const SINO_VIETNAMESE_PLACEHOLDER_LEGACY = "·";

/** Separator between alternative readings for the same Han character. */
export const SINO_VIETNAMESE_ALT_SEP = "/";

function stripTrailingPunctuation(value) {
    const TRAILING_PUNCT_RE = /(?:\.{2,}|[\s.,?!…:;，。！？、])+$/u;
    let s = String(value ?? "").trim();
    while (s.length > 0) {
        const next = s.replace(TRAILING_PUNCT_RE, "").trim();
        if (next === s) break;
        s = next;
    }
    return s;
}

function titleCaseSegment(segment) {
    if (!segment) return segment;
    const lower = segment.toLocaleLowerCase("vi");
    return lower.charAt(0).toLocaleUpperCase("vi") + lower.slice(1);
}

function titleCaseToken(token) {
    return token.split("-").map(titleCaseSegment).join("-");
}

function toDisplayCase(value) {
    return String(value ?? "")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((token) => token.toLocaleUpperCase("vi"))
        .join(" ");
}

export function isSinoVietnamesePlaceholder(token) {
    return token === SINO_VIETNAMESE_PLACEHOLDER || token === SINO_VIETNAMESE_PLACEHOLDER_LEGACY;
}

/** Alternative readings for one Han character slot, e.g. "Phạn/Bàn" → ["Phạn", "Bàn"]. */
export function parseSinoVietnameseSlotReadings(slot) {
    return String(slot ?? "")
        .split("/")
        .map((part) => part.trim())
        .filter(Boolean);
}

function normalizeSinoVietnameseSlot(slot) {
    const readings = parseSinoVietnameseSlotReadings(slot);
    if (readings.length === 0) return "";

    const normalized = readings.map((reading) => {
        if (isSinoVietnamesePlaceholder(reading) || /^_+$/.test(reading)) return reading;
        return toDisplayCase(stripTrailingPunctuation(reading));
    });

    const seen = new Set();
    const unique = [];
    for (const reading of normalized) {
        const key = reading.toLocaleLowerCase("vi");
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(reading);
    }

    return unique.join(SINO_VIETNAMESE_ALT_SEP);
}

/** Normalize full Sino-Vietnamese string (spaces = characters, slashes = alternative readings). */
export function normalizeSinoVietnameseValue(sinoVietnamese) {
    const text = String(sinoVietnamese ?? "").trim();
    if (!text) return "";
    if (isSinoVietnameseNone(text)) return SINO_VIETNAMESE_NONE;
    if (isSinoVietnameseDash(text)) return "";

    return text.split(/\s+/).filter(Boolean).map(normalizeSinoVietnameseSlot).filter(Boolean).join(" ");
}

function formatSinoVietnameseSlotForDisplay(slot) {
    const readings = parseSinoVietnameseSlotReadings(slot);
    if (readings.length === 0) return slot; // e.g. standalone "/" separator between pronunciations → keep it
    return readings
        .map((reading) => (isSinoVietnamesePlaceholder(reading) ? SINO_VIETNAMESE_PLACEHOLDER : reading))
        .join(" / ");
}

/** Show Sino-Vietnamese with placeholders and alternative readings. */
export function displaySinoVietnamese(sinoVietnamese) {
    if (sinoVietnamese == null || sinoVietnamese === "") return sinoVietnamese;
    if (isSinoVietnameseNone(sinoVietnamese)) return SINO_VIETNAMESE_NONE;

    const tokens = String(sinoVietnamese).split(/\s+/).filter(Boolean);
    const displayed = [];
    let pendingUnderscore = false;

    for (const token of tokens) {
        if (/^_+$/.test(token)) {
            pendingUnderscore = true;
            continue;
        }
        if (pendingUnderscore) {
            displayed.push(SINO_VIETNAMESE_NONE);
            pendingUnderscore = false;
        }
        displayed.push(formatSinoVietnameseSlotForDisplay(token));
    }

    if (pendingUnderscore) displayed.push(SINO_VIETNAMESE_NONE);
    return displayed.join(" ");
}

export function parseSinoVietnameseTokens(sinoVietnamese) {
    return String(sinoVietnamese ?? "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
}

/** Per-syllable marker for unknown / no Sino-Vietnamese reading (already synced). */
export function isSinoVietnameseUnresolvedToken(token) {
    const readings = parseSinoVietnameseSlotReadings(token);
    if (readings.length === 0) return true;
    return readings.every((reading) => isSinoVietnamesePlaceholder(reading) || /^_+$/.test(reading));
}

/** True when the word already has at least one real Sino-Vietnamese reading (not placeholder-only). */
export function hasFilledSinoVietnamese(sinoVietnamese) {
    if (!String(sinoVietnamese ?? "").trim()) return false;
    if (isSinoVietnameseNone(sinoVietnamese)) return false;

    return parseSinoVietnameseTokens(sinoVietnamese).some((token) => {
        const readings = parseSinoVietnameseSlotReadings(token);
        return readings.some((reading) => !isSinoVietnameseUnresolvedToken(reading));
    });
}

const HAN_RE = /\p{Script=Han}/u;

function extractHanCharacters(han) {
    return [...String(han ?? "").trim()].filter((ch) => HAN_RE.test(ch));
}

function alignSinoVietnameseTokens(tokens, charCount) {
    const aligned = [...tokens];
    while (aligned.length > charCount) {
        aligned.splice(0, 1);
    }
    while (aligned.length < charCount) {
        aligned.push(SINO_VIETNAMESE_PLACEHOLDER);
    }
    return aligned;
}

const HAN_CHAR_RE = /\p{Script=Han}/u;

/**
 * Display Sino-Vietnamese aligned to the number of Han characters in the word.
 * When the stored value has fewer tokens than han chars (e.g. 香港 only has
 * "hương"), pad the missing slots with "-" so the user knows the reading is
 * incomplete (HƯƠNG -) instead of silently showing only one token.
 */
export function displaySinoVietnameseAligned(sinoVietnamese, hanText) {
    const text = String(sinoVietnamese ?? "").trim();
    if (!text) return "";
    if (isSinoVietnameseNone(text)) return SINO_VIETNAMESE_NONE;

    const hanCount = [...String(hanText ?? "")].filter((ch) => HAN_CHAR_RE.test(ch)).length;
    const tokens = parseSinoVietnameseTokens(text);
    if (hanCount === 0 || tokens.length >= hanCount) return displaySinoVietnamese(text);

    const aligned = [...tokens];
    while (aligned.length < hanCount) aligned.push("-");
    return aligned.join(" ");
}
