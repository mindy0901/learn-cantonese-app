/** @typedef {0 | 1 | 2 | 3 | 4} PopularityLevel */

export const POPULARITY_LEVELS = [0, 1, 2, 3, 4];

export function normalizePopularity(value) {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0 || n > 4) return null;
    return /** @type {PopularityLevel} */ (n);
}

export function mergePopularity(a, b) {
    const left = normalizePopularity(a);
    const right = normalizePopularity(b);
    if (left === null) return right;
    if (right === null) return left;
    return /** @type {PopularityLevel} */ (Math.max(left, right));
}
