/** Strip accents / normalize for accent-insensitive search (matches frontend wordSearch.js). */

export function normalizeSearchText(text) {
    return String(text ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .replace(/đ/g, "d")
        .replace(/[–—−]/g, "-")
        .replace(/\s+/g, " ")
        .trim();
}

/** Expand a query into normalized variants (OpenCC Han, accent-less, tone-less romanization, tokens). */
export function searchQueryVariants(text) {
    const raw = String(text ?? "").trim();
    const normalized = normalizeSearchText(raw);
    const variants = new Set();

    if (raw) variants.add(raw);

    if (normalized) {
        variants.add(normalized);
        const noTones = normalized.replace(/\d/g, "").replace(/\s+/g, " ").trim();
        if (noTones) variants.add(noTones);

        const noSpaces = normalized.replace(/\s/g, "");
        if (noSpaces) variants.add(noSpaces);

        const noTonesNoSpaces = noTones.replace(/\s/g, "");
        if (noTonesNoSpaces) variants.add(noTonesNoSpaces);

        for (const token of normalized.split(/\s+/).filter(Boolean)) {
            variants.add(token);
            const bare = token.replace(/\d/g, "");
            if (bare) variants.add(bare);
        }
    }

    return [...variants].filter(Boolean);
}
