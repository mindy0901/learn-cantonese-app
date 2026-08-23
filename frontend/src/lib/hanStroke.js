/**
 * Per-character stroke counts loaded from the han_characters store (DB).
 * Building a Map is cheap; we no longer need cnchar at render/sort time.
 */

let charStroke = new Map(); // char -> strokeCount (number)

/** Populate the char → strokeCount lookup from the store's hanCharacters list. */
export function setHanStrokeMap(hanCharacters) {
    const map = new Map();
    for (const h of hanCharacters || []) {
        const n = h?.strokeCount;
        if (typeof n !== "number" || n <= 0) continue;
        // Chỉ key các form PHỒN THỂ (traditional + HK) — strokeCount khớp glyph.
        // KHÔNG đăng ký hanSimplified: simplified của 1 chữ có thể là chữ KHÁC
        // với số nét khác (vd 於=8 nét nhưng giản thể 于=3 nét) → đăng ký nhầm.
        // (2026-08-20) Sort cột "Chữ Hán" phải dùng form phồn thể (xem accessor "han").
        for (const c of [h?.hanTraditional, h?.hanTraditionalHk, h?.hanHongKong]) {
            if (c) map.set(c, n);
        }
    }
    charStroke = map;
}

/**
 * Per-char stroke counts of a han string: array where element i = strokes of
 * char i. Returns null when ANY char is unknown (no stroke data) — caller
 * falls back to the collator, matching the DB (NULL stroke_count) behavior.
 */
export function strokeCounts(str) {
    if (!str) return null;
    const counts = [];
    for (const ch of String(str)) {
        if (ch === " ") continue;
        const n = charStroke.get(ch);
        if (n === undefined) return null;
        counts.push(n);
    }
    return counts;
}

/**
 * Precomputed sort key for a han string: { counts, full }.
 * Call this ONCE per row before sorting, then compare keys — no per-comparison
 * work needed inside Array.sort.
 */
export function hanSortKey(str) {
    const key = String(str ?? "");
    const counts = strokeCounts(key);
    return { counts, full: counts !== null };
}

/**
 * Collator used as a deterministic tiebreak when two strings have equal stroke
 * counts — sorts by stroke collation then radical (traditional dictionary order).
 */
const hanCollator = (() => {
    try {
        return new Intl.Collator("zh-Hant-u-co-stroke", { sensitivity: "variant" });
    } catch {
        return null;
    }
})();

function compareHan(a, b) {
    if (hanCollator) return hanCollator.compare(a, b);
    return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Compare two precomputed han sort keys.
 *  1. strings with a FULL recognized stroke count sort before unresolved ones;
 *  2. fully-resolved strings sort PER CHARACTER:
 *     - if stroke counts differ at a position → by stroke count;
 *     - if same count but different char → by char collation (so words sharing
 *       the same leading char stay adjacent, e.g. 一 → 一一 → 一口 → 一口氣);
 *  3. shorter strings (prefix) sort first; unresolved fall back to collator.
 */
export function compareHanKeys(ka, kb, a, b) {
    if (ka.full && kb.full) {
        const ca = ka.counts;
        const cb = kb.counts;
        const len = Math.min(ca.length, cb.length);
        for (let i = 0; i < len; i++) {
            if (ca[i] !== cb[i]) return ca[i] - cb[i];
            const cha = a[i];
            const chb = b[i];
            if (cha !== chb) {
                const c = compareHan(cha, chb);
                if (c !== 0) return c;
            }
        }
        // Shorter string first when all shared chars are equal.
        if (ca.length !== cb.length) return ca.length - cb.length;
        return compareHan(a, b);
    }
    if (ka.full !== kb.full) return ka.full ? -1 : 1;
    return compareHan(a, b);
}
