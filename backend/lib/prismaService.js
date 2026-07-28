/**
 * Prisma-based data service — replaces Supabase dataService.js.
 * Same API surface so routes/data.js works with minimal changes.
 */
import { prisma } from "./prisma.js";
import { randomUUID } from "crypto";

const PAGE_SIZE = 1000;

// ── Row ↔ Domain transforms (mirror dataService.js signatures) ──

export function vocabularyToRow(vocab, userId, { includeCreatedAt = true } = {}) {
    const now = new Date().toISOString();
    // Dictionary fields → Vocabulary table
    return {
        id: vocab.id,
        hanSimplified: vocab.hanSimplified?.trim() || null,
        hanTraditional: vocab.hanTraditional ?? vocab.hanTrad ?? vocab.han ?? "",
        sinoVietnamese: vocab.sinoVietnamese ?? null,
        jyutping: vocab.jyutping ?? null,
        pinyin: vocab.pinyin?.trim() || null,
        vietMeanings: vocab.vietMeanings ?? "",
        vietExamples: vocab.vietExamples?.trim() || null,
        engMeanings: vocab.engMeanings ?? "",
        hskLevel: vocab.hskLevel?.trim() || null,
        searchKey: vocab.searchKey ?? vocab.search_key ?? null,
        createdAt: includeCreatedAt ? (vocab.createdAt ?? now) : undefined,
        updatedAt: now,
        // Nested meanings & examples for upsert
        _meanings: vocab.meanings ?? undefined,
        _examples: vocab.examples ?? undefined,
    };
}

/** Extract UserWord progress fields from a vocabulary payload */
export function userWordFields(vocab) {
    return {
        important: vocab.important ?? false,
        mastered: vocab.mastered ?? false,
        studyProgress: Math.max(0, Math.min(100, Math.round(vocab.studyProgress ?? 0))),
        studyProgressAt: vocab.studyProgressAt ?? null,
    };
}

export function rowToVocabulary(row) {
    // row can be either:
    // - a Vocabulary record (no progress fields)
    // - a UserVocabulary & { vocabulary: Vocabulary } include result
    const vocab = row.vocabulary ?? row;
    const progress = row.vocabulary ? row : {}; // if include result, progress is on parent
    return {
        id: vocab.id,
        hanTraditional: vocab.hanTraditional ?? "",
        hanSimplified: vocab.hanSimplified ?? undefined,
        sinoVietnamese: vocab.sinoVietnamese ?? undefined,
        jyutping: vocab.jyutping ?? undefined,
        pinyin: vocab.pinyin ?? undefined,
        vietMeanings: vocab.vietMeanings ?? "",
        vietExamples: vocab.vietExamples ?? undefined,
        engMeanings: vocab.engMeanings ?? "",
        hskLevel: vocab.hskLevel ?? undefined,
        important: progress.important ?? false,
        mastered: progress.mastered ?? false,
        studyProgress: progress.studyProgress ?? 0,
        studyProgressAt: progress.studyProgressAt ?? undefined,
        createdAt: vocab.createdAt ?? vocab.updatedAt,
        updatedAt: vocab.updatedAt ?? vocab.createdAt,
        meanings: (vocab.vocabularyMeanings ?? []).map((m) => ({
            id: m.id,
            category: m.category ?? "",
            vietMeanings: m.vietMeanings ?? "",
            engMeanings: m.engMeanings ?? "",
            position: m.position ?? 0,
            examples: (m.examples ?? []).map((ex) => ({
                id: ex.id,
                hanExample: ex.hanExample ?? "",
                jyutpingExample: ex.jyutpingExample ?? "",
                pinyinExample: ex.pinyinExample ?? "",
                vietExamples: ex.vietExamples ?? "",
                engExamples: ex.engExamples ?? "",
                position: ex.position ?? 0,
            })),
        })),
        examples: (vocab.vocabularyExamples ?? [])
            .filter((ex) => !ex.meaningId) // only top-level examples (not linked to a meaning)
            .map((ex) => ({
                id: ex.id,
                hanExample: ex.hanExample ?? "",
                jyutpingExample: ex.jyutpingExample ?? "",
                pinyinExample: ex.pinyinExample ?? "",
                vietExamples: ex.vietExamples ?? "",
                engExamples: ex.engExamples ?? "",
                position: ex.position ?? 0,
            })),
    };
}

