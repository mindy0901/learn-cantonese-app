/**
 * Prisma-based data service — replaces Supabase dataService.js.
 * Same API surface so routes/data.js works with minimal changes.
 */
import { prisma } from "./prisma.js";
import { randomUUID } from "crypto";
import { computeHanCharacters, syncVocabularyHanCharacters } from "./hanCharacterBreakdown.js";
import { capitalizeSentences } from "./wordNormalize.js";
import { romanizationId } from "./romanizationId.js";
import {
    blocksFromRow,
    buildRomanizationJsonNew,
    blockFromLegacy,
    flatDerivedFromBlocks,
    meaningFromLegacy,
    normalizeBlock,
} from "./vocabModel.js";

export { romanizationId };

const PAGE_SIZE = 1000;

let _cnchar = null;
let _cncharTrad = null;
async function loadCnchar() {
    if (_cnchar) return _cnchar;
    const [cnchar, trad] = await Promise.all([import("cnchar"), import("cnchar-trad")]);
    const cc = cnchar.default;
    cc.use(trad.default);
    _cnchar = cc;
    return cc;
}

/**
 * Stroke count of a single han character via cnchar (+trad plugin).
 * Returns null when the character is unknown (Cantonese-only chars like 冚).
 * Lazy-loads cnchar only when a character is created/edited.
 */
export async function computeStrokeCount(ch) {
    if (!ch) return null;
    try {
        const cc = await loadCnchar();
        const n = cc.stroke(String(ch));
        return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
    } catch {
        return null;
    }
}

// ── Row ↔ Domain transforms (mirror dataService.js signatures) ──

/**
 * Split an example's han text into giản (line 0) + phồn (line 1).
 * Prefers explicit hanSimplified/hanTraditional; falls back to splitting hanExample ("giản\nphồn").
 */
export function splitExampleHan(ex) {
    const simp = (ex?.hanSimplified ?? "").trim();
    const trad = (ex?.hanTraditional ?? "").trim();
    if (simp || trad) return { hanSimplified: simp, hanTraditional: trad };
    const lines = String(ex?.hanExample ?? "")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
    return {
        hanSimplified: lines[0] ?? "",
        hanTraditional: lines[1] ?? "",
    };
}

/** Build the meaningsJson payload ({meanings:[], examples:[]}) stored on the vocab row. */
export function buildMeaningsJson(meanings) {
    return {
        meanings: (meanings ?? []).map((m, i) => ({
            id: m.id,
            category: m.category ?? "",
            vietMeanings: capitalizeSentences(m.vietMeanings ?? ""),
            engMeanings: capitalizeSentences(m.engMeanings ?? "", { comma: true }),
            examples: (m.examples ?? []).map((ex, j) => {
                const han = splitExampleHan(ex);
                return {
                    id: ex.id,
                    hanSimplified: han.hanSimplified,
                    hanTraditional: han.hanTraditional,
                    hanExample: [han.hanSimplified, han.hanTraditional].filter(Boolean).join("\n"),
                    jyutpingExample: ex.jyutpingExample ?? "",
                    pinyinExample: ex.pinyinExample ?? "",
                    vietExamples: ex.vietExamples ?? "",
                    engExamples: ex.engExamples ?? "",
                    position: ex.position ?? j,
                };
            }),
            position: m.position ?? i,
        })),
    };
}

/**
 * Build the romanizationJson payload — model MỚI (2026-08-14):
 *   { mandarin: { hanzi_simplified, hanzi_traditional, system:"pinyin",   readings[] },
 *     cantonese: { hanzi_simplified, hanzi_traditional, system:"jyutping", readings[] } }
 * reading = { id, romanization, sino_vietnamese, meanings[] }
 * Chấp nhận:
 *   - payload model mới (vocab.mandarin / vocab.cantonese)
 *   - legacy typed array (vocab.romanization) → chuyển sang blocks
 *   - flat fallback (pinyin/jyutping/sinoVietnamese/meanings) → build blocks
 */
