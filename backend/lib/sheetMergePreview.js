import {
    mergeWordFieldsPreferFilled,
    normalizeWordFields,
    wordContentEqual,
    wordKeyIsEmpty,
    wordMergeKey,
} from "./wordNormalize.js";

function normGrammar(value) {
    return String(value ?? "")
        .trim()
        .toLowerCase();
}

export function grammarMergeKey(item) {
    return `${normGrammar(item.title)}|${normGrammar(item.content)}`;
}

export function lessonMergeKey(lesson) {
    return normGrammar(lesson.name);
}

export function grammarContentEqual(a, b) {
    return (
        normGrammar(a.title) === normGrammar(b.title) &&
        normGrammar(a.content) === normGrammar(b.content) &&
        Boolean(a.important) === Boolean(b.important) &&
        Boolean(a.mastered) === Boolean(b.mastered)
    );
}

export function lessonContentEqual(a, b) {
    if (normGrammar(a.name) !== normGrammar(b.name)) return false;
    const aWords = [...(a.wordIds ?? [])].sort().join(",");
    const bWords = [...(b.wordIds ?? [])].sort().join(",");
    if (aWords !== bWords) return false;
    const aGrammar = (a.grammar ?? [])
        .map((g) => `${normGrammar(g.title)}|${normGrammar(g.content)}`)
        .sort()
        .join(";;");
    const bGrammar = (b.grammar ?? [])
        .map((g) => `${normGrammar(g.title)}|${normGrammar(g.content)}`)
        .sort()
        .join(";;");
    return aGrammar === bGrammar;
}

function mergeWordFields(existing, incoming) {
    return { ...mergeWordFieldsPreferFilled(existing, incoming), id: existing.id };
}

function mergeGrammarFields(existing, incoming) {
    return {
        ...existing,
        title: incoming.title ?? existing.title,
        content: incoming.content ?? existing.content,
        important: "important" in incoming ? incoming.important : existing.important,
        mastered: "mastered" in incoming ? incoming.mastered : existing.mastered,
    };
}

function mergeLessonFields(existing, incoming) {
    const wordIds = [...new Set([...(existing.wordIds ?? []), ...(incoming.wordIds ?? [])])];
    const grammarByKey = new Map();
    for (const g of existing.grammar ?? []) {
        grammarByKey.set(grammarMergeKey(g), { ...g });
    }
    for (const g of incoming.grammar ?? []) {
        const key = grammarMergeKey(g);
        const prev = grammarByKey.get(key);
        if (prev) {
            grammarByKey.set(key, {
                ...prev,
                title: g.title || prev.title,
                content: g.content || prev.content,
            });
        } else {
            grammarByKey.set(key, { ...g });
        }
    }
    return {
        ...existing,
        name: incoming.name || existing.name,
        wordIds,
        grammar: [...grammarByKey.values()],
    };
}

function previewList(incoming, existing, { keyFn, equalFn, mergeFn, skipEmptyKey = false }) {
    const byKey = new Map(existing.map((item) => [keyFn(item), item]));
    let added = 0;
    let updated = 0;
    let skipped = 0;

    for (const item of incoming) {
        const key = keyFn(item);
        if (skipEmptyKey && wordKeyIsEmpty(key)) continue;
        const existingItem = byKey.get(key);
        if (!existingItem) {
            added++;
            byKey.set(key, item);
        } else {
            const merged = mergeFn(existingItem, item);
            if (equalFn(existingItem, merged)) skipped++;
            else updated++;
        }
    }

    return {
        added,
        updated,
        skipped,
        totalBefore: existing.length,
        totalAfter: existing.length + added,
        validRows: incoming.length,
    };
}

export function previewWordsMerge(incoming, existingWords) {
    const normalized = incoming.map(normalizeWordFields);
    return previewList(normalized, existingWords.map(normalizeWordFields), {
        keyFn: wordMergeKey,
        equalFn: wordContentEqual,
        mergeFn: mergeWordFields,
        skipEmptyKey: true,
    });
}

export function previewGrammarMerge(incoming, existingGrammar) {
    return previewList(incoming, existingGrammar, {
        keyFn: grammarMergeKey,
        equalFn: grammarContentEqual,
        mergeFn: mergeGrammarFields,
    });
}

export function previewLessonsMerge(incoming, existingLessons) {
    const byKey = new Map(existingLessons.map((l) => [lessonMergeKey(l), l]));
    let added = 0;
    let updated = 0;
    let skipped = 0;

    for (const item of incoming) {
        const key = lessonMergeKey(item);
        const existingItem = byKey.get(key);
        if (!existingItem) {
            added++;
            byKey.set(key, item);
        } else {
            const merged = mergeLessonFields(existingItem, item);
            if (lessonContentEqual(existingItem, merged)) skipped++;
            else updated++;
        }
    }

    return {
        added,
        updated,
        skipped,
        totalBefore: existingLessons.length,
        totalAfter: existingLessons.length + added,
        validRows: incoming.length,
    };
}

export function previewSheetMerge(type, items, existing) {
    if (type === "words") {
        return previewWordsMerge(items, existing.words);
    }
    if (type === "grammar") {
        return previewGrammarMerge(items, existing.grammarBank);
    }
    if (type === "lessons") {
        return previewLessonsMerge(items, existing.lessons);
    }
    throw Object.assign(new Error("Invalid merge type"), { status: 400 });
}
