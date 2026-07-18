const PAGE_SIZE = 1000;
const UPSERT_BATCH = 500;
const DELETE_BATCH = 200;

import { normalizeWordFields } from "./wordNormalize.js";
import { normalizePopularity } from "./wordPopularity.js";
import { countWords, queryWords } from "./wordQuery.js";
import { normalizeSearchText } from "./searchNormalize.js";
import { randomUUID } from "crypto";

function clampStudyProgress(value) {
    const n = Math.round(Number(value) || 0);
    return Math.max(0, Math.min(100, n));
}

export function wordToRow(word, userId, { includeCreatedAt = true } = {}) {
    const w = normalizeWordFields(word);
    const row = {
        id: w.id,
        user_id: userId,
        han_simplified: w.hanSimplified?.trim() || null,
        han_traditional: w.hanTraditional ?? w.hanTrad ?? w.han ?? "",
        han_viet: w.hanViet ?? null,
        jyutping: w.jyutping ?? null,
        pinyin: w.pinyin?.trim() || null,
        dialect: w.dialect ?? "cantonese",
        vietnamese: w.vietnamese ?? "",
        vietnamese_detail: w.vietnameseDetail?.trim() || null,
        english: w.english ?? "",
        popularity: normalizePopularity(w.popularity),
        important: w.important ?? false,
        mastered: w.mastered ?? false,
        study_progress: clampStudyProgress(w.studyProgress ?? 0),
        study_progress_at: w.studyProgressAt ?? null,
        updated_at: new Date().toISOString(),
    };
    if (includeCreatedAt) {
        row.created_at = w.createdAt ?? new Date().toISOString();
    }
    return row;
}

export function rowToWord(row) {
    const updatedAt = row.updated_at ?? row.created_at ?? undefined;
    const createdAt = row.created_at ?? row.updated_at ?? undefined;
    return {
        id: row.id,
        hanTraditional: row.han_traditional ?? row.han_trad ?? row.han ?? "",
        hanSimplified: row.han_simplified?.trim() || row.han_simp?.trim() || undefined,
        hanViet: row.han_viet ?? undefined,
        jyutping: row.jyutping ?? undefined,
        pinyin: row.pinyin ?? undefined,
        dialect: row.dialect ?? "cantonese",
        vietnamese: row.vietnamese ?? "",
        vietnameseDetail: row.vietnamese_detail?.trim() || undefined,
        english: row.english ?? "",
        popularity: row.popularity ?? undefined,
        important: row.important ?? false,
        mastered: row.mastered ?? false,
        studyProgress: clampStudyProgress(row.study_progress ?? 0),
        studyProgressAt: row.study_progress_at ?? undefined,
        createdAt,
        updatedAt,
    };
}

export function grammarToRow(item, userId, { includeCreatedAt = true } = {}) {
    const row = {
        id: item.id,
        user_id: userId,
        title: item.title ?? "",
        content: item.content ?? "",
        important: item.important ?? false,
        mastered: item.mastered ?? false,
        updated_at: new Date().toISOString(),
    };
    if (includeCreatedAt) {
        row.created_at = item.createdAt ?? new Date().toISOString();
    }
    return row;
}

export function rowToGrammar(row) {
    const updatedAt = row.updated_at ?? row.created_at ?? undefined;
    const createdAt = row.created_at ?? row.updated_at ?? undefined;
    return {
        id: row.id,
        title: row.title ?? "",
        content: row.content ?? "",
        important: row.important ?? false,
        mastered: row.mastered ?? false,
        createdAt,
        updatedAt,
    };
}

export function sentencePatternToRow(item, userId, { includeCreatedAt = true } = {}) {
    const row = {
        id: item.id,
        user_id: userId,
        han_traditional: item.hanTraditional ?? "",
        han_simplified: item.hanSimplified ?? null,
        jyutping: item.jyutping ?? null,
        pinyin: item.pinyin ?? null,
        vietnamese: item.vietnamese ?? "",
        english: item.english ?? "",
        word_ids: item.wordIds ?? [],
        important: item.important ?? false,
        mastered: item.mastered ?? false,
        updated_at: new Date().toISOString(),
    };
    if (includeCreatedAt) {
        row.created_at = item.createdAt ?? new Date().toISOString();
    }
    return row;
}

export function rowToSentencePattern(row) {
    const updatedAt = row.updated_at ?? row.created_at ?? undefined;
    const createdAt = row.created_at ?? row.updated_at ?? undefined;
    return {
        id: row.id,
        hanTraditional: row.han_traditional ?? "",
        hanSimplified: row.han_simplified ?? "",
        jyutping: row.jyutping ?? "",
        pinyin: row.pinyin ?? "",
        vietnamese: row.vietnamese ?? "",
        english: row.english ?? "",
        wordIds: row.word_ids ?? [],
        important: row.important ?? false,
        mastered: row.mastered ?? false,
        createdAt,
        updatedAt,
    };
}