export function buildRomanizationJson(vocab) {
    if (vocab?.mandarin || vocab?.cantonese) {
        return buildRomanizationJsonNew(vocab);
    }

    const structured = Array.isArray(vocab?.romanization) ? vocab.romanization : null;
    if (structured && structured.length > 0) {
        const hanS = String(vocab?.hanSimplified ?? "");
        const hanT = String(vocab?.hanTraditional ?? "");
        return {
            mandarin: blockFromLegacy(structured, "mandarin", hanS, hanT),
            cantonese: blockFromLegacy(structured, "cantonese", hanS, String(vocab?.hanHongKong ?? hanT)),
        };
    }

    // Flat fallback: derive readings from the flat columns.
    const sino = String(vocab?.sinoVietnamese ?? "");
    const py = String(vocab?.pinyin ?? "")
        .toLowerCase()
        .trim();
    const jp = String(vocab?.jyutping ?? "")
        .toLowerCase()
        .trim();
    const hanS = String(vocab?.hanSimplified ?? "");
    const hanT = String(vocab?.hanTraditional ?? "");
    const hanHK = String(vocab?.hanHongKong ?? hanT);
    const legacyMeanings = Array.isArray(vocab?.meanings) ? vocab.meanings : [];
    const blocks = {
        mandarin: { hanzi_simplified: hanS, hanzi_traditional: hanT, system: "pinyin", readings: [] },
        cantonese: { hanzi_simplified: hanS, hanzi_traditional: hanHK, system: "jyutping", readings: [] },
    };
    if (py) {
        blocks.mandarin.readings.push({
            id: romanizationId(py, ""),
            romanization: py,
            sino_vietnamese: sino,
            meanings: legacyMeanings.map((m, i) => meaningFromLegacy(m, "mandarin", i)),
        });
    }
    if (jp) {
        blocks.cantonese.readings.push({
            id: romanizationId("", jp),
            romanization: jp,
            sino_vietnamese: sino,
            meanings: legacyMeanings.map((m, i) => meaningFromLegacy(m, "cantonese", i)),
        });
    }
    return blocks;
}

/** Extract a romanization entry back into a flat vocab-shaped object (for editing). */
export function romanizationToVocab(base, entry) {
    return {
        ...base,
        pinyin: entry?.pinyin ?? "",
        jyutping: entry?.jyutping ?? "",
        sinoVietnamese: entry?.sinoVietnamese ?? "",
        meanings: entry?.meanings ?? [],
        examples: entry?.examples ?? [],
    };
}

