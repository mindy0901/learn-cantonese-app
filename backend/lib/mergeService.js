import { randomUUID } from "crypto";
import {
    fetchAllRows,
    grammarToRow,
    lessonToRow,
    rowToGrammar,
    rowToLesson,
    rowToWord,
    upsertBatched,
    wordToRow,
} from "./dataService.js";
import {
    mergeWordFieldsPreferFilled,
    normalizeWordFields,
    wordContentEqual,
    wordKeyIsEmpty,
    wordMergeKey,
} from "./wordNormalize.js";

function norm(value) {
    return String(value ?? "")
        .trim()
        .toLowerCase();
}

function grammarKey(item) {
    return `${norm(item.title)}|${norm(item.content)}`;
}

function lessonKey(lesson) {
    return norm(lesson.name);
}

function wordEqual(a, b) {
    return wordContentEqual(a, b);
}

function mergeWordFields(existing, incoming) {
    return { ...mergeWordFieldsPreferFilled(existing, incoming), id: existing.id };
}

function grammarEqual(a, b) {
    return (
        norm(a.title) === norm(b.title) &&
        norm(a.content) === norm(b.content) &&
        Boolean(a.important) === Boolean(b.important) &&
        Boolean(a.mastered) === Boolean(b.mastered)
    );
}

function mergeGrammarFields(existing, incoming) {
    return {
        id: existing.id,
        title: incoming.title ?? existing.title,
        content: incoming.content ?? existing.content,
        important: "important" in incoming ? incoming.important : (existing.important ?? false),
        mastered: "mastered" in incoming ? incoming.mastered : (existing.mastered ?? false),
    };
}

function mergeLessonFields(existing, incoming) {
    const wordIds = [...new Set([...(existing.wordIds ?? []), ...(incoming.wordIds ?? [])])];
    const grammarByKey = new Map();
    for (const g of existing.grammar ?? []) {
        grammarByKey.set(grammarKey(g), { ...g });
    }
    for (const g of incoming.grammar ?? []) {
        const key = grammarKey(g);
        const prev = grammarByKey.get(key);
        if (prev) {
            grammarByKey.set(key, {
                ...prev,
                title: g.title || prev.title,
                content: g.content || prev.content,
            });
        } else {
            grammarByKey.set(key, { id: g.id ?? randomUUID(), title: g.title, content: g.content, mastered: false });
        }
    }
    const now = new Date().toISOString();
    return {
        id: existing.id,
        name: incoming.name || existing.name,
        wordIds,
        grammar: [...grammarByKey.values()],
        createdAt: existing.createdAt ?? now,
        updatedAt: now,
    };
}

function lessonSnapshotEqual(a, b) {
    const aWords = [...(a.wordIds ?? [])].sort().join(",");
    const bWords = [...(b.wordIds ?? [])].sort().join(",");
    if (aWords !== bWords) return false;
    const aGrammar = (a.grammar ?? [])
        .map((g) => `${norm(g.title)}|${norm(g.content)}`)
        .sort()
        .join(";;");
    const bGrammar = (b.grammar ?? [])
        .map((g) => `${norm(g.title)}|${norm(g.content)}`)
        .sort()
        .join(";;");
    return aGrammar === bGrammar && norm(a.name) === norm(b.name);
}

export async function mergeWords(db, userId, incomingWords) {
    const existing = (await fetchAllRows(db, "words", userId)).map(rowToWord);
    const totalBefore = existing.length;
    const byKey = new Map(existing.map((w) => [wordMergeKey(w), w]));

    let added = 0;
    let updated = 0;
    let skipped = 0;
    /** One row per id — avoids Postgres "ON CONFLICT DO UPDATE cannot affect row a second time". */
    const toUpsertById = new Map();
    const importBase = Date.now();
    let importIndex = 0;

    for (const raw of incomingWords) {
        const incoming = normalizeWordFields(raw);
        const key = wordMergeKey(incoming);
        if (wordKeyIsEmpty(key)) continue;

        const existingItem = byKey.get(key);
        if (!existingItem) {
            const createdAt = incoming.createdAt ?? new Date(importBase + importIndex).toISOString();
            importIndex += 1;
            const created = {
                id: randomUUID(),
                english: incoming.english ?? "",
                hanTraditional: incoming.hanTraditional ?? incoming.hanTrad ?? incoming.han ?? "",
                hanSimplified: incoming.hanSimplified,
                vietnamese: incoming.vietnamese ?? "",
                vietnameseDetail: incoming.vietnameseDetail,
                popularity: incoming.popularity,
                hanViet: incoming.hanViet,
                jyutping: incoming.jyutping,
                important: incoming.important ?? false,
                mastered: incoming.mastered ?? false,
                createdAt,
                updatedAt: createdAt,
            };
            toUpsertById.set(created.id, wordToRow(created, userId));
            byKey.set(key, created);
            added++;
        } else {
            const merged = mergeWordFields(existingItem, incoming);
            if (wordEqual(existingItem, merged)) {
                skipped++;
            } else {
                toUpsertById.set(merged.id, wordToRow(merged, userId));
                byKey.set(key, merged);
                updated++;
            }
        }
    }

    const toUpsert = [...toUpsertById.values()];
    if (toUpsert.length > 0) {
        await upsertBatched(db, "words", toUpsert);
    }

    return { added, updated, skipped, totalBefore, totalAfter: totalBefore + added };
}

