import { normalizeSearchText } from "./wordSearch.js";

export function matchesSentenceSearch(item, query) {
    const q = normalizeSearchText(query);
    if (!q) return true;
    const blob = normalizeSearchText(
        `${item.hanTraditional ?? ""} ${item.hanSimplified ?? ""} ${item.jyutping ?? ""} ${item.pinyin ?? ""} ${item.vietnamese ?? ""} ${item.english ?? ""}`,
    );
    return blob.includes(q);
}

export function getSentenceSearchScore(item, query) {
    const q = normalizeSearchText(query);
    if (!q) return 0;
    let score = 0;
    const han = normalizeSearchText(item.hanTraditional ?? "");
    const viet = normalizeSearchText(item.vietnamese ?? "");
    if (han === q) score += 100;
    else if (han.startsWith(q)) score += 50;
    else if (han.includes(q)) score += 25;
    if (viet.includes(q)) score += 10;
    return score;
}
