import { SINO_VIETNAMESE_NONE, isSinoVietnameseNone } from "./sinoVietnameseMarkers.js";

const SINO_VIETNAMESE_PLACEHOLDER = "•";
const SINO_VIETNAMESE_PLACEHOLDER_LEGACY = "·";
const SINO_VIETNAMESE_ALT_SEP = "/";
const TRAILING_PUNCT_RE = /(?:\.{2,}|[\s.,?!…:;，。！？、])+$/u;

function stripTrailingPunctuation(value) {
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
        .map((token) => {
            // Erhua suffix: keep lowercase "r"
            if (token === "r" || token === "R") return "r";
            return titleCaseToken(token);
        })
        .join(" ");
}

function isSinoVietnamesePlaceholder(token) {
    return token === SINO_VIETNAMESE_PLACEHOLDER || token === SINO_VIETNAMESE_PLACEHOLDER_LEGACY;
}

function parseSinoVietnameseSlotReadings(slot) {
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

export function normalizeSinoVietnameseValue(sinoVietnamese) {
    const text = String(sinoVietnamese ?? "").trim();
    if (!text) return "";
    if (isSinoVietnameseNone(text)) return SINO_VIETNAMESE_NONE;

    return text.split(/\s+/).filter(Boolean).map(normalizeSinoVietnameseSlot).filter(Boolean).join(" ");
}