export function grammarToRow(item, userId, { includeCreatedAt = true } = {}) {
    const now = new Date().toISOString();
    return {
        id: item.id,
        userId,
        title: item.title ?? "",
        content: item.content ?? "",
        important: item.important ?? false,
        mastered: item.mastered ?? false,
        createdAt: includeCreatedAt ? (item.createdAt ?? now) : undefined,
        updatedAt: now,
    };
}

export function rowToGrammar(row) {
    return {
        id: row.id,
        title: row.title ?? "",
        content: row.content ?? "",
        important: row.important ?? false,
        mastered: row.mastered ?? false,
        createdAt: row.createdAt ?? row.updatedAt,
        updatedAt: row.updatedAt ?? row.createdAt,
    };
}

export function lessonToRow(lesson, userId) {
    const now = new Date().toISOString();
    return {
        id: lesson.id,
        userId,
        title: lesson.title ?? lesson.name ?? "",
        vocabularyIds: lesson.vocabularyIds ?? lesson.wordIds ?? [],
        grammarIds: lesson.grammarIds ?? [],
        hskLevel: lesson.hskLevel ?? "",
        createdAt: lesson.createdAt ?? now,
        updatedAt: lesson.updatedAt ?? now,
    };
}

export function rowToLesson(row) {
    const grammarRaw = Array.isArray(row.grammar) ? row.grammar : Array.isArray(row.grammarIds) ? row.grammarIds : [];
    return {
        id: row.id,
        name: row.title ?? row.name ?? "",
        wordIds: row.vocabularyIds ?? row.wordIds ?? [],
        grammar: grammarRaw.map((g) =>
            typeof g === "object" ? { ...g, mastered: g.mastered ?? false } : { id: g, title: "", content: "" },
        ),
        hskLevel: row.hskLevel ?? row.hsk_level ?? "",
        createdAt: row.createdAt,
        updatedAt: row.updatedAt ?? row.createdAt,
    };
}

export function sentencePatternToRow(item, userId, { includeCreatedAt = true } = {}) {
    const now = new Date().toISOString();
    return {
        id: item.id,
        userId,
        hanTraditional: item.hanTraditional ?? "",
        hanSimplified: item.hanSimplified ?? null,
        jyutping: item.jyutping ?? null,
        pinyin: item.pinyin ?? null,
        vietnamese: item.vietnamese ?? "",
        english: item.english ?? "",
        wordIds: item.wordIds ?? [],
        important: item.important ?? false,
        mastered: item.mastered ?? false,
        createdAt: includeCreatedAt ? (item.createdAt ?? now) : undefined,
        updatedAt: now,
    };
}

export function rowToSentencePattern(row) {
    return {
        id: row.id,
        hanTraditional: row.hanTraditional ?? "",
        hanSimplified: row.hanSimplified ?? "",
        jyutping: row.jyutping ?? "",
        pinyin: row.pinyin ?? "",
        vietnamese: row.vietnamese ?? "",
        english: row.english ?? "",
        wordIds: row.wordIds ?? [],
        important: row.important ?? false,
        mastered: row.mastered ?? false,
        createdAt: row.createdAt ?? row.updatedAt,
        updatedAt: row.updatedAt ?? row.createdAt,
    };
}

