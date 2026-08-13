/**
 * Pinyin tone sorting — orders yī, yí, yǐ, yì by tone (1,2,3,4).
 * Shared by the word bank table and the word detail pronunciation toggles.
 */
export const pinyinToneCollator = (() => {
    try {
        return new Intl.Collator("zh-Hans-u-co-pinyin", { sensitivity: "variant" });
    } catch {
        return null;
    }
})();

/** Compare two plain pinyin strings by tone order (locale-free, then string). */
export function comparePinyinTone(pa, pb) {
    const a = String(pa ?? "")
        .trim()
        .toLowerCase();
    const b = String(pb ?? "")
        .trim()
        .toLowerCase();
    if (a && b && pinyinToneCollator) {
        const c = pinyinToneCollator.compare(a, b);
        if (c !== 0) return c;
    }
    if (a !== b) return a < b ? -1 : 1;
    return 0;
}
