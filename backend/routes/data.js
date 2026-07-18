import { Router } from "express";
import { logError, logWarn } from "../lib/actionLog.js";
import {
    fetchAllData,
    fetchAppData,
    fetchAllRows,
    fetchSentencePatternRows,
    grammarToRow,
    hanCharacterToRow,
    lessonToRow,
    replacePartialData,
    rowToGrammar,
    rowToHanCharacter,
    rowToLesson,
    rowToSentencePattern,
    rowToWord,
    sentencePatternToRow,
    wordToRow,
} from "../lib/dataService.js";
import { backfillHanVariants } from "../lib/hanVariantBackfill.js";
import { backfillPinyin } from "../lib/pinyinBackfill.js";
import { backfillHanCharPinyin } from "../lib/hanCharPinyinBackfill.js";
import { backfillHanCharJyutping } from "../lib/hanCharJyutpingBackfill.js";
import { backfillHanCharVariants } from "../lib/hanCharVariantBackfill.js";
import { backfillHanCharHanViet } from "../lib/hanCharHanVietBackfill.js";
import { backfillWordHanRelations, getHanCharsForWord, getWordsForHanChar } from "../lib/wordHanRelation.js";
import { resolveReadUserId } from "../lib/publicData.js";
import { fetchWordsByIds, queryWords } from "../lib/wordQuery.js";
import { requireAdmin } from "../lib/supabaseAdmin.js";
import { filterSentencePatternsForWord } from "../lib/sentencePatternMatch.js";
import { mergeWordFieldsPreferFilled } from "../lib/wordNormalize.js";
import { normalizePopularity } from "../lib/wordPopularity.js";
import { getUserId, requireAuth } from "../middleware/auth.js";
import { requireAppAdmin } from "../middleware/appAdmin.js";
import { isLatinSearchQuery, searchCedictByEnglish } from "../lib/cedictSearch.js";
import { normalizeSearchText, searchQueryVariants } from "../lib/searchNormalize.js";

export const dataRouter = Router();

// Full snapshot Ã¢â‚¬â€ public read (anonymous sees admin catalog)
dataRouter.get("/data", async (req, res, next) => {
    try {
        const db = requireAdmin();
        const userId = await resolveReadUserId(req, db);
        const data = await fetchAppData(db, userId);
        res.json(data);
    } catch (err) {
        next(err);
    }
});

// Paginated word bank browse
dataRouter.get("/words/browse", async (req, res, next) => {
    try {
        const db = requireAdmin();
        const userId = await resolveReadUserId(req, db);
        const result = await queryWords(db, userId, {
            page: req.query.page,
            pageSize: req.query.pageSize,
            sortKey: req.query.sortKey,
            sortDir: req.query.sortDir,
            filter: req.query.filter,
            search: req.query.q ?? req.query.search,
            importantFirst: req.query.importantFirst === "true" || req.query.importantFirst === "1",
            studyDue: req.query.studyDue === "true" || req.query.studyDue === "1",
            maxProgress: req.query.maxProgress,
        });
        res.json({
            ...result,
            items: result.items.map(rowToWord),
        });
    } catch (err) {
        next(err);
    }
});

// CC-CEDICT English lookup (also mounted at /api/cedict/search)
dataRouter.get("/cedict/search", async (req, res, next) => {
    try {
        const q = String(req.query.q ?? "").trim();
        if (!q) {
            res.json({ items: [] });
            return;
        }
        if (!isLatinSearchQuery(q)) {
            res.json({ items: [] });
            return;
        }
        const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 30));
        const items = await searchCedictByEnglish(q, { limit });
        res.json({ items, query: q });
    } catch (err) {
        next(err);
    }
});
// Fetch words by id (e.g. lesson detail)
dataRouter.get("/words/by-ids", async (req, res, next) => {
    try {
        const ids = String(req.query.ids ?? "")
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean);
        const db = requireAdmin();
        const userId = await resolveReadUserId(req, db);
        const rows = await fetchWordsByIds(db, userId, ids);
        res.json(rows.map(rowToWord));
    } catch (err) {
        next(err);
    }
});