export function hanCharacterToRow(item, userId, { includeCreatedAt = true } = {}) {
    const ch = item.hanSimplified ?? item.character ?? "";
    const readings = Array.isArray(item.sinoVietnamese)
        ? item.sinoVietnamese.map((r) => String(r ?? "").trim()).filter(Boolean)
        : String(item.sinoVietnamese ?? "").trim()
          ? [String(item.sinoVietnamese).trim()]
          : [];
    const parseArr = (val) => {
        if (Array.isArray(val)) return val.map((r) => String(r ?? "").trim()).filter(Boolean);
        const s = String(val ?? "").trim();
        return s ? [s] : [];
    };
    const now = new Date().toISOString();
    return {
        id: item.id,
        userId,
        hanSimplified: item.hanSimplified ?? ch,
        hanTraditional: item.hanTraditional ?? null,
        sinoVietnamese: readings.length > 0 ? readings : [],
        jyutping: parseArr(item.jyutping),
        pinyin: parseArr(item.pinyin),
        popularity: item.popularity ?? null,
        important: item.important ?? false,
        mastered: item.mastered ?? false,
        createdAt: includeCreatedAt ? (item.createdAt ?? now) : undefined,
        updatedAt: now,
    };
}

export function rowToHanCharacter(row) {
    return {
        id: row.id,
        hanSimplified: row.hanSimplified ?? "",
        hanTraditional: row.hanTraditional ?? undefined,
        sinoVietnamese: row.sinoVietnamese ?? [],
        jyutping: row.jyutping ?? [],
        pinyin: row.pinyin ?? [],
        popularity: row.popularity ?? undefined,
        important: row.important ?? false,
        mastered: row.mastered ?? false,
        createdAt: row.createdAt ?? row.updatedAt,
        updatedAt: row.updatedAt ?? row.createdAt,
    };
}

// ── Data fetching ──

export async function fetchAppData(userId) {
    // Always return all vocab — accessible to everyone
    const vocabQuery = prisma.vocabulary
        .findMany({ orderBy: { createdAt: "desc" }, ...vocabularyInclude })
        .then((rows) => rows.map(rowToVocabulary));

    // If signed in, fetch user progress flags separately
    let userVocabMap = new Map();
    if (userId) {
        const userVocabs = await prisma.userVocabulary.findMany({
            where: { userId },
            select: { vocabularyId: true, important: true, mastered: true, studyProgress: true, studyProgressAt: true },
        });
        for (const uv of userVocabs) {
            userVocabMap.set(uv.vocabularyId, uv);
        }
    }

    const [vocabularies, grammars, lessons, sentencePatterns, hanCharacters] = await Promise.all([
        vocabQuery,
        prisma.grammar.findMany({ orderBy: { createdAt: "desc" } }),
        prisma.lesson.findMany({ orderBy: { createdAt: "desc" } }),
        prisma.sentencePattern.findMany({ orderBy: { createdAt: "desc" } }),
        prisma.hanCharacter.findMany({ orderBy: { createdAt: "desc" } }),
    ]);

    // Merge user progress into vocab results
    const mergedVocab = vocabularies.map((v) => {
        const progress = userVocabMap.get(v.id);
        if (progress) {
            return {
                ...v,
                important: progress.important,
                mastered: progress.mastered,
                studyProgress: progress.studyProgress,
                studyProgressAt: progress.studyProgressAt,
            };
        }
        return v;
    });

    return {
        vocabularies: mergedVocab,
        grammars: grammars.map(rowToGrammar),
        lessons: lessons.map(rowToLesson).map((lesson) => ({
            ...lesson,
            grammar: lesson.grammar.map((g) => {
                if (typeof g === "string" || !g.content) {
                    const full = grammars.find((gr) => gr.id === (typeof g === "string" ? g : g.id));
                    if (full) return rowToGrammar(full);
                }
                return g;
            }),
        })),
        sentencePatterns: sentencePatterns.map(rowToSentencePattern),
        hanCharacters: hanCharacters.map(rowToHanCharacter),
    };
}

export async function fetchAllData(userId) {
    return fetchAppData(userId);
}

export async function fetchSentencePatternRows(userId) {
    const rows = await prisma.sentencePattern.findMany({ where: { userId } });
    return rows;
}

