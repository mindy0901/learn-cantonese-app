export function emptyVocabulary(partial) {
    const now = new Date().toISOString();
    return {
        id: crypto.randomUUID(),
        engMeanings: "",
        hanTraditional: "",
        hanSimplified: "",
        vietMeanings: "",
        important: false,
        mastered: false,
        studyProgress: 0,
        studyProgressAt: undefined,
        hskLevel: undefined,
        pureCantonese: false,
        meanings: [],
        examples: [],
        createdAt: now,
        updatedAt: now,
        ...partial,
    };
}

export function emptyGrammar(partial) {
    return { id: crypto.randomUUID(), title: "", content: "", mastered: false, ...partial };
}

export function emptyGrammarBankItem(partial) {
    const now = new Date().toISOString();
    return {
        id: crypto.randomUUID(),
        title: "",
        content: "",
        details: [],
        notes: [],
        structure: "",
        examples: [],
        important: false,
        mastered: false,
        createdAt: now,
        updatedAt: now,
        ...partial,
    };
}

export function emptyHanCharacter(partial) {
    const now = new Date().toISOString();
    return {
        id: crypto.randomUUID(),
        hanSimplified: "",
        sinoVietnamese: "",
        createdAt: now,
        updatedAt: now,
        ...partial,
    };
}

export function emptySentencePattern(partial) {
    const now = new Date().toISOString();
    return {
        id: crypto.randomUUID(),
        hanTraditional: "",
        hanSimplified: "",
        jyutping: "",
        pinyin: "",
        vietnamese: "",
        english: "",
        wordIds: [],
        important: false,
        mastered: false,
        createdAt: now,
        updatedAt: now,
        ...partial,
    };
}
