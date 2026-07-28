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

export function sentenceMatchesVocabulary(pattern, vocab) {
    const wordId = vocab.id;
    const wordIds = pattern.word_ids ?? pattern.wordIds ?? [];
    if (wordId && wordIds.includes(wordId)) return true;

    const sentences = sentenceHanTexts(pattern);
    const forms = hanVariantsForMatch(vocab);
    return forms.some((form) => sentences.some((sentence) => hanAppearsInText(form, sentence)));
}

export function findVocabularyIdsInSentence(pattern, vocabs) {
    const ids = new Set(pattern.word_ids ?? pattern.wordIds ?? []);
    const sentences = sentenceHanTexts(pattern);
    for (const vocab of vocabs) {
        const forms = hanVariantsForMatch(vocab);
        if (forms.some((form) => sentences.some((sentence) => hanAppearsInText(form, sentence)))) {
            if (vocab.id) ids.add(vocab.id);
        }
    }
    return [...ids];
}

export function filterSentencePatternsForVocabulary(patterns, vocab) {
    return patterns.filter((pattern) => sentenceMatchesVocabulary(pattern, vocab));
}