// ── Query vocabularies (browse) ──

const SORT_FIELDS = {
    sinoVietnamese: "sinoVietnamese",
    hanTraditional: "hanTraditional",
    jyutping: "jyutping",
    pinyin: "pinyin",
    vietMeanings: "vietMeanings",
    engMeanings: "engMeanings",
    hskLevel: "hskLevel",
    createdAt: "createdAt",
    studyProgressAt: "studyProgressAt",
};
const vocabularyInclude = {
    include: {
        vocabularyMeanings: {
            orderBy: { position: "asc" },
            include: {
                examples: { orderBy: { position: "asc" } },
            },
        },
        vocabularyExamples: { orderBy: { position: "asc" } },
    },
};
export async function queryVocabularies(
    userId,
    {
        page = 1,
        pageSize = 10,
        sortKey = "createdAt",
        sortDir = "desc",
        filter = "all",
        search = "",
        importantFirst = false,
        studyDue = false,
        maxProgress = null,
        hskLevel = null,
    } = {},
) {
    const safePageSize = Math.min(50, Math.max(1, Number(pageSize) || 10));
    const safePage = Math.max(1, Number(page) || 1);

    // Build vocabulary where clause (same for everyone)
    const wordWhere = {};
    if (hskLevel === "hsk") wordWhere.hskLevel = { not: null };
    else if (hskLevel === "legacy") wordWhere.hskLevel = null;
    else if (hskLevel && hskLevel !== "all") wordWhere.hskLevel = hskLevel;

    if (search && search.trim()) {
        const q = search.trim();
        wordWhere.OR = [
            { hanTraditional: { contains: q, mode: "insensitive" } },
            { hanSimplified: { contains: q, mode: "insensitive" } },
            { sinoVietnamese: { contains: q, mode: "insensitive" } },
            { jyutping: { contains: q, mode: "insensitive" } },
            { pinyin: { contains: q, mode: "insensitive" } },
            { searchKey: { contains: q, mode: "insensitive" } },
        ];
    }

    // If progress filters active, get matching vocab IDs from userVocabulary
    let progressFilterIds = null;
    if (userId && (filter !== "all" || studyDue || maxProgress != null)) {
        const uwWhere = { userId };
        if (filter === "important") uwWhere.important = true;
        else if (filter === "mastered") uwWhere.mastered = true;
        if (studyDue) {
            uwWhere.mastered = false;
            uwWhere.studyProgress = { gt: 0, lt: 100 };
        }
        if (maxProgress != null && maxProgress !== "") {
            uwWhere.mastered = false;
            uwWhere.studyProgress = { lte: Math.max(0, Math.min(100, Math.round(Number(maxProgress)))) };
        }
        const matching = await prisma.userVocabulary.findMany({
            where: uwWhere,
            select: { vocabularyId: true },
        });
        progressFilterIds = new Set(matching.map((m) => m.vocabularyId));
        if (progressFilterIds.size === 0) {
            return { items: [], total: 0, page: safePage, pageSize: safePageSize };
        }
        wordWhere.id = { in: [...progressFilterIds] };
    }

    // Fetch user progress for merging
    let userProgressMap = new Map();
    if (userId) {
        const userVocabs = await prisma.userVocabulary.findMany({
            where: { userId },
            select: { vocabularyId: true, important: true, mastered: true, studyProgress: true, studyProgressAt: true },
        });
        for (const uv of userVocabs) {
            userProgressMap.set(uv.vocabularyId, uv);
        }
    }

    const sortField = SORT_FIELDS[sortKey] ?? "createdAt";
    const orderBy = [];
    if (importantFirst && userId) {
        // For importantFirst, fetch all, sort by user progress, then paginate
        // Simplified: just sort by createdAt for now, important is merged in frontend
    }
    orderBy.push({ [sortField]: sortDir === "asc" ? "asc" : "desc" });

    const [items, total] = await Promise.all([
        prisma.vocabulary.findMany({
            where: wordWhere,
            orderBy,
            skip: (safePage - 1) * safePageSize,
            take: safePageSize,
            ...vocabularyInclude,
        }),
        prisma.vocabulary.count({ where: wordWhere }),
    ]);

    // Merge user progress
    const merged = items.map((v) => {
        const row = rowToVocabulary(v);
        const progress = userProgressMap.get(v.id);
        if (progress) {
            return {
                ...row,
                important: progress.important,
                mastered: progress.mastered,
                studyProgress: progress.studyProgress,
                studyProgressAt: progress.studyProgressAt,
            };
        }
        return row;
    });

    return {
        items: merged,
        total,
        page: safePage,
        pageSize: safePageSize,
    };
}