// Replace selected cloud data (upload) Ã¢â‚¬â€ admin only
dataRouter.put("/data", requireAuth, requireAppAdmin, async (req, res, next) => {
    try {
        const {
            types = ["words", "grammar", "lessons"],
            words = [],
            grammarBank = [],
            lessons = [],
            sentencePatterns = [],
        } = req.body ?? {};
        const db = requireAdmin();
        if (!Array.isArray(types) || types.length === 0) {
            return res.status(400).json({ error: "Select at least one data type" });
        }
        const counts = await replacePartialData(db, getUserId(req), {
            types,
            words,
            grammarBank,
            lessons,
            sentencePatterns,
        });
        res.json({ ok: true, ...counts });
    } catch (err) {
        next(err);
    }
});

// Backfill han_traditional (HK) + han_traditional for all words via OpenCC Ã¢â‚¬â€ admin only
dataRouter.post("/data/backfill-han-variants", requireAuth, requireAppAdmin, async (req, res, next) => {
    try {
        const db = requireAdmin();
        const result = await backfillHanVariants(db, getUserId(req));
        res.json({ ok: true, ...result });
    } catch (err) {
        next(err);
    }
});

// Backfill pinyin from OpenCC simplified + pinyin-pro Ã¢â‚¬â€ admin only
dataRouter.post("/data/backfill-pinyin", requireAuth, requireAppAdmin, async (req, res, next) => {
    try {
        const db = requireAdmin();
        const result = await backfillPinyin(db, getUserId(req));
        res.json({ ok: true, ...result });
    } catch (err) {
        next(err);
    }
});

// Backfill pinyin for han_characters via OpenCC simplified + pinyin-pro Ã¢â‚¬â€ admin only
dataRouter.post("/data/backfill-han-char-pinyin", requireAuth, requireAppAdmin, async (req, res, next) => {
    try {
        const db = requireAdmin();
        const result = await backfillHanCharPinyin(db, getUserId(req));
        res.json({ ok: true, ...result });
    } catch (err) {
        next(err);
    }
});

// Backfill Jyutping for han_characters from CC-Canto data Ã¢â‚¬â€ admin only
dataRouter.post("/data/backfill-han-char-jyutping", requireAuth, requireAppAdmin, async (req, res, next) => {
    try {
        const db = requireAdmin();
        const result = await backfillHanCharJyutping(db, getUserId(req));
        res.json({ ok: true, ...result });
    } catch (err) {
        next(err);
    }
});

// Backfill han_traditional for han_characters via OpenCC Ã¢â‚¬â€ admin only
dataRouter.post("/data/backfill-han-char-variants", requireAuth, requireAppAdmin, async (req, res, next) => {
    try {
        const db = requireAdmin();
        const result = await backfillHanCharVariants(db, getUserId(req));
        res.json({ ok: true, ...result });
    } catch (err) {
        next(err);
    }
});

dataRouter.post("/data/backfill-han-char-hanviet", requireAuth, requireAppAdmin, async (req, res, next) => {
    try {
        const db = requireAdmin();
        const result = await backfillHanCharHanViet(db, getUserId(req));
        res.json({ ok: true, ...result });
    } catch (err) {
        next(err);
    }
});

// --- Words CRUD ---
dataRouter.get("/words", async (req, res, next) => {
    try {
        const db = requireAdmin();
        const userId = await resolveReadUserId(req, db);
        if (req.query.page || req.query.pageSize) {
            const result = await queryWords(db, userId, {
                page: req.query.page,
                pageSize: req.query.pageSize,
                sortKey: req.query.sortKey,
                sortDir: req.query.sortDir,
                filter: req.query.filter,
                search: req.query.q ?? req.query.search,
                importantFirst: req.query.importantFirst === "true",
            });
            return res.json({
                ...result,
                items: result.items.map(rowToWord),
            });
        }
        const data = await fetchAllData(db, userId);
        res.json(data.words);
    } catch (err) {
        next(err);
    }
});

dataRouter.post("/words", requireAuth, requireAppAdmin, async (req, res, next) => {
    try {
        const db = requireAdmin();
        const row = wordToRow(req.body, getUserId(req));
        const { data, error } = await db.from("words").insert(row).select().single();
        if (error) throw error;
        res.status(201).json(rowToWord(data));
    } catch (err) {
        next(err);
    }
});