export function lessonToRow(lesson, userId) {
    return {
        id: lesson.id,
        user_id: userId,
        name: lesson.name ?? "",
        word_ids: lesson.wordIds ?? [],
        grammar: lesson.grammar ?? [],
        created_at: lesson.createdAt ?? new Date().toISOString(),
        updated_at: lesson.updatedAt ?? new Date().toISOString(),
    };
}

export function rowToLesson(row) {
    return {
        id: row.id,
        name: row.name ?? "",
        wordIds: row.word_ids ?? [],
        grammar: Array.isArray(row.grammar) ? row.grammar.map((g) => ({ ...g, mastered: g.mastered ?? false })) : [],
        createdAt: row.created_at,
        updatedAt: row.updated_at ?? row.created_at,
    };
}

export async function fetchAllRows(db, table, userId) {
    const rows = [];
    let from = 0;
    while (true) {
        const { data, error } = await db
            .from(table)
            .select("*")
            .eq("user_id", userId)
            .order("id", { ascending: true })
            .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        if (!data?.length) break;
        rows.push(...data);
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
    }
    return rows;
}

function isMissingSentencePatternsTable(error) {
    const code = error?.code ?? "";
    const message = String(error?.message ?? "");
    return code === "PGRST205" && message.includes("sentence_patterns");
}

/** Returns [] when migration has not been applied yet. */
export async function fetchSentencePatternRows(db, userId) {
    try {
        return await fetchAllRows(db, "sentence_patterns", userId);
    } catch (error) {
        if (isMissingSentencePatternsTable(error)) return [];
        throw error;
    }
}

async function fetchAllIds(db, table, userId) {
    const ids = [];
    let from = 0;
    while (true) {
        const { data, error } = await db
            .from(table)
            .select("id")
            .eq("user_id", userId)
            .order("id", { ascending: true })
            .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        if (!data?.length) break;
        ids.push(...data.map((r) => r.id));
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
    }
    return ids;
}

export function hanCharacterToRow(item, userId, { includeCreatedAt = true } = {}) {
    const ch = item.hanSimplified ?? item.character ?? "";
    const readings = Array.isArray(item.hanViet)
        ? item.hanViet.map((r) => String(r ?? "").trim()).filter(Boolean)
        : String(item.hanViet ?? "").trim()
          ? [String(item.hanViet).trim()]
          : [];
    const hanVietArr = readings.length > 0 ? readings : null;
    const hanVietText = [...new Set(readings.map((r) => normalizeSearchText(r)).filter(Boolean))].join(" ");

    const parseArr = (val) => {
        if (Array.isArray(val)) return val.map((r) => String(r ?? "").trim()).filter(Boolean);
        const s = String(val ?? "").trim();
        return s ? [s] : [];
    };
    const pinyinArr = parseArr(item.pinyin);
    const jyutpingArr = parseArr(item.jyutping);
    const pinyinText = [...new Set(pinyinArr.map((r) => normalizeSearchText(r)).filter(Boolean))].join(" ");
    const jyutpingText = [...new Set(jyutpingArr.map((r) => normalizeSearchText(r)).filter(Boolean))].join(" ");

    const row = {
        id: item.id ?? randomUUID(),
        user_id: userId,
        han_simplified: ch,
        han_traditional: String(item.hanTraditional ?? "").trim() || null,
        han_viet: hanVietArr,
        pinyin: pinyinArr.length > 0 ? pinyinArr : null,
        jyutping: jyutpingArr.length > 0 ? jyutpingArr : null,
        popularity: normalizePopularity(item.popularity),
        important: item.important ?? false,
        mastered: item.mastered ?? false,
        search_key: normalizeSearchText(
            ch + " " + (item.hanTraditional ?? "") + " " + hanVietText + " " + pinyinText + " " + jyutpingText,
        ),
        updated_at: new Date().toISOString(),
    };
    if (includeCreatedAt) {
        row.created_at = item.createdAt ?? new Date().toISOString();
    }
    return row;
}

export function rowToHanCharacter(row) {
    const updatedAt = row.updated_at ?? row.created_at ?? undefined;
    const createdAt = row.created_at ?? row.updated_at ?? undefined;
    const toArr = (v) => {
        if (Array.isArray(v)) return v.length > 0 ? v : undefined;
        if (!v) return undefined;
        // Old data: single text string, may be space-separated multiple readings
        const parts = String(v).split(/\s+/).filter(Boolean);
        return parts.length > 0 ? parts : undefined;
    };
    const hanViet = toArr(row.han_viet);
    return {
        id: row.id,
        hanSimplified: row.han_simplified ?? "",
        hanTraditional: row.han_traditional ?? undefined,
        hanViet,
        pinyin: toArr(row.pinyin),
        jyutping: toArr(row.jyutping),
        popularity: row.popularity ?? undefined,
        important: row.important ?? false,
        mastered: row.mastered ?? false,
        createdAt,
        updatedAt,
    };
}