export async function fetchVocabulariesByIds(userId, ids) {
    if (!ids.length) return [];
    const rows = await prisma.vocabulary.findMany({
        where: { id: { in: ids } },
        ...vocabularyInclude,
    });
    const results = rows.map(rowToVocabulary);
    if (userId) {
        const userVocabs = await prisma.userVocabulary.findMany({
            where: { userId, vocabularyId: { in: ids } },
            select: { vocabularyId: true, important: true, mastered: true, studyProgress: true, studyProgressAt: true },
        });
        const progressMap = new Map(userVocabs.map((uv) => [uv.vocabularyId, uv]));
        return results.map((v) => {
            const p = progressMap.get(v.id);
            return p
                ? {
                      ...v,
                      important: p.important,
                      mastered: p.mastered,
                      studyProgress: p.studyProgress,
                      studyProgressAt: p.studyProgressAt,
                  }
                : v;
        });
    }
    return results;
}

// ── Auth ──

export async function ensureUser({ email, name, googleId }) {
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
        user = await prisma.user.create({
            data: {
                id: randomUUID(),
                email,
                name: name ?? email,
                isAdmin:
                    process.env.ADMIN_EMAILS?.split(",")
                        .map((e) => e.trim())
                        .includes(email) ?? false,
            },
        });
    }
    return user;
}

export async function ensureUserVocabulary(userId) {
    const count = await prisma.userVocabulary.count({ where: { userId } });
    const allVocabs = await prisma.vocabulary.findMany({ select: { id: true } });
    if (count >= allVocabs.length) return { linked: 0, total: allVocabs.length };
    const BATCH = 500;
    let linked = 0;
    const now = new Date();

    for (let i = 0; i < allVocabs.length; i += BATCH) {
        const batch = allVocabs.slice(i, i + BATCH);
        await prisma.userVocabulary.createMany({
            data: batch.map((v) => ({
                id: randomUUID(),
                userId,
                vocabularyId: v.id,
                createdAt: now,
                updatedAt: now,
            })),
            skipDuplicates: true,
        });
        linked += batch.length;
    }

    return { linked, total: allVocabs.length };
}

// ── Replace data (upload) ──

