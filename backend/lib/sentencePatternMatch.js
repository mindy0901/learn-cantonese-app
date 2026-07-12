function hanVariantsForMatch(entity) {
    const forms = new Set();
    const trad = entity.han_traditional ?? entity.hanTraditional ?? "";
    const simp = entity.han_simplified ?? entity.hanSimplified ?? "";
    if (trad.trim()) forms.add(trad.trim());
    if (simp.trim()) forms.add(simp.trim());
    return [...forms];
}

function sentenceHanTexts(pattern) {
    return hanVariantsForMatch(pattern);
}

export function hanAppearsInText(needle, haystack) {
    if (!needle || !haystack) return false;
    return haystack.includes(needle);
}

export function sentenceMatchesWord(pattern, word) {
    const wordId = word.id;
    const wordIds = pattern.word_ids ?? pattern.wordIds ?? [];
    if (wordId && wordIds.includes(wordId)) return true;

    const sentences = sentenceHanTexts(pattern);
    const forms = hanVariantsForMatch(word);
    return forms.some((form) => sentences.some((sentence) => hanAppearsInText(form, sentence)));
}

export function findWordIdsInSentence(pattern, words) {
    const ids = new Set(pattern.word_ids ?? pattern.wordIds ?? []);
    const sentences = sentenceHanTexts(pattern);
    for (const word of words) {
        const forms = hanVariantsForMatch(word);
        if (forms.some((form) => sentences.some((sentence) => hanAppearsInText(form, sentence)))) {
            if (word.id) ids.add(word.id);
        }
    }
    return [...ids];
}

export function filterSentencePatternsForWord(patterns, word) {
    return patterns.filter((pattern) => sentenceMatchesWord(pattern, word));
}
