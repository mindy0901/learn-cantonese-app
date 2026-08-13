/**
 * Han display helpers — always traditional (phồn) primary with jyutping.
 */

export function displayRomanization(word) {
    return String(word.jyutping ?? "").trim();
}

export function displayHanPrimary(entity) {
    const trad = String(entity.hanTraditional ?? entity.han_traditional ?? "").trim();
    const simp = String(entity.hanSimplified ?? entity.han_simplified ?? "").trim();
    return trad || simp;
}

/**
 * Order Han forms for display — traditional primary, simplified secondary.
 * @param {{ traditional?: string, simplified?: string }} options
 */
export function orderedHanVariants({ traditional, simplified }) {
    const trad = String(traditional ?? "").trim();
    const simp = String(simplified ?? "").trim();
    const value = trad || simp;

    if (!value) {
        return { primary: "", secondary: "", primaryIsTraditional: true, same: true };
    }

    if (!trad || !simp || trad === simp) {
        // simplified-only (quảng thuần): traditional rỗng → primary là giản thể
        return { primary: value, secondary: "", primaryIsTraditional: Boolean(trad), same: true };
    }

    return { primary: trad, secondary: simp, primaryIsTraditional: true, same: false };
}

/**
 * Compare traditional and simplified strings character by character.
 * Returns arrays of { char, same } indicating which characters differ.
 * Only meaningful for compound words (length > 1) where both forms exist.
 * @param {{ traditional?: string, simplified?: string }} options
 */
export function diffHanChars({ traditional, simplified }) {
    const trad = [...String(traditional ?? "").trim()];
    const simp = [...String(simplified ?? "").trim()];
    const maxLen = Math.max(trad.length, simp.length);

    const result = { trad: [], simp: [], hasDiff: false };
    if (maxLen <= 1) return result;

    for (let i = 0; i < maxLen; i++) {
        const t = trad[i] || "";
        const s = simp[i] || "";
        const same = t === s;
        result.trad.push({ char: t, same });
        result.simp.push({ char: s, same });
        if (!same) result.hasDiff = true;
    }

    return result;
}