dataRouter.put("/words/:id", requireAuth, async (req, res, next) => {
    try {
        const db = requireAdmin();
        const userId = getUserId(req);
        const { data: existingRow, error: loadError } = await db
            .from("words")
            .select("*")
            .eq("id", req.params.id)
            .eq("user_id", userId)
            .maybeSingle();
        if (loadError) throw loadError;
        if (!existingRow) return res.status(404).json({ error: "Word not found" });

        const merged = mergeWordFieldsPreferFilled(rowToWord(existingRow), {
            ...req.body,
            id: req.params.id,
        });
        const row = wordToRow(merged, userId, { includeCreatedAt: false });
        delete row.created_at;

        const { data, error } = await db
            .from("words")
            .update(row)
            .eq("id", req.params.id)
            .eq("user_id", userId)
            .select()
            .single();
        if (error) throw error;
        res.json(rowToWord(data));
    } catch (err) {
        next(err);
    }
});

dataRouter.patch("/words/:id/flags", requireAuth, async (req, res, next) => {
    try {
        const db = requireAdmin();
        const userId = getUserId(req);
        const body = req.body ?? {};
        const { important, mastered, popularity, studyProgress } = body;
        const updates = { updated_at: new Date().toISOString() };
        if (typeof important === "boolean") updates.important = important;
        if (typeof mastered === "boolean") updates.mastered = mastered;
        if ("studyProgress" in body) {
            const parsed = Number(studyProgress);
            if (!Number.isFinite(parsed)) {
                return res.status(400).json({ error: "studyProgress must be a number between 0 and 100" });
            }
            updates.study_progress = Math.max(0, Math.min(100, Math.round(parsed)));
            updates.study_progress_at = new Date().toISOString();
        }
        if ("popularity" in body) {
            if (popularity === null || popularity === undefined || popularity === "") {
                updates.popularity = null;
            } else {
                const parsed = normalizePopularity(popularity);
                if (parsed === null) {
                    logWarn("Invalid popularity", popularity);
                    return res.status(400).json({ error: "popularity must be 0Ã¢â‚¬â€œ3 or null" });
                }
                updates.popularity = parsed;
            }
        }
        if (Object.keys(updates).length === 1) {
            logWarn("Update word flags: no fields");
            return res
                .status(400)
                .json({ error: "At least one of important, mastered, popularity, or studyProgress is required" });
        }

        const { data: existingRow } = await db
            .from("words")
            .select("han_traditional")
            .eq("id", req.params.id)
            .eq("user_id", userId)
            .maybeSingle();

        const { data, error } = await db
            .from("words")
            .update(updates)
            .eq("id", req.params.id)
            .eq("user_id", userId)
            .select()
            .single();
        if (error) {
            logError("Update word flags failed", error.message);
            throw error;
        }
        if (!data) return res.status(404).json({ error: "Word not found" });
        res.json(rowToWord(data));
    } catch (err) {
        next(err);
    }
});

