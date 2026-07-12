import * as OpenCC from "opencc-js";

/** @type {((text: string) => string) | null} */
let twToCn = null;
/** @type {((text: string) => string) | null} */
let cnToHk = null;

function converters() {
    if (!twToCn) {
        twToCn = OpenCC.Converter({ from: "tw", to: "cn" });
        cnToHk = OpenCC.Converter({ from: "cn", to: "hk" });
    }
    return { twToCn, cnToHk };
}

/** Any traditional/simplified input → Mainland simplified. */
export function toHanSimplified(text) {
    const value = String(text ?? "").trim();
    if (!value) return "";
    return converters().twToCn(value);
}

/** Simplified → Hong Kong traditional. */
export function toHanHK(text) {
    const value = String(text ?? "").trim();
    if (!value) return "";
    return converters().cnToHk(toHanSimplified(value));
}

/**
 * Ensure word has both HK traditional (`hanTraditional`) and simplified Mandarin (`hanSimplified`).
 * `hanTraditional` is canonical for display (HK priority).
 */
export function ensureHanVariants({ hanTraditional, hanSimplified, hanTrad, han }) {
    const rawTrad = String(hanTraditional ?? hanTrad ?? han ?? "").trim();
    const rawSimp = String(hanSimplified ?? "").trim();

    if (rawTrad && rawSimp) {
        return {
            hanTraditional: toHanHK(rawTrad),
            hanSimplified: toHanSimplified(rawSimp),
        };
    }

    const source = rawTrad || rawSimp;
    if (!source) return { hanTraditional: "", hanSimplified: "" };

    const simplified = toHanSimplified(source);
    return {
        hanTraditional: toHanHK(simplified),
        hanSimplified: simplified,
    };
}

export function hasHanScript(text) {
    return /\p{Script=Han}/u.test(String(text ?? ""));
}

/**
 * Expand a search query with OpenCC HK traditional + simplified forms.
 * Includes the raw input and each contiguous Han segment (for mixed queries).
 */
export function expandHanSearchTerms(text) {
    const raw = String(text ?? "").trim();
    if (!raw || !hasHanScript(raw)) return [];

    const terms = new Set([raw]);

    const addVariants = (segment) => {
        const value = String(segment ?? "").trim();
        if (!value || !hasHanScript(value)) return;
        terms.add(value);
        const { hanTraditional, hanSimplified } = ensureHanVariants({ hanTraditional: value });
        if (hanTraditional) terms.add(hanTraditional);
        if (hanSimplified) terms.add(hanSimplified);
    };

    addVariants(raw);
    for (const segment of raw.match(/\p{Script=Han}+/gu) ?? []) {
        addVariants(segment);
    }

    return [...terms].filter(Boolean);
}