export async function mergeGrammar(db, userId, incomingItems) {
    const existing = (await fetchAllRows(db, "grammar_bank", userId)).map(rowToGrammar);
    const totalBefore = existing.length;
    const byKey = new Map(existing.map((g) => [grammarKey(g), g]));

    let added = 0;
    let updated = 0;
    let skipped = 0;
    const toUpsert = [];

    for (const incoming of incomingItems) {
        const key = grammarKey(incoming);
        if (!key.replace(/\|/g, "").length) continue;

        const existingItem = byKey.get(key);
        if (!existingItem) {
            const now = new Date().toISOString();
            const created = {
                id: randomUUID(),
                title: incoming.title ?? "",
                content: incoming.content ?? "",
                important: incoming.important ?? false,
                mastered: incoming.mastered ?? false,
                createdAt: incoming.createdAt ?? now,
                updatedAt: now,
            };
            toUpsert.push(grammarToRow(created, userId));
            byKey.set(key, created);
            added++;
        } else {
            const merged = mergeGrammarFields(existingItem, incoming);
            if (grammarEqual(existingItem, merged)) {
                skipped++;
            } else {
                toUpsert.push(grammarToRow(merged, userId));
                byKey.set(key, merged);
                updated++;
            }
        }
    }

    if (toUpsert.length > 0) {
        await upsertBatched(db, "grammar_bank", toUpsert);
    }

    return { added, updated, skipped, totalBefore, totalAfter: totalBefore + added };
}

export async function mergeLessons(db, userId, incomingLessons) {
    const existing = (await fetchAllRows(db, "lessons", userId)).map(rowToLesson);
    const totalBefore = existing.length;
    const byKey = new Map(existing.map((l) => [lessonKey(l), l]));

    let added = 0;
    let updated = 0;
    let skipped = 0;
    const toUpsert = [];

    for (const incoming of incomingLessons) {
        const key = lessonKey(incoming);
        if (!key) continue;

        const existingItem = byKey.get(key);
        if (!existingItem) {
            const now = new Date().toISOString();
            const created = {
                id: randomUUID(),
                name: incoming.name,
                wordIds: incoming.wordIds ?? [],
                grammar: (incoming.grammar ?? []).map((g) => ({
                    id: g.id ?? randomUUID(),
                    title: g.title ?? "",
                    content: g.content ?? "",
                    mastered: g.mastered ?? false,
                })),
                createdAt: now,
                updatedAt: now,
            };
            toUpsert.push(lessonToRow(created, userId));
            byKey.set(key, created);
            added++;
        } else {
            const merged = mergeLessonFields(existingItem, incoming);
            if (lessonSnapshotEqual(existingItem, merged)) {
                skipped++;
            } else {
                toUpsert.push(lessonToRow(merged, userId));
                byKey.set(key, merged);
                updated++;
            }
        }
    }

    if (toUpsert.length > 0) {
        await upsertBatched(db, "lessons", toUpsert);
    }

    return { added, updated, skipped, totalBefore, totalAfter: totalBefore + added };
}

export async function mergeSheetData(db, userId, { type, items }) {
    if (type === "words") return mergeWords(db, userId, items);
    if (type === "grammar") return mergeGrammar(db, userId, items);
    if (type === "lessons") return mergeLessons(db, userId, items);
    throw new Error("Invalid merge type");
}