export async function replacePartialData(userId, { types, words, grammarBank, lessons, sentencePatterns }) {
    const counts = {};

    if (types.includes("vocabularies") || types.includes("words")) {
        // Remove all user-word links for this user
        await prisma.userVocabulary.deleteMany({ where: { userId } });
        if (words.length) {
            for (const w of words) {
                const wordId = w.id || randomUUID();
                const vocabDict = vocabularyToRow({ ...w, id: wordId }, userId);
                const progress = userWordFields(w);
                const { id: _id, createdAt, updatedAt, ...dictData } = vocabDict;

                // Create new Vocabulary entry — never overwrite existing ones
                // (different pronunciations of the same word are separate entries)
                await prisma.vocabulary.create({
                    data: { id: wordId, ...dictData },
                });

                // Create UserWord link
                await prisma.userVocabulary.create({
                    data: {
                        id: randomUUID(),
                        userId,
                        wordId,
                        ...progress,
                    },
                });
            }
        }
        counts.words = words.length;
    }

    if (types.includes("grammar")) {
        await prisma.grammar.deleteMany({ where: { userId } });
        if (grammarBank.length) {
            const rows = grammarBank.map((g) => grammarToRow({ ...g, id: g.id || randomUUID() }, userId));
            await prisma.grammar.createMany({ data: rows.map(({ createdAt, updatedAt, ...r }) => ({ ...r })) });
        }
        counts.grammarBank = grammarBank.length;
    }

    if (types.includes("lessons")) {
        await prisma.lesson.deleteMany({ where: { userId } });
        if (lessons.length) {
            const rows = lessons.map((l) => lessonToRow({ ...l, id: l.id || randomUUID() }, userId));
            await prisma.lesson.createMany({ data: rows.map(({ createdAt, updatedAt, ...r }) => ({ ...r })) });
        }
        counts.lessons = lessons.length;
    }

    if (types.includes("sentencePatterns")) {
        await prisma.sentencePattern.deleteMany({ where: { userId } });
        if (sentencePatterns.length) {
            const rows = sentencePatterns.map((s) => sentencePatternToRow({ ...s, id: s.id || randomUUID() }, userId));
            await prisma.sentencePattern.createMany({ data: rows.map(({ createdAt, updatedAt, ...r }) => ({ ...r })) });
        }
        counts.sentencePatterns = sentencePatterns.length;
    }

    return counts;
}

// ── Vocabulary CRUD (shared dictionary + per-user progress) ──

export async function createVocabulary(userId, body) {
    const vocabDict = vocabularyToRow(body, userId);
    const progress = userWordFields(body);
    const meanings = vocabDict._meanings;
    const examples = vocabDict._examples;
    delete vocabDict._meanings;
    delete vocabDict._examples;

    // Create a new Vocabulary entry — never overwrite existing ones
    // (different pronunciations of the same word are separate entries)
    const { id: _dictId, createdAt, updatedAt, ...dictData } = vocabDict;
    const vocab = await prisma.vocabulary.create({
        data: { id: _dictId, ...dictData },
    });

    // Upsert meanings and examples
    await upsertMeaningsAndExamples(vocab.id, meanings, examples);

    // Create UserWord link (or skip if already exists)
    const userVocab = await prisma.userVocabulary.upsert({
        where: { userId_vocabularyId: { userId, vocabularyId: vocab.id } },
        create: {
            id: randomUUID(),
            userId,
            vocabularyId: vocab.id,
            ...progress,
        },
        update: {}, // no-op if already linked
    });

    return rowToVocabulary({ ...userVocab, vocabulary: vocab });
}

export async function updateVocabulary(userId, id, body) {
    try {
        // Update shared Vocabulary dictionary fields
        const vocabDict = vocabularyToRow({ ...body, id }, userId, { includeCreatedAt: false });
        const meanings = vocabDict._meanings;
        const examples = vocabDict._examples;
        delete vocabDict._meanings;
        delete vocabDict._examples;
        const { id: _id, createdAt, ...dictData } = vocabDict;

        const vocab = await prisma.vocabulary.update({
            where: { id },
            data: {
                hanSimplified: dictData.hanSimplified ?? undefined,
                hanTraditional: dictData.hanTraditional,
                sinoVietnamese: dictData.sinoVietnamese ?? undefined,
                jyutping: dictData.jyutping ?? undefined,
                pinyin: dictData.pinyin ?? undefined,
                vietMeanings: dictData.vietMeanings ?? undefined,
                vietExamples: dictData.vietExamples ?? undefined,
                engMeanings: dictData.engMeanings ?? undefined,
                hskLevel: dictData.hskLevel ?? undefined,
                searchKey: dictData.searchKey ?? undefined,
            },
        });

        // Upsert meanings and examples
        await upsertMeaningsAndExamples(vocab.id, meanings, examples);

        // Also update UserWord progress fields if present
        const progress = userWordFields(body);
        const userVocab = await prisma.userVocabulary.upsert({
            where: { userId_vocabularyId: { userId, vocabularyId: id } },
            create: {
                id: randomUUID(),
                userId,
                vocabularyId: id,
                ...progress,
            },
            update: progress,
        });

        // Re-fetch with meanings/examples included
        const refreshed = await prisma.userVocabulary.findUnique({
            where: { userId_vocabularyId: { userId, vocabularyId: id } },
            include: { vocabulary: vocabularyInclude },
        });
        return rowToVocabulary(refreshed);
    } catch (e) {
        console.error("updateVocabulary error:", e.message, e.stack);
        throw e;
    }
}