export async function upsertBatched(db, table, rows) {
    for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
        const chunk = rows.slice(i, i + UPSERT_BATCH);
        const byId = new Map();
        for (const row of chunk) byId.set(row.id, row);
        const { error } = await db.from(table).upsert([...byId.values()], { onConflict: "id" });
        if (error) throw error;
    }
}

async function deleteIdsBatched(db, table, ids) {
    for (let i = 0; i < ids.length; i += DELETE_BATCH) {
        const chunk = ids.slice(i, i + DELETE_BATCH);
        const { error } = await db.from(table).delete().in("id", chunk);
        if (error) throw error;
    }
}

async function replaceTable(db, table, userId, rows, toRow) {
    const payload = rows.map((item) => toRow(item, userId));
    if (payload.length > 0) {
        await upsertBatched(db, table, payload);
    }
    const remoteIds = await fetchAllIds(db, table, userId);
    const keep = new Set(rows.map((r) => r.id));
    const toDelete = remoteIds.filter((id) => !keep.has(id));
    await deleteIdsBatched(db, table, toDelete);
}

export async function fetchAllData(db, userId) {
    const [wordRows, grammarRows, lessonRows, sentenceRows] = await Promise.all([
        fetchAllRows(db, "words", userId),
        fetchAllRows(db, "grammar_bank", userId),
        fetchAllRows(db, "lessons", userId),
        fetchSentencePatternRows(db, userId),
    ]);
    return {
        words: wordRows.map(rowToWord),
        grammarBank: grammarRows.map(rowToGrammar),
        lessons: lessonRows.map(rowToLesson),
        sentencePatterns: sentenceRows.map(rowToSentencePattern),
    };
}

/** Initial app load — loads ALL data in one shot. Pagination handled by frontend. */
export async function fetchAppData(db, userId) {
    const [wordRows, grammarRows, lessonRows, sentenceRows, wordTotal, masteredWordCount] = await Promise.all([
        fetchAllRows(db, "words", userId),
        fetchAllRows(db, "grammar_bank", userId),
        fetchAllRows(db, "lessons", userId),
        fetchSentencePatternRows(db, userId),
        countWords(db, userId),
        countWords(db, userId, { filter: "mastered" }),
    ]);

    // Load all han characters (skip if table doesn't exist yet)
    let hanCharacterRows = [];
    let hanCharacterTotal = 0;
    try {
        const hanRows = await fetchAllRows(db, "han_characters", userId);
        hanCharacterRows = hanRows;
        hanCharacterTotal = hanRows.length;
    } catch (err) {
        const msg = String(err?.message ?? "");
        if (!/relation.*does not exist|PGRST205/i.test(msg)) throw err;
    }

    return {
        words: wordRows.map(rowToWord),
        wordTotal,
        masteredWordCount,
        grammarBank: grammarRows.map(rowToGrammar),
        lessons: lessonRows.map(rowToLesson),
        sentencePatterns: sentenceRows.map(rowToSentencePattern),
        hanCharacters: hanCharacterRows.map(rowToHanCharacter),
        hanCharacterTotal,
    };
}

/** Replace selected tables on cloud — overwrites only chosen types. */
export async function replacePartialData(
    db,
    userId,
    { types, words = [], grammarBank = [], lessons = [], sentencePatterns = [] },
) {
    const now = new Date().toISOString();
    const counts = { words: 0, grammar: 0, lessons: 0, sentencePatterns: 0 };

    if (types.includes("words")) {
        await replaceTable(db, "words", userId, words, (w, uid) => ({ ...wordToRow(w, uid), updated_at: now }));
        counts.words = words.length;
    }
    if (types.includes("grammar")) {
        await replaceTable(db, "grammar_bank", userId, grammarBank, (g, uid) => ({
            ...grammarToRow(g, uid),
            updated_at: now,
        }));
        counts.grammar = grammarBank.length;
    }
    if (types.includes("lessons")) {
        await replaceTable(db, "lessons", userId, lessons, lessonToRow);
        counts.lessons = lessons.length;
    }
    if (types.includes("sentencePatterns")) {
        await replaceTable(db, "sentence_patterns", userId, sentencePatterns, (s, uid) => ({
            ...sentencePatternToRow(s, uid),
            updated_at: now,
        }));
        counts.sentencePatterns = sentencePatterns.length;
    }

    return counts;
}

/** @deprecated use replacePartialData */
export async function replaceAllData(db, userId, payload) {
    return replacePartialData(db, userId, {
        types: ["words", "grammar", "lessons"],
        ...payload,
    });
}

export async function findUserByEmail(db, email) {
    let page = 1;
    while (true) {
        const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
        if (error) throw error;
        const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
        if (match) return match;
        if (data.users.length < 200) break;
        page += 1;
    }
    return null;
}

export async function ensureSupabaseUser(db, { email, name, googleId }) {
    const existing = await findUserByEmail(db, email);
    if (existing) return existing;

    const { data, error } = await db.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { name, google_id: googleId },
    });
    if (error) throw error;
    return data.user;
}
