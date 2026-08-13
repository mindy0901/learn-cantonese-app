import { normalizeSearchText } from "./wordSearch.js";

export function matchesGrammarSearch(item, query) {
    const q = normalizeSearchText(query);
    if (!q) return true;
    return normalizeSearchText(item.title).includes(q) || normalizeSearchText(item.content).includes(q);
}

export function getGrammarSearchScore(item, query) {
    const q = normalizeSearchText(query);
    if (!q) return 0;
    let score = 0;
    const title = normalizeSearchText(item.title);
    const content = normalizeSearchText(item.content);
    if (title === q) score += 100;
    else if (title.startsWith(q)) score += 50;
    else if (title.includes(q)) score += 25;
    if (content.includes(q)) score += 10;
    return score;
}