async function upsertMeaningsAndExamples(vocabularyId, meanings, examples) {
    // Delete existing meanings and examples, then recreate
    await prisma.vocabularyExample.deleteMany({ where: { vocabularyId } });
    await prisma.vocabularyMeaning.deleteMany({ where: { vocabularyId } });

    // Create meanings
    const meaningIdMap = new Map(); // tempId → realId
    if (Array.isArray(meanings) && meanings.length > 0) {
        for (let i = 0; i < meanings.length; i++) {
            const m = meanings[i];
            const created = await prisma.vocabularyMeaning.create({
                data: {
                    id: m.id || randomUUID(),
                    vocabularyId,
                    category: m.category ?? "",
                    vietMeanings: m.vietMeanings ?? "",
                    engMeanings: m.engMeanings ?? "",
                    position: m.position ?? i,
                },
            });
            if (m._tempId) meaningIdMap.set(m._tempId, created.id);
            if (m.id && !m._tempId) meaningIdMap.set(m.id, created.id);

            // Create nested examples for this meaning
            const nestedExamples = m.examples ?? [];
            for (let j = 0; j < nestedExamples.length; j++) {
                const ex = nestedExamples[j];
                await prisma.vocabularyExample.create({
                    data: {
                        id: ex.id || randomUUID(),
                        vocabularyId,
                        meaningId: created.id,
                        hanExample: ex.hanExample ?? "",
                        jyutpingExample: ex.jyutpingExample ?? "",
                        pinyinExample: ex.pinyinExample ?? "",
                        vietExamples: ex.vietExamples ?? "",
                        engExamples: ex.engExamples ?? "",
                        position: ex.position ?? j,
                    },
                });
            }
        }
    }

    // Create top-level examples (not linked to any meaning)
    if (Array.isArray(examples) && examples.length > 0) {
        for (let i = 0; i < examples.length; i++) {
            const ex = examples[i];
            const meaningId = ex.meaningId || (ex._tempMeaningId ? meaningIdMap.get(ex._tempMeaningId) : null) || null;
            await prisma.vocabularyExample.create({
                data: {
                    id: ex.id || randomUUID(),
                    vocabularyId,
                    meaningId,
                    hanExample: ex.hanExample ?? "",
                    jyutpingExample: ex.jyutpingExample ?? "",
                    pinyinExample: ex.pinyinExample ?? "",
                    vietExamples: ex.vietExamples ?? "",
                    engExamples: ex.engExamples ?? "",
                    position: ex.position ?? i,
                },
            });
        }
    }
}

export async function patchVocabularyFlags(userId, id, flags) {
    const data = { updatedAt: new Date() };
    if ("important" in flags) data.important = flags.important;
    if ("mastered" in flags) data.mastered = flags.mastered;
    if ("studyProgress" in flags) {
        data.studyProgress = Math.max(0, Math.min(100, Math.round(flags.studyProgress)));
        if (data.studyProgress > 0) data.studyProgressAt = new Date();
    }

    const userVocab = await prisma.userVocabulary.upsert({
        where: { userId_vocabularyId: { userId, vocabularyId: id } },
        create: {
            id: randomUUID(),
            userId,
            vocabularyId: id,
            ...data,
        },
        update: data,
        include: { vocabulary: vocabularyInclude },
    });

    return rowToVocabulary(userVocab);
}