dataRouter.delete("/words/:id", requireAuth, requireAppAdmin, async (req, res, next) => {
    try {
        const db = requireAdmin();
        const userId = getUserId(req);
        const { data: existingRow } = await db
            .from("words")
            .select("id, han_traditional")
            .eq("id", req.params.id)
            .eq("user_id", userId)
            .maybeSingle();

        const { data, error } = await db
            .from("words")
            .delete()
            .eq("id", req.params.id)
            .eq("user_id", userId)
            .select("id");
        if (error) throw error;
        if (!data?.length) return res.status(404).json({ error: "Word not found" });
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});

// --- Grammar CRUD ---
dataRouter.get("/grammar", async (req, res, next) => {
    try {
        const db = requireAdmin();
        const userId = await resolveReadUserId(req, db);
        const data = await fetchAllData(db, userId);
        res.json(data.grammarBank);
    } catch (err) {
        next(err);
    }
});

dataRouter.post("/grammar", requireAuth, requireAppAdmin, async (req, res, next) => {
    try {
        const db = requireAdmin();
        const row = grammarToRow(req.body, getUserId(req));
        const { data, error } = await db.from("grammar_bank").insert(row).select().single();
        if (error) throw error;
        res.status(201).json(rowToGrammar(data));
    } catch (err) {
        next(err);
    }
});

dataRouter.put("/grammar/:id", requireAuth, async (req, res, next) => {
    try {
        const db = requireAdmin();
        const userId = getUserId(req);
        const { data: existingRow } = await db
            .from("grammar_bank")
            .select("title")
            .eq("id", req.params.id)
            .eq("user_id", userId)
            .maybeSingle();
        const row = grammarToRow({ ...req.body, id: req.params.id }, userId, { includeCreatedAt: false });
        const { data, error } = await db
            .from("grammar_bank")
            .update(row)
            .eq("id", req.params.id)
            .eq("user_id", userId)
            .select()
            .single();
        if (error) throw error;
        res.json(rowToGrammar(data));
    } catch (err) {
        next(err);
    }
});

dataRouter.delete("/grammar/:id", requireAuth, requireAppAdmin, async (req, res, next) => {
    try {
        const db = requireAdmin();
        const userId = getUserId(req);
        const { data: existingRow } = await db
            .from("grammar_bank")
            .select("id, title")
            .eq("id", req.params.id)
            .eq("user_id", userId)
            .maybeSingle();

        const { data, error } = await db
            .from("grammar_bank")
            .delete()
            .eq("id", req.params.id)
            .eq("user_id", userId)
            .select("id");
        if (error) throw error;
        if (!data?.length) return res.status(404).json({ error: "Grammar not found" });
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});

// --- Sentence patterns CRUD ---
dataRouter.get("/sentence-patterns", async (req, res, next) => {
    try {
        const db = requireAdmin();
        const userId = await resolveReadUserId(req, db);
        const data = await fetchAllData(db, userId);
        res.json(data.sentencePatterns);
    } catch (err) {
        next(err);
    }
});

dataRouter.get("/sentence-patterns/by-word/:wordId", async (req, res, next) => {
    try {
        const db = requireAdmin();
        const userId = await resolveReadUserId(req, db);
        const wordId = req.params.wordId;
        const [wordRows, sentenceRows] = await Promise.all([
            fetchWordsByIds(db, userId, [wordId]),
            fetchSentencePatternRows(db, userId),
        ]);
        const word = wordRows[0] ? rowToWord(wordRows[0]) : null;
        if (!word) return res.json([]);
        const patterns = sentenceRows.map(rowToSentencePattern);
        res.json(filterSentencePatternsForWord(patterns, word));
    } catch (err) {
        next(err);
    }
});

dataRouter.post("/sentence-patterns", requireAuth, requireAppAdmin, async (req, res, next) => {
    try {
        const db = requireAdmin();
        const userId = getUserId(req);
        const row = sentencePatternToRow(req.body, userId);
        const { data, error } = await db.from("sentence_patterns").insert(row).select().single();
        if (error) {
            if (error.code === "PGRST205") {
                return res.status(503).json({
                    error: "BÃ¡ÂºÂ£ng mÃ¡ÂºÂ«u cÃƒÂ¢u chÃ†Â°a Ã„â€˜Ã†Â°Ã¡Â»Â£c tÃ¡ÂºÂ¡o. ChÃ¡ÂºÂ¡y migration sentence_patterns trÃƒÂªn Supabase.",
                });
            }
            throw error;
        }
        res.status(201).json(rowToSentencePattern(data));
    } catch (err) {
        next(err);
    }
});

dataRouter.put("/sentence-patterns/:id", requireAuth, async (req, res, next) => {
    try {
        const db = requireAdmin();
        const userId = getUserId(req);
        const { data: existingRow } = await db
            .from("sentence_patterns")
            .select("han_traditional")
            .eq("id", req.params.id)
            .eq("user_id", userId)
            .maybeSingle();
        const row = sentencePatternToRow({ ...req.body, id: req.params.id }, userId, { includeCreatedAt: false });
        const { data, error } = await db
            .from("sentence_patterns")
            .update(row)
            .eq("id", req.params.id)
            .eq("user_id", userId)
            .select()
            .single();
        if (error) throw error;
        res.json(rowToSentencePattern(data));
    } catch (err) {
        next(err);
    }
});

dataRouter.delete("/sentence-patterns/:id", requireAuth, requireAppAdmin, async (req, res, next) => {
    try {
        const db = requireAdmin();
        const userId = getUserId(req);
        const { data: existingRow } = await db
            .from("sentence_patterns")
            .select("id, han_traditional")
            .eq("id", req.params.id)
            .eq("user_id", userId)
            .maybeSingle();

        const { data, error } = await db
            .from("sentence_patterns")
            .delete()
            .eq("id", req.params.id)
            .eq("user_id", userId)
            .select("id");
        if (error) throw error;
        if (!data?.length) return res.status(404).json({ error: "Sentence pattern not found" });
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});

// --- Lessons CRUD ---
dataRouter.get("/lessons", async (req, res, next) => {
    try {
        const db = requireAdmin();
        const userId = await resolveReadUserId(req, db);
        const data = await fetchAllData(db, userId);
        res.json(data.lessons);
    } catch (err) {
        next(err);
    }
});

dataRouter.post("/lessons", requireAuth, requireAppAdmin, async (req, res, next) => {
    try {
        const db = requireAdmin();
        const row = lessonToRow(req.body, getUserId(req));
        const { data, error } = await db.from("lessons").insert(row).select().single();
        if (error) throw error;
        res.status(201).json(rowToLesson(data));
    } catch (err) {
        next(err);
    }
});

dataRouter.put("/lessons/:id", requireAuth, async (req, res, next) => {
    try {
        const db = requireAdmin();
        const userId = getUserId(req);
        const { data: existingRow } = await db
            .from("lessons")
            .select("name")
            .eq("id", req.params.id)
            .eq("user_id", userId)
            .maybeSingle();
        const row = lessonToRow({ ...req.body, id: req.params.id }, userId);
        const { data, error } = await db
            .from("lessons")
            .update(row)
            .eq("id", req.params.id)
            .eq("user_id", userId)
            .select()
            .single();
        if (error) throw error;
        res.json(rowToLesson(data));
    } catch (err) {
        next(err);
    }
});

dataRouter.delete("/lessons/:id", requireAuth, requireAppAdmin, async (req, res, next) => {
    try {
        const db = requireAdmin();
        const userId = getUserId(req);
        const { data: existingRow } = await db
            .from("lessons")
            .select("id, name")
            .eq("id", req.params.id)
            .eq("user_id", userId)
            .maybeSingle();

        const { data, error } = await db
            .from("lessons")
            .delete()
            .eq("id", req.params.id)
            .eq("user_id", userId)
            .select("id");
        if (error) throw error;
        if (!data?.length) return res.status(404).json({ error: "Lesson not found" });
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});

// --- Han Characters CRUD ---

/**
 * Build and execute a han_characters query with filters, sort, and optional range.
 * Returns { data, count } or throws.
 */
async function queryHanCharacters(db, userId, { search, filter, sortKey, sortDir, from, limit }) {
    const filters = [];
    if (filter === "important") filters.push((q) => q.eq("important", true));
    else if (filter === "mastered") filters.push((q) => q.eq("mastered", true));

    if (search) {
        // Expand search into normalized variants (same approach as wordQuery.js)
        const variants = searchQueryVariants(search);
        if (variants.length === 1) {
            const pattern = `%${variants[0].replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
            filters.push((q) => q.ilike("search_key", pattern));
        } else if (variants.length > 1) {
            const orFilter = variants
                .map((variant) => {
                    const pattern = variant.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
                    return `search_key.ilike."%${pattern}%"`;
                })
                .join(",");
            filters.push((q) => q.or(orFilter));
        }
    }

    const asc = sortDir === "asc";
    if (sortKey === "hanSimplified") {
        filters.push((q) => q.order("han_simplified", { ascending: asc }).order("id", { ascending: true }));
    } else if (sortKey === "popularity") {
        // Sort by popularity descending (most common first) then han_simplified
        filters.push((q) =>
            q
                .order("popularity", { ascending: false, nullsFirst: false })
                .order("han_simplified", { ascending: true })
                .order("id", { ascending: true }),
        );
    } else {
        filters.push((q) => q.order("created_at", { ascending: asc }).order("id", { ascending: true }));
    }

    const tryQuery = async (skipFilter, rangeFrom, rangeTo) => {
        let q = db.from("han_characters").select("*", { count: "exact" }).eq("user_id", userId);
        for (const fn of filters) {
            if (skipFilter && fn === filters[0] && (filter === "important" || filter === "mastered")) continue;
            q = fn(q);
        }
        if (rangeFrom != null && rangeTo != null) {
            q = q.range(rangeFrom, rangeTo);
        }
        return q;
    };

    const hasLimit = from != null && limit != null;
    const rangeTo = hasLimit ? from + limit - 1 : null;

    const result = await tryQuery(false, from, rangeTo);
    if (result.error) {
        const msg = String(result.error?.message ?? "");
        if (
            msg.includes("column") &&
            msg.includes("does not exist") &&
            (filter === "important" || filter === "mastered")
        ) {
            const retry = await tryQuery(true, from, rangeTo);
            if (retry.error) throw retry.error;
            return { data: retry.data, count: retry.count };
        }
        // Range not satisfiable: requested offset beyond available rows
        if (msg.includes("range") && msg.includes("not satisfiable")) {
            return { data: [], count: 0 };
        }
        throw result.error;
    }
    return { data: result.data, count: result.count };
}

dataRouter.get("/han-characters/browse", async (req, res, next) => {
    try {
        const db = requireAdmin();
        const userId = await resolveReadUserId(req, db);
        const safePageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 30));
        const search = String(req.query.search ?? "").trim();
        const filter = String(req.query.filter ?? "all");
        const sortKey = String(req.query.sortKey ?? "createdAt");
        const sortDir = String(req.query.sortDir ?? "desc");

        // --- Chunked response: ?pages=1,2,3,4,5 ---
        const pagesParam = String(req.query.pages ?? "").trim();
        if (pagesParam) {
            const pageNumbers = pagesParam
                .split(",")
                .map((s) => Number(s.trim()))
                .filter((n) => Number.isFinite(n) && n >= 1);

            // Fetch count only once (no range)
            const { count } = await queryHanCharacters(db, userId, {
                search,
                filter,
                sortKey,
                sortDir,
                from: null,
                limit: null,
            });
            const total = count ?? 0;
            const totalPages = Math.max(1, Math.ceil(total / safePageSize) || 1);

            // Count characters with traditional variant
            const { count: tradCount } = await db
                .from("han_characters")
                .select("*", { count: "exact", head: true })
                .eq("user_id", userId)
                .not("han_traditional", "is", null);
            const hanTraditionalCount = tradCount ?? 0;

            // Fetch each requested page in parallel; skip pages beyond total
            const pageResults = await Promise.all(
                pageNumbers.map(async (p) => {
                    const from = (p - 1) * safePageSize;
                    if (from >= total) {
                        return { page: p, items: [], startIndex: from };
                    }
                    const { data } = await queryHanCharacters(db, userId, {
                        search,
                        filter,
                        sortKey,
                        sortDir,
                        from,
                        limit: safePageSize,
                    });
                    return {
                        page: p,
                        items: (data ?? []).map(rowToHanCharacter),
                        startIndex: from,
                    };
                }),
            );

            const pages = Object.fromEntries(pageResults.map((r) => [String(r.page), r]));
            return res.json({ total, totalPages, pageSize: safePageSize, pages, hanTraditionalCount });
        }

        // --- Single page (backward compatible) ---
        const safePage = Math.max(1, Number(req.query.page) || 1);
        const from = (safePage - 1) * safePageSize;

        const { data, count } = await queryHanCharacters(db, userId, {
            search,
            filter,
            sortKey,
            sortDir,
            from,
            limit: safePageSize,
        });
        const total = count ?? 0;
        const totalPages = Math.max(1, Math.ceil(total / safePageSize) || 1);

        const { count: tradCount } = await db
            .from("han_characters")
            .select("*", { count: "exact", head: true })
            .eq("user_id", userId)
            .not("han_traditional", "is", null);
        const hanTraditionalCount = tradCount ?? 0;

        res.json({
            items: (data ?? []).map(rowToHanCharacter),
            page: safePage,
            pageSize: safePageSize,
            total,
            totalPages,
            hanTraditionalCount,
            startIndex: from,
        });
    } catch (err) {
        next(err);
    }
});

dataRouter.get("/han-characters", async (req, res, next) => {
    try {
        const db = requireAdmin();
        const userId = await resolveReadUserId(req, db);
        const rows = await fetchAllRows(db, "han_characters", userId);
        res.json(rows.map(rowToHanCharacter));
    } catch (err) {
        next(err);
    }
});

dataRouter.post("/han-characters", requireAuth, requireAppAdmin, async (req, res, next) => {
    try {
        const db = requireAdmin();
        const userId = getUserId(req);
        const ch = (req.body.hanSimplified ?? req.body.character ?? "").trim();
        if (!ch) return res.status(400).json({ error: "hanSimplified is required" });

        // Check for existing character (same user + same han_simplified)
        const { data: existing } = await db
            .from("han_characters")
            .select("id")
            .eq("user_id", userId)
            .eq("han_simplified", ch)
            .maybeSingle();

        if (existing) {
            // Return existing character instead of creating duplicate
            const { data: full } = await db.from("han_characters").select("*").eq("id", existing.id).single();
            return res.json(rowToHanCharacter(full));
        }

        const row = hanCharacterToRow(req.body, userId);
        const { data, error } = await db.from("han_characters").insert(row).select().single();
        if (error) throw error;
        res.status(201).json(rowToHanCharacter(data));
    } catch (err) {
        next(err);
    }
});

dataRouter.put("/han-characters/:id", requireAuth, async (req, res, next) => {
    try {
        const db = requireAdmin();
        const userId = getUserId(req);
        const { data: existingRow, error: loadError } = await db
            .from("han_characters")
            .select("*")
            .eq("id", req.params.id)
            .eq("user_id", userId)
            .maybeSingle();
        if (loadError) throw loadError;
        if (!existingRow) return res.status(404).json({ error: "Not found" });

        const ch = req.body.hanSimplified ?? req.body.character ?? existingRow.han_simplified;
        const hanVietRaw = req.body.hanViet ?? existingRow.han_viet;
        const hanVietArr = Array.isArray(hanVietRaw)
            ? hanVietRaw.map((r) => String(r ?? "").trim()).filter(Boolean)
            : typeof hanVietRaw === "string" && hanVietRaw.trim()
              ? [hanVietRaw.trim()]
              : Array.isArray(existingRow.han_viet)
                ? existingRow.han_viet
                : existingRow.han_viet
                  ? [existingRow.han_viet]
                  : null;
        const hanVietText = Array.isArray(hanVietArr)
            ? [...new Set(hanVietArr.map((r) => normalizeSearchText(r)).filter(Boolean))].join(" ")
            : "";

        const toArr = (val) => {
            if (Array.isArray(val)) return val.map((r) => String(r ?? "").trim()).filter(Boolean);
            const s = String(val ?? "").trim();
            return s ? [s] : null;
        };
        const pinyinArr = req.body.pinyin !== undefined ? toArr(req.body.pinyin) : toArr(existingRow.pinyin);
        const jyutpingArr = req.body.jyutping !== undefined ? toArr(req.body.jyutping) : toArr(existingRow.jyutping);
        const pinyinText = pinyinArr
            ? [...new Set(pinyinArr.map((r) => normalizeSearchText(r)).filter(Boolean))].join(" ")
            : "";
        const jyutpingText = jyutpingArr
            ? [...new Set(jyutpingArr.map((r) => normalizeSearchText(r)).filter(Boolean))].join(" ")
            : "";

        const row = {
            han_simplified: ch,
            han_viet: hanVietArr && hanVietArr.length > 0 ? hanVietArr : null,
            pinyin: pinyinArr && pinyinArr.length > 0 ? pinyinArr : null,
            han_traditional:
                req.body.hanTraditional !== undefined
                    ? String(req.body.hanTraditional ?? "").trim() || null
                    : (existingRow.han_traditional ?? null),
            search_key: normalizeSearchText(ch + " " + hanVietText + " " + pinyinText + " " + jyutpingText),
            popularity:
                req.body.popularity !== undefined
                    ? normalizePopularity(req.body.popularity)
                    : (existingRow.popularity ?? undefined),
            important: req.body.important ?? existingRow.important ?? false,
            mastered: req.body.mastered ?? existingRow.mastered ?? false,
            updated_at: new Date().toISOString(),
        };

        // Fallback: retry without important/mastered if columns missing
        const doUpdate = async (patch) => {
            const { data, error } = await db
                .from("han_characters")
                .update(patch)
                .eq("id", req.params.id)
                .eq("user_id", userId)
                .select()
                .single();
            return { data, error };
        };

        let result = await doUpdate(row);
        if (result.error) {
            const msg = String(result.error?.message ?? "");
            if (msg.includes("column") && msg.includes("does not exist")) {
                // Retry without important/mastered
                const fallbackRow = {
                    han_simplified: row.han_simplified,
                    han_viet: row.han_viet,
                    updated_at: row.updated_at,
                };
                result = await doUpdate(fallbackRow);
            }
        }
        if (result.error) throw result.error;
        const data = result.data;
        res.json(rowToHanCharacter(data));
    } catch (err) {
        next(err);
    }
});

// Quick flag updates (important, mastered, popularity) Ã¢â‚¬â€ maps to PATCH /words/:id/flags
dataRouter.patch("/han-characters/:id/flags", requireAuth, async (req, res, next) => {
    try {
        const db = requireAdmin();
        const userId = getUserId(req);
        const body = req.body ?? {};
        const { important, mastered, popularity } = body;
        const updates = { updated_at: new Date().toISOString() };
        if (typeof important === "boolean") updates.important = important;
        if (typeof mastered === "boolean") updates.mastered = mastered;
        if ("popularity" in body) {
            if (popularity === null || popularity === undefined || popularity === "") {
                updates.popularity = null;
            } else {
                const parsed = normalizePopularity(popularity);
                if (parsed === null) {
                    logWarn("Invalid han character popularity", popularity);
                    return res.status(400).json({ error: "popularity must be 0Ã¢â‚¬â€œ3 or null" });
                }
                updates.popularity = parsed;
            }
        }
        if (Object.keys(updates).length === 1) {
            return res.status(400).json({ error: "At least one of important, mastered, or popularity is required" });
        }

        const { data, error } = await db
            .from("han_characters")
            .update(updates)
            .eq("id", req.params.id)
            .eq("user_id", userId)
            .select()
            .single();
        if (error) throw error;
        if (!data) return res.status(404).json({ error: "Not found" });
        res.json(rowToHanCharacter(data));
    } catch (err) {
        next(err);
    }
});

dataRouter.delete("/han-characters/:id", requireAuth, requireAppAdmin, async (req, res, next) => {
    try {
        const db = requireAdmin();
        const userId = getUserId(req);
        const { data: existingRow } = await db
            .from("han_characters")
            .select("id, han_simplified")
            .eq("id", req.params.id)
            .eq("user_id", userId)
            .maybeSingle();

        const { data, error } = await db
            .from("han_characters")
            .delete()
            .eq("id", req.params.id)
            .eq("user_id", userId)
            .select("id");
        if (error) throw error;
        if (!data?.length) return res.status(404).json({ error: "Not found" });
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});

// Deduplicate han_characters: keep only one row per (user_id, han_simplified)
dataRouter.post("/han-characters/dedup", requireAuth, requireAppAdmin, async (req, res, next) => {
    try {
        const db = requireAdmin();
        const userId = getUserId(req);
        const { data: all } = await db
            .from("han_characters")
            .select("*")
            .eq("user_id", userId)
            .order("created_at", { ascending: true });

        const seen = new Map();
        const toDelete = [];
        const toKeep = [];
        for (const row of all ?? []) {
            const ch = row.han_simplified;
            if (seen.has(ch)) {
                toDelete.push(row.id);
            } else {
                seen.set(ch, true);
                toKeep.push(row);
            }
        }

        // Delete duplicates in batches
        const BATCH = 200;
        for (let i = 0; i < toDelete.length; i += BATCH) {
            const batch = toDelete.slice(i, i + BATCH);
            await db.from("han_characters").delete().in("id", batch).eq("user_id", userId);
        }

        res.json({ deleted: toDelete.length, kept: toKeep.length, total: all?.length ?? 0 });
    } catch (err) {
        next(err);
    }
});

// --- Word-Han Character Relations ---

// Backfill all word-han relations
dataRouter.post("/data/backfill-word-han-relations", requireAuth, requireAppAdmin, async (req, res, next) => {
    try {
        const db = requireAdmin();
        const result = await backfillWordHanRelations(db, getUserId(req));
        res.json({ ok: true, ...result });
    } catch (err) {
        next(err);
    }
});

// Get han characters for a word
dataRouter.get("/words/:id/han-characters", async (req, res, next) => {
    try {
        const db = requireAdmin();
        const userId = await resolveReadUserId(req, db);
        const data = await getHanCharsForWord(db, userId, req.params.id);
        res.json(data);
    } catch (err) {
        next(err);
    }
});

// Get words for a han character
dataRouter.get("/han-characters/:id/words", async (req, res, next) => {
    try {
        const db = requireAdmin();
        const userId = await resolveReadUserId(req, db);
        const data = await getWordsForHanChar(db, userId, req.params.id);
        res.json(data);
    } catch (err) {
        next(err);
    }
});