export function vocabularyToRow(vocab, userId, { includeCreatedAt = true } = {}) {
    const now = new Date().toISOString();
    // Model mới: blocks từ mandarin/cantonese (+ fallback legacy typed array / flat).
    const romanizationJson = buildRomanizationJson(vocab);
    const blocks =
        romanizationJson && typeof romanizationJson === "object" && !Array.isArray(romanizationJson)
            ? romanizationJson
            : blocksFromRow(vocab);
    const flat = flatDerivedFromBlocks(blocks);
    const meta = vocab?.metadata ?? {};

    return {
        id: vocab.id,
        hanSimplified: (blocks.mandarin?.hanzi_simplified || blocks.cantonese?.hanzi_simplified || "").trim() || null,
        hanTraditional:
            (
                blocks.mandarin?.hanzi_traditional ||
                blocks.cantonese?.hanzi_traditional ||
                (vocab.hanTraditional ?? vocab.han ?? "")
            ).trim() || "",
        hanHongKong: (blocks.cantonese?.hanzi_traditional || "").trim() || null,
        hskLevel: String(meta.hsk_level ?? vocab.hskLevel ?? "").trim() || null,
        pureCantonese: Boolean(vocab.pureCantonese),
        searchKey: flat.searchKey || null,
        hanCharacters: vocab.hanCharacters ?? undefined,
        romanizationJson,
        boost: meta.popularity ?? vocab.boost ?? vocab.popularity ?? undefined,
        frequency: meta.frequency ?? vocab.frequency ?? undefined,
        movieWordRank: meta.movie_word_rank ?? vocab.movieWordRank ?? undefined,
        bookWordRank: meta.book_word_rank ?? vocab.bookWordRank ?? undefined,
        createdAt: includeCreatedAt ? (vocab.createdAt ?? now) : undefined,
        updatedAt: now,
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

    // Model mới (2026-08-14): { id, mandarin, cantonese, metadata } (+ progress merge bên ngoài).
    const blocks = blocksFromRow(vocab);
    return {
        id: vocab.id,
        mandarin: blocks.mandarin,
        cantonese: blocks.cantonese,
        metadata: {
            hsk_level: vocab.hskLevel ?? "",
            popularity: vocab.boost ?? null,
            frequency: vocab.frequency ?? null,
            movie_word_rank: vocab.movieWordRank ?? null,
            book_word_rank: vocab.bookWordRank ?? null,
            pure_cantonese: Boolean(vocab.pureCantonese),
            created_at: vocab.createdAt ?? vocab.updatedAt ?? null,
            updated_at: vocab.updatedAt ?? vocab.createdAt ?? null,
        },
    };
}

/** Summary flat-shape cho list responses (flashcard decks/sets) — derive từ blocks. */
function vocabListSummary(vocab) {
    const blocks = blocksFromRow(vocab);
    const flat = flatDerivedFromBlocks(blocks);
    return {
        id: vocab.id,
        hanSimplified: (blocks.mandarin?.hanzi_simplified || "").trim() || undefined,
        hanTraditional: (blocks.mandarin?.hanzi_traditional || "").trim() || "",
        hanHongKong: (blocks.cantonese?.hanzi_traditional || "").trim() || undefined,
        sinoVietnamese: flat.sinoVietnamese || undefined,
        jyutping: (flat.jyutping || "").toLowerCase().trim() || undefined,
        pinyin: (flat.pinyin || "").toLowerCase().trim() || undefined,
        vietMeanings: flat.vietMeanings ?? "",
        engMeanings: flat.engMeanings ?? "",
        hskLevel: vocab.hskLevel ?? undefined,
    };
}

export function grammarToRow(item, userId, { includeCreatedAt = true } = {}) {
    const now = new Date().toISOString();
    return {
        id: item.id,
        userId,
        title: item.title ?? "",
        content: item.content ?? "",
        details: Array.isArray(item.details) ? item.details : [],
        notes: Array.isArray(item.notes) ? item.notes : [],
        structure: item.structure ?? "",
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
        details: row.details ?? [],
        notes: row.notes ?? [],
        structure: row.structure ?? "",
        important: row.important ?? false,
        mastered: row.mastered ?? false,
        createdAt: row.createdAt ?? row.updatedAt,
        updatedAt: row.updatedAt ?? row.createdAt,
        examples: (row.grammarExamples ?? []).map((ex) => ({
            id: ex.id,
            hanExample: ex.hanExample ?? "",
            jyutpingExample: ex.jyutpingExample ?? "",
            pinyinExample: ex.pinyinExample ?? "",
            vietExample: ex.vietExample ?? "",
            engExample: ex.engExample ?? "",
            position: ex.position ?? 0,
        })),
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
        // Giữ undefined khi không có simplified riêng (single-form) — không ép thành ""
        hanSimplified: item.hanSimplified ?? undefined,
        hanTraditional: item.hanTraditional || item.hanSimplified || ch || "",
        sinoVietnamese: readings.length > 0 ? readings : [],
        jyutping: parseArr(item.jyutping),
        pinyin: parseArr(item.pinyin),
        important: item.important ?? false,
        mastered: item.mastered ?? false,
        strokeCount: item.strokeCount ?? null,
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
        important: row.important ?? false,
        mastered: row.mastered ?? false,
        strokeCount: row.strokeCount ?? null,
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

    const [vocabularies, grammars, sentencePatterns, hanCharacters] = await Promise.all([
        vocabQuery,
        prisma.grammar.findMany({
            orderBy: { createdAt: "desc" },
            include: { grammarExamples: { orderBy: { position: "asc" } } },
        }),
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

// Sau migration (2026-08-14) các cột flat pinyin/jyutping/sino/viet/eng đã drop.
const SORT_FIELDS = {
    hanTraditional: "hanTraditional",
    hanSimplified: "hanSimplified",
    hanHongKong: "hanHongKong",
    hskLevel: "hskLevel",
    createdAt: "createdAt",
    studyProgressAt: "studyProgressAt",
};
const vocabularyInclude = {};
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
            { hanHongKong: { contains: q, mode: "insensitive" } },
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

export async function replacePartialData(userId, { types, words, grammarBank, sentencePatterns }) {
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

                // Compute + store hanCharacters breakdown, then sync to HanCharacter store
                const breakdown = computeHanCharacters(dictData);
                if (breakdown.length > 0) {
                    await prisma.vocabulary.update({
                        where: { id: wordId },
                        data: { hanCharacters: breakdown, updatedAt: new Date() },
                    });
                    await syncVocabularyHanCharacters(wordId, breakdown);
                }

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
            for (const g of grammarBank) {
                const row = grammarToRow({ ...g, id: g.id || randomUUID() }, userId);
                const { id, createdAt, updatedAt, examples, ...data } = row;
                await prisma.grammar.create({ data: { id, ...data } });
                if (Array.isArray(g.examples) && g.examples.length > 0) {
                    for (let i = 0; i < g.examples.length; i++) {
                        const ex = g.examples[i];
                        await prisma.grammarExample.create({
                            data: {
                                id: ex.id || randomUUID(),
                                grammarId: id,
                                hanExample: ex.hanExample ?? "",
                                jyutpingExample: ex.jyutpingExample ?? "",
                                pinyinExample: ex.pinyinExample ?? "",
                                vietExample: ex.vietExample ?? "",
                                engExample: ex.engExample ?? "",
                                position: ex.position ?? i,
                            },
                        });
                    }
                }
            }
        }
        counts.grammarBank = grammarBank.length;
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

    // Create a new Vocabulary entry — never overwrite existing ones
    // (different pronunciations of the same word are separate entries)
    const { id: _dictId, createdAt, updatedAt, ...dictData } = vocabDict;
    const vocab = await prisma.vocabulary.create({
        data: { id: _dictId, ...dictData },
    });

    // Compute + store hanCharacters breakdown, then sync to HanCharacter store
    const breakdown = computeHanCharacters(vocab);
    if (breakdown.length > 0) {
        await prisma.vocabulary.update({
            where: { id: vocab.id },
            data: { hanCharacters: breakdown, updatedAt: new Date() },
        });
        await syncVocabularyHanCharacters(vocab.id, breakdown);
    }

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

    const full = { ...userVocab, vocabulary: { ...vocab, hanCharacters: breakdown } };
    const base = rowToVocabulary(full);
    return {
        ...base,
        important: userVocab.important ?? false,
        mastered: userVocab.mastered ?? false,
        studyProgress: userVocab.studyProgress ?? 0,
        studyProgressAt: userVocab.studyProgressAt ?? null,
    };
}

export async function updateVocabulary(userId, id, body) {
    try {
        // Khi client gửi model mới (mandarin/cantonese blocks), trust it.
        // Legacy: full `romanization` array → chuyển sang blocks; ngược lại merge
        // single-pronunciation edit vào romanization_json hiện có.
        let romanizationJson = null;
        if (body?.mandarin || body?.cantonese) {
            romanizationJson = buildRomanizationJsonNew(body);
        } else if (Array.isArray(body?.romanization) && body.romanization.length > 0) {
            const hanS = String(body?.hanSimplified ?? "");
            const hanT = String(body?.hanTraditional ?? "");
            const existingRow = await prisma.vocabulary.findUnique({
                where: { id },
                select: { hanSimplified: true, hanTraditional: true, hanHongKong: true },
            });
            romanizationJson = {
                mandarin: blockFromLegacy(
                    body.romanization,
                    "mandarin",
                    hanS || existingRow?.hanSimplified,
                    hanT || existingRow?.hanTraditional,
                ),
                cantonese: blockFromLegacy(
                    body.romanization,
                    "cantonese",
                    hanS || existingRow?.hanSimplified,
                    body?.hanHongKong ?? existingRow?.hanHongKong ?? hanT ?? existingRow?.hanTraditional,
                ),
            };
        } else {
            // Legacy single-pronunciation edit → merge vào blocks hiện có (format mới).
            const existing = await prisma.vocabulary.findUnique({
                where: { id },
                select: { romanizationJson: true, hanSimplified: true, hanTraditional: true, hanHongKong: true },
            });
            const blocks = blocksFromRow(existing ?? {});
            const entryPy = (body?.pinyin ?? "").toLowerCase().trim();
            const entryJp = (body?.jyutping ?? "").toLowerCase().trim();
            const side = entryPy && !entryJp ? "mandarin" : "cantonese";
            const reading = {
                id: body?.romanizationId ?? romanizationId(entryPy, entryJp),
                romanization: side === "mandarin" ? entryPy : entryJp,
                sino_vietnamese: body?.sinoVietnamese ?? "",
            };
            reading.meanings = (body?.meanings ?? []).map((m, i) => meaningFromLegacy(m, side, i));
            const readings = blocks[side].readings ?? [];
            const idx = readings.findIndex((r) => r.id === reading.id);
            if (idx >= 0) readings[idx] = reading;
            else readings.push(reading);
            romanizationJson = blocks;
        }

        // Update shared Vocabulary dictionary fields
        const vocabDict = vocabularyToRow({ ...body, id }, userId, { includeCreatedAt: false });
        const { id: _id, createdAt, ...dictData } = vocabDict;

        const vocab = await prisma.vocabulary.update({
            where: { id },
            data: {
                hanSimplified: dictData.hanSimplified ?? undefined,
                hanTraditional: dictData.hanTraditional,
                hanHongKong: dictData.hanHongKong ?? undefined,
                hskLevel: dictData.hskLevel ?? undefined,
                pureCantonese: dictData.pureCantonese ?? undefined,
                searchKey: dictData.searchKey ?? undefined,
                romanizationJson: romanizationJson ?? undefined,
                boost: dictData.boost ?? undefined,
                frequency: dictData.frequency ?? undefined,
                movieWordRank: dictData.movieWordRank ?? undefined,
                bookWordRank: dictData.bookWordRank ?? undefined,
            },
        });

        // Recompute + store hanCharacters breakdown, then sync to HanCharacter store
        const breakdown = computeHanCharacters(vocab);
        if (breakdown.length > 0) {
            await prisma.vocabulary.update({
                where: { id: vocab.id },
                data: { hanCharacters: breakdown, updatedAt: new Date() },
            });
            await syncVocabularyHanCharacters(vocab.id, breakdown);
        } else {
            await prisma.vocabulary.update({
                where: { id: vocab.id },
                data: { hanCharacters: null, updatedAt: new Date() },
            });
        }

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
        const base = rowToVocabulary(refreshed);
        return {
            ...base,
            important: refreshed.important ?? false,
            mastered: refreshed.mastered ?? false,
            studyProgress: refreshed.studyProgress ?? 0,
            studyProgressAt: refreshed.studyProgressAt ?? null,
        };
    } catch (e) {
        console.error("updateVocabulary error:", e.message, e.stack);
        throw e;
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

    const base = rowToVocabulary(userVocab);
    return {
        ...base,
        important: userVocab.important ?? false,
        mastered: userVocab.mastered ?? false,
        studyProgress: userVocab.studyProgress ?? 0,
        studyProgressAt: userVocab.studyProgressAt ?? null,
    };
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
async function upsertGrammarExamples(grammarId, examples) {
    // Delete existing examples, then recreate
    await prisma.grammarExample.deleteMany({ where: { grammarId } });

    if (Array.isArray(examples) && examples.length > 0) {
        for (let i = 0; i < examples.length; i++) {
            const ex = examples[i];
            await prisma.grammarExample.create({
                data: {
                    id: ex.id || randomUUID(),
                    grammarId,
                    hanExample: ex.hanExample ?? "",
                    jyutpingExample: ex.jyutpingExample ?? "",
                    pinyinExample: ex.pinyinExample ?? "",
                    vietExample: ex.vietExample ?? "",
                    engExample: ex.engExample ?? "",
                    position: ex.position ?? i,
                },
            });
        }
    }
}

export async function createGrammar(userId, body) {
    const row = grammarToRow(body, userId);
    const { id, createdAt, updatedAt, examples, ...data } = row;
    const created = await prisma.grammar.create({
        data: { id, ...data },
        include: { grammarExamples: { orderBy: { position: "asc" } } },
    });
    await upsertGrammarExamples(id, body.examples);
    const full = await prisma.grammar.findUnique({
        where: { id },
        include: { grammarExamples: { orderBy: { position: "asc" } } },
    });
    return rowToGrammar(full);
}

export async function updateGrammar(userId, id, body) {
    const row = grammarToRow({ ...body, id }, userId, { includeCreatedAt: false });
    const { createdAt, examples, ...data } = row;
    const updated = await prisma.grammar.update({
        where: { id_userId: { id, userId } },
        data,
    });
    await upsertGrammarExamples(id, body.examples);
    const full = await prisma.grammar.findUnique({
        where: { id },
        include: { grammarExamples: { orderBy: { position: "asc" } } },
    });
    return rowToGrammar(full);
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

// Han character CRUD
export async function createHanChar(userId, body) {
    const { randomUUID } = await import("crypto");
    const row = hanCharacterToRow(body, userId);
    const { id, createdAt, updatedAt, userId: _uid, important, mastered, ...rest } = row;
    const data = {
        id: id || randomUUID(),
        hanSimplified: rest.hanSimplified || null,
        hanTraditional: rest.hanTraditional || rest.hanSimplified || "",
        sinoVietnamese: rest.sinoVietnamese || [],
        jyutping: rest.jyutping || [],
        pinyin: rest.pinyin || [],
        hskLevel: rest.hskLevel || null,
        searchKey: rest.searchKey || null,
        strokeCount: await computeStrokeCount(rest.hanTraditional || rest.hanSimplified || ""),
    };
    const created = await prisma.hanCharacter.create({ data });
    return rowToHanCharacter(created);
}

export async function updateHanChar(userId, id, body) {
    const row = hanCharacterToRow({ ...body, id }, userId, { includeCreatedAt: false });
    const { createdAt, userId: _uid, important, mastered, ...rest } = row;
    const data = {};
    // undefined = không đổi; rỗng "" = clear về NULL (single-form)
    if (rest.hanSimplified !== undefined) data.hanSimplified = rest.hanSimplified || null;
    if (rest.hanTraditional !== undefined) {
        data.hanTraditional = rest.hanTraditional;
        data.strokeCount = await computeStrokeCount(rest.hanTraditional);
    }
    if (rest.sinoVietnamese !== undefined) data.sinoVietnamese = rest.sinoVietnamese;
    if (rest.jyutping !== undefined) data.jyutping = rest.jyutping;
    if (rest.pinyin !== undefined) data.pinyin = rest.pinyin;
    if (rest.hskLevel !== undefined) data.hskLevel = rest.hskLevel;
    if (rest.searchKey !== undefined) data.searchKey = rest.searchKey;
    data.updatedAt = new Date();
    const updated = await prisma.hanCharacter.update({
        where: { id },
        data,
    });
    return rowToHanCharacter(updated);
}

export async function patchHanCharFlags(userId, id, flags) {
    const data = { updatedAt: new Date() };
    if ("important" in flags) data.important = flags.important;
    if ("mastered" in flags) data.mastered = flags.mastered;
    const updated = await prisma.hanCharacter.update({
        where: { id },
        data,
    });
    return rowToHanCharacter(updated);
}

export async function deleteHanChar(userId, id) {
    await prisma.hanCharacter.delete({ where: { id } });
}

// ── Flashcard Deck CRUD ──

function rowToFlashcardDeck(row) {
    return {
        id: row.id,
        name: row.name ?? "",
        description: row.description ?? "",
        color: row.color ?? "",
        vocabularyCount: row._count?.vocabularies ?? row.vocabularies?.length ?? 0,
        vocabularies: row.vocabularies
            ? row.vocabularies.map((dv) => {
                  const s = dv.vocabulary ? vocabListSummary(dv.vocabulary) : {};
                  return { id: dv.vocabulary?.id ?? dv.vocabularyId, position: dv.position, ...s };
              })
            : undefined,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

export async function getFlashcardDecks(userId) {
    const decks = await prisma.flashcardDeck.findMany({
        where: { userId },
        include: { _count: { select: { vocabularies: true } } },
        orderBy: { createdAt: "desc" },
    });
    return decks.map(rowToFlashcardDeck);
}

export async function getFlashcardDeck(userId, id) {
    const deck = await prisma.flashcardDeck.findUnique({
        where: { id_userId: { id, userId } },
        include: {
            vocabularies: {
                orderBy: { position: "asc" },
                include: { vocabulary: true },
            },
        },
    });
    if (!deck) return null;
    return rowToFlashcardDeck(deck);
}

export async function createFlashcardDeck(userId, body) {
    const id = body.id ?? randomUUID();
    const created = await prisma.flashcardDeck.create({
        data: {
            id,
            userId,
            name: body.name ?? "",
            description: body.description ?? "",
            color: body.color ?? "",
        },
        include: { _count: { select: { vocabularies: true } } },
    });
    return rowToFlashcardDeck(created);
}

export async function updateFlashcardDeck(userId, id, body) {
    const updated = await prisma.flashcardDeck.update({
        where: { id_userId: { id, userId } },
        data: {
            ...(body.name !== undefined && { name: body.name }),
            ...(body.description !== undefined && { description: body.description }),
            ...(body.color !== undefined && { color: body.color }),
            updatedAt: new Date(),
        },
        include: { _count: { select: { vocabularies: true } } },
    });
    return rowToFlashcardDeck(updated);
}

export async function deleteFlashcardDeck(userId, id) {
    await prisma.flashcardDeck.delete({ where: { id_userId: { id, userId } } });
}

export async function addVocabularyToDeck(userId, deckId, vocabularyId) {
    // Verify deck belongs to user
    const deck = await prisma.flashcardDeck.findUnique({
        where: { id_userId: { id: deckId, userId } },
    });
    if (!deck) throw Object.assign(new Error("Deck not found"), { statusCode: 404 });

    // Get next position
    const lastItem = await prisma.flashcardDeckVocabulary.findFirst({
        where: { deckId },
        orderBy: { position: "desc" },
    });
    const nextPosition = (lastItem?.position ?? -1) + 1;

    try {
        const created = await prisma.flashcardDeckVocabulary.create({
            data: {
                deckId,
                vocabularyId,
                position: nextPosition,
            },
            include: { vocabulary: true },
        });
        return { ...vocabListSummary(created.vocabulary), position: created.position };
    } catch (err) {
        // Unique constraint violation → already in deck
        if (err?.code === "P2002") {
            throw Object.assign(new Error("Vocabulary already in deck"), { statusCode: 409 });
        }
        throw err;
    }
}

export async function removeVocabularyFromDeck(userId, deckId, vocabularyId) {
    // Verify deck belongs to user
    const deck = await prisma.flashcardDeck.findUnique({
        where: { id_userId: { id: deckId, userId } },
    });
    if (!deck) throw Object.assign(new Error("Deck not found"), { statusCode: 404 });

    await prisma.flashcardDeckVocabulary.delete({
        where: { deckId_vocabularyId: { deckId, vocabularyId } },
    });
}

export async function getDeckVocabularies(userId, deckId) {
    const deck = await prisma.flashcardDeck.findUnique({
        where: { id_userId: { id: deckId, userId } },
    });
    if (!deck) throw Object.assign(new Error("Deck not found"), { statusCode: 404 });

    const items = await prisma.flashcardDeckVocabulary.findMany({
        where: { deckId },
        orderBy: { position: "asc" },
        include: { vocabulary: true },
    });

    return items.map((dv) => ({ ...vocabListSummary(dv.vocabulary), position: dv.position }));
}

// ── Vocabulary sets (custom user groups) ──

export async function getVocabularySets(userId) {
    const sets = await prisma.vocabularySet.findMany({
        where: { userId },
        include: { vocabularies: { select: { vocabularyId: true } } },
        orderBy: { createdAt: "desc" },
    });
    return sets.map((s) => ({
        id: s.id,
        name: s.name ?? "",
        description: s.description ?? "",
        color: s.color ?? "",
        count: s.vocabularies.length,
        vocabularyIds: s.vocabularies.map((v) => v.vocabularyId),
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
    }));
}

export async function createVocabularySet(userId, body) {
    const id = body.id ?? randomUUID();
    const created = await prisma.vocabularySet.create({
        data: {
            id,
            userId,
            name: body.name ?? "",
            description: body.description ?? "",
            color: body.color ?? "",
        },
        include: { vocabularies: { select: { vocabularyId: true } } },
    });
    return {
        id: created.id,
        name: created.name ?? "",
        description: created.description ?? "",
        color: created.color ?? "",
        count: created.vocabularies.length,
        vocabularyIds: created.vocabularies.map((v) => v.vocabularyId),
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
    };
}

export async function updateVocabularySet(userId, id, body) {
    const updated = await prisma.vocabularySet.update({
        where: { id_userId: { id, userId } },
        data: {
            ...(body.name !== undefined && { name: body.name }),
            ...(body.description !== undefined && { description: body.description }),
            ...(body.color !== undefined && { color: body.color }),
            updatedAt: new Date(),
        },
        include: { vocabularies: { select: { vocabularyId: true } } },
    });
    return {
        id: updated.id,
        name: updated.name ?? "",
        description: updated.description ?? "",
        color: updated.color ?? "",
        count: updated.vocabularies.length,
        vocabularyIds: updated.vocabularies.map((v) => v.vocabularyId),
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
    };
}

export async function deleteVocabularySet(userId, id) {
    await prisma.vocabularySet.delete({ where: { id_userId: { id, userId } } });
}

export async function addVocabularyToSet(userId, setId, vocabularyId) {
    const set = await prisma.vocabularySet.findUnique({
        where: { id_userId: { id: setId, userId } },
    });
    if (!set) throw Object.assign(new Error("Set not found"), { statusCode: 404 });

    const lastItem = await prisma.vocabularySetVocabulary.findFirst({
        where: { setId },
        orderBy: { position: "desc" },
    });
    const nextPosition = (lastItem?.position ?? -1) + 1;

    try {
        await prisma.vocabularySetVocabulary.create({
            data: { setId, vocabularyId, position: nextPosition },
        });
        return { ok: true };
    } catch (err) {
        if (err?.code === "P2002") {
            throw Object.assign(new Error("Vocabulary already in set"), { statusCode: 409 });
        }
        throw err;
    }
}

export async function removeVocabularyFromSet(userId, setId, vocabularyId) {
    const set = await prisma.vocabularySet.findUnique({
        where: { id_userId: { id: setId, userId } },
    });
    if (!set) throw Object.assign(new Error("Set not found"), { statusCode: 404 });

    await prisma.vocabularySetVocabulary.delete({
        where: { setId_vocabularyId: { setId, vocabularyId } },
    });
}

// ── Resolve user ──

export async function resolveReadUserId(session) {
    if (session?.userId) return session.userId;
    return null;
}