export async function deleteVocabulary(userId, id) {
    // Delete user-vocabulary link
    await prisma.userVocabulary.deleteMany({
        where: { userId, vocabularyId: id },
    });
    // Delete the vocabulary record itself (admin action)
    await prisma.vocabulary.delete({ where: { id } }).catch(() => {});
}

// Grammar CRUD
export async function createGrammar(userId, body) {
    const row = grammarToRow(body, userId);
    const { id, createdAt, updatedAt, ...data } = row;
    const created = await prisma.grammar.create({ data: { id, ...data } });
    return rowToGrammar(created);
}

export async function updateGrammar(userId, id, body) {
    const row = grammarToRow({ ...body, id }, userId, { includeCreatedAt: false });
    const { createdAt, ...data } = row;
    const updated = await prisma.grammar.update({
        where: { id_userId: { id, userId } },
        data,
    });
    return rowToGrammar(updated);
}

export async function deleteGrammar(userId, id) {
    await prisma.grammar.delete({ where: { id_userId: { id, userId } } });
}

// Sentence CRUD
export async function createSentence(userId, body) {
    const row = sentencePatternToRow(body, userId);
    const { id, createdAt, updatedAt, ...data } = row;
    const created = await prisma.sentencePattern.create({ data: { id, ...data } });
    return rowToSentencePattern(created);
}

export async function updateSentence(userId, id, body) {
    const row = sentencePatternToRow({ ...body, id }, userId, { includeCreatedAt: false });
    const { createdAt, ...data } = row;
    const updated = await prisma.sentencePattern.update({
        where: { id_userId: { id, userId } },
        data,
    });
    return rowToSentencePattern(updated);
}

export async function deleteSentence(userId, id) {
    await prisma.sentencePattern.delete({ where: { id_userId: { id, userId } } });
}

// Lesson CRUD
export async function createLesson(userId, body) {
    const row = lessonToRow(body, userId);
    const { id, createdAt, updatedAt, ...data } = row;
    const created = await prisma.lesson.create({ data: { id, ...data } });
    return rowToLesson(created);
}

export async function updateLesson(userId, id, body) {
    const row = lessonToRow({ ...body, id }, userId);
    const { id: _id, createdAt, updatedAt, ...data } = row;
    const updated = await prisma.lesson.update({
        where: { id_userId: { id, userId } },
        data,
    });
    return rowToLesson(updated);
}

export async function deleteLesson(userId, id) {
    await prisma.lesson.delete({ where: { id_userId: { id, userId } } });
}

// Han character CRUD
export async function createHanChar(userId, body) {
    const row = hanCharacterToRow(body, userId);
    const { id, createdAt, updatedAt, ...data } = row;
    const created = await prisma.hanCharacter.create({ data: { id, ...data } });
    return rowToHanCharacter(created);
}

export async function updateHanChar(userId, id, body) {
    const row = hanCharacterToRow({ ...body, id }, userId, { includeCreatedAt: false });
    const { createdAt, ...data } = row;
    const updated = await prisma.hanCharacter.update({
        where: { id_userId: { id, userId } },
        data,
    });
    return rowToHanCharacter(updated);
}

export async function patchHanCharFlags(userId, id, flags) {
    const data = { updatedAt: new Date() };
    if ("important" in flags) data.important = flags.important;
    if ("mastered" in flags) data.mastered = flags.mastered;
    if ("popularity" in flags) data.popularity = flags.popularity;
    const updated = await prisma.hanCharacter.update({
        where: { id_userId: { id, userId } },
        data,
    });
    return rowToHanCharacter(updated);
}

export async function deleteHanChar(userId, id) {
    await prisma.hanCharacter.delete({ where: { id_userId: { id, userId } } });
}

// ── Resolve user ──

export async function resolveReadUserId(session) {
    if (session?.userId) return session.userId;
    return null;
}
