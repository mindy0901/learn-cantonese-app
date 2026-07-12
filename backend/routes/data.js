import { Router } from "express";
import { logError, logOk, logStart, logStep, logWarn, userLabel } from "../lib/actionLog.js";
import {
    fetchAllData,
    fetchAppData,
    fetchAllRows,
    fetchSentencePatternRows,
    grammarToRow,
    lessonToRow,
    replacePartialData,
    rowToGrammar,
    rowToLesson,
    rowToSentencePattern,
    rowToWord,
    sentencePatternToRow,
    wordToRow,
} from "../lib/dataService.js";
import { mergeSheetData } from "../lib/mergeService.js";
import { backfillHanVariants } from "../lib/hanVariantBackfill.js";
import { backfillPinyin } from "../lib/pinyinBackfill.js";
import { previewSheetMerge } from "../lib/sheetMergePreview.js";
import { resolveReadUserId } from "../lib/publicData.js";
import { fetchWordsByIds, queryWords } from "../lib/wordQuery.js";
import { fetchSheetCsvText } from "../lib/sheetFetch.js";
import { requireAdmin } from "../lib/supabaseAdmin.js";
import { filterSentencePatternsForWord } from "../lib/sentencePatternMatch.js";
import { mergeWordFieldsPreferFilled } from "../lib/wordNormalize.js";
import { normalizePopularity } from "../lib/wordPopularity.js";
import { getUserId, requireAuth } from "../middleware/auth.js";
import { requireAppAdmin } from "../middleware/appAdmin.js";
import { isLatinSearchQuery, searchCedictByEnglish } from "../lib/cedictSearch.js";
import {
    getHanVietCognatesStats,
    listHanVietCognates,
    lookupHanVietCognate,
} from "../lib/hanVietCognates.js";

export const dataRouter = Router();

// Full snapshot — public read (anonymous sees admin catalog)
dataRouter.get("/data", async (req, res, next) => {
    try {
        logStep("data", "LOAD APP DATA", userLabel(req));
        const db = requireAdmin();
        const userId = await resolveReadUserId(req, db);
        const initialWordPages = Math.min(10, Math.max(0, Number(req.query.wordPages) || 5));
        const wordPageSize = Math.min(50, Math.max(1, Number(req.query.wordPageSize) || 15));
        const data = await fetchAppData(db, userId, { initialWordPages, wordPageSize });
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

// Han–Việt cognates lookup (also mounted at /api/hanviet/*)
dataRouter.get("/hanviet/lookup", (req, res, next) => {
    try {
        const q = String(req.query.q ?? "").trim();
        if (!q) {
            res.json({ match: null });
            return;
        }
        const match = lookupHanVietCognate(q);
        res.json({ match, query: q });
    } catch (err) {
        next(err);
    }
});

dataRouter.get("/hanviet/cognates", (_req, res, next) => {
    try {
        const items = listHanVietCognates();
        const stats = getHanVietCognatesStats();
        res.json({ items, ...stats });
    } catch (err) {
        next(err);
    }
});

// Fetch words by id (e.g. lesson detail)
dataRouter.get("/words/by-ids", async (req, res, next) => {
    try {
        const db = requireAdmin();
        const userId = await resolveReadUserId(req, db);
        const ids = String(req.query.ids ?? "")
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean);
        const rows = await fetchWordsByIds(db, userId, ids);
        res.json(rows.map(rowToWord));
    } catch (err) {
        next(err);
    }
});

// Server-side sheet merge preview (uses full cloud data)
dataRouter.post("/data/merge-preview", requireAuth, requireAppAdmin, async (req, res, next) => {
    try {
        const { type, items } = req.body ?? {};
        logStep("sheet", "PREVIEW SHEET MERGE", `${type}, ${items?.length ?? 0} rows`);
        if (!type || !Array.isArray(items)) {
            return res.status(400).json({ error: "type and items[] required" });
        }
        const db = requireAdmin();
        const userId = getUserId(req);
        const existing = await fetchAllData(db, userId);
        const preview = previewSheetMerge(type, items, existing);
        res.json({ valid: true, items, ...preview });
    } catch (err) {
        next(err);
    }
});

// Replace selected cloud data (upload) — admin only
dataRouter.put("/data", requireAuth, requireAppAdmin, async (req, res, next) => {
    try {
        const { types = ["words", "grammar", "lessons"], words = [], grammarBank = [], lessons = [], sentencePatterns = [] } = req.body ?? {};
        logStep("data", "REPLACE DATA", `${types.join(", ")} — ${userLabel(req)}`);
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
        logOk("data", "REPLACE DATA", null, JSON.stringify(counts));
        res.json({ ok: true, ...counts });
    } catch (err) {
        next(err);
    }
});

// Fetch public Google Sheet CSV (avoids browser CORS) — admin only
async function handleSheetCsv(req, res, next) {
  try {
    const url = String(req.body?.url ?? req.query.url ?? '').trim()
    logStep("sheet", "LOAD GOOGLE SHEET CSV", url ? url.slice(0, 60) : '(missing url)')
    if (!url) return res.status(400).json({ error: 'Missing url', code: 'NO_SHEET_URL' })
    const csv = await fetchSheetCsvText(url)
    res.type('text/csv; charset=utf-8').send(csv)
  } catch (err) {
    if (err.code) {
      return res.status(err.status ?? 400).json({ error: err.message, code: err.code })
    }
    next(err)
  }
}

dataRouter.get('/sheet/csv', requireAuth, requireAppAdmin, handleSheetCsv)
dataRouter.post('/sheet/csv', requireAuth, requireAppAdmin, handleSheetCsv)

// Merge from sheet — additive only, no deletes — admin only
dataRouter.post("/data/merge", requireAuth, requireAppAdmin, async (req, res, next) => {
    try {
        const { type, items } = req.body ?? {};
        logStep("sheet", "MERGE SHEET", `${type}, ${items?.length ?? 0} rows — ${userLabel(req)}`);
        const db = requireAdmin();
        if (!type || !["words", "grammar", "lessons", "sentencePatterns"].includes(type)) {
            return res.status(400).json({ error: "Invalid merge type" });
        }
        if (!Array.isArray(items)) {
            return res.status(400).json({ error: "items must be an array" });
        }
        const result = await mergeSheetData(db, getUserId(req), { type, items });
        logOk("sheet", "MERGE SHEET", null, `${type}: +${result.added ?? 0} / updated ${result.updated ?? 0}`);
        res.json({ ok: true, ...result });
    } catch (err) {
        next(err);
    }
});

// Backfill han_traditional (HK) + han_simplified for all words via OpenCC — admin only
dataRouter.post("/data/backfill-han-variants", requireAuth, requireAppAdmin, async (req, res, next) => {
    try {
        logStep("data", "BACKFILL HAN VARIANTS", userLabel(req));
        const db = requireAdmin();
        const result = await backfillHanVariants(db, getUserId(req));
        logOk("data", "BACKFILL HAN VARIANTS", null, `updated ${result.updated}/${result.total}`);
        res.json({ ok: true, ...result });
    } catch (err) {
        next(err);
    }
});

// Backfill pinyin from OpenCC simplified + pinyin-pro — admin only
dataRouter.post("/data/backfill-pinyin", requireAuth, requireAppAdmin, async (req, res, next) => {
    try {
        logStep("data", "BACKFILL PINYIN", userLabel(req));
        const db = requireAdmin();
        const result = await backfillPinyin(db, getUserId(req));
        logOk("data", "BACKFILL PINYIN", null, `updated ${result.updated}/${result.total}`);
        res.json({ ok: true, ...result });
    } catch (err) {
        next(err);
    }
});

// --- Words CRUD ---
dataRouter.get("/words", async (req, res, next) => {
    try {
        logStep("word", "LIST WORDS", userLabel(req));
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
        logStart("word", "CREATE WORD", req.body, userLabel(req));
        const db = requireAdmin();
        const row = wordToRow(req.body, getUserId(req));
        const { data, error } = await db.from("words").insert(row).select().single();
        if (error) throw error;
        logOk("word", "CREATE WORD", data);
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

        logStart("word", "UPDATE WORD", existingRow, userLabel(req));
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
        logOk("word", "UPDATE WORD", data);
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
                    logWarn("word", "PATCH WORD FLAGS", `invalid popularity: ${popularity}`);
                    return res.status(400).json({ error: "popularity must be 0–3 or null" });
                }
                updates.popularity = parsed;
            }
        }
        if (Object.keys(updates).length === 1) {
            logWarn("word", "PATCH WORD FLAGS", "no fields to update");
            return res.status(400).json({ error: "At least one of important, mastered, popularity, or studyProgress is required" });
        }

        const { data: existingRow } = await db
            .from("words")
            .select("han_traditional")
            .eq("id", req.params.id)
            .eq("user_id", userId)
            .maybeSingle();
        const flagDetail = [
            typeof important === "boolean" ? `important=${important}` : null,
            typeof mastered === "boolean" ? `mastered=${mastered}` : null,
            "popularity" in body ? `popularity=${updates.popularity ?? "null"}` : null,
            "studyProgress" in body ? `studyProgress=${updates.study_progress}` : null,
        ].filter(Boolean).join(", ");
        logStart("word", "PATCH WORD FLAGS", existingRow ?? req.params.id, userLabel(req));

        const { data, error } = await db
            .from("words")
            .update(updates)
            .eq("id", req.params.id)
            .eq("user_id", userId)
            .select()
            .single();
        if (error) {
            logError("word", "PATCH WORD FLAGS", error.message);
            throw error;
        }
        if (!data) return res.status(404).json({ error: "Word not found" });
        logOk("word", "PATCH WORD FLAGS", data, flagDetail);
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
        logStart("word", "DELETE WORD", existingRow ?? req.params.id, userLabel(req));

        const { data, error } = await db
            .from("words")
            .delete()
            .eq("id", req.params.id)
            .eq("user_id", userId)
            .select("id");
        if (error) throw error;
        if (!data?.length) return res.status(404).json({ error: "Word not found" });
        logOk("word", "DELETE WORD", existingRow ?? req.params.id);
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});

// --- Grammar CRUD ---
dataRouter.get("/grammar", async (req, res, next) => {
    try {
        logStep("grammar", "LIST GRAMMAR", userLabel(req));
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
        logStart("grammar", "CREATE GRAMMAR", req.body, userLabel(req));
        const db = requireAdmin();
        const row = grammarToRow(req.body, getUserId(req));
        const { data, error } = await db.from("grammar_bank").insert(row).select().single();
        if (error) throw error;
        logOk("grammar", "CREATE GRAMMAR", data);
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
        logStart("grammar", "UPDATE GRAMMAR", existingRow ?? req.body, userLabel(req));
        const row = grammarToRow({ ...req.body, id: req.params.id }, userId, { includeCreatedAt: false });
        const { data, error } = await db
            .from("grammar_bank")
            .update(row)
            .eq("id", req.params.id)
            .eq("user_id", userId)
            .select()
            .single();
        if (error) throw error;
        logOk("grammar", "UPDATE GRAMMAR", data);
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
        logStart("grammar", "DELETE GRAMMAR", existingRow ?? req.params.id, userLabel(req));

        const { data, error } = await db
            .from("grammar_bank")
            .delete()
            .eq("id", req.params.id)
            .eq("user_id", userId)
            .select("id");
        if (error) throw error;
        if (!data?.length) return res.status(404).json({ error: "Grammar not found" });
        logOk("grammar", "DELETE GRAMMAR", existingRow ?? req.params.id);
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});

// --- Sentence patterns CRUD ---
dataRouter.get("/sentence-patterns", async (req, res, next) => {
    try {
        logStep("sentence", "LIST SENTENCE PATTERNS", userLabel(req));
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
        logStep("sentence", "LIST SENTENCES FOR WORD", `${req.params.wordId} — ${userLabel(req)}`);
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
        logStart("sentence", "CREATE SENTENCE PATTERN", req.body, userLabel(req));
        const db = requireAdmin();
        const userId = getUserId(req);
        const row = sentencePatternToRow(req.body, userId);
        const { data, error } = await db.from("sentence_patterns").insert(row).select().single();
        if (error) {
            if (error.code === "PGRST205") {
                return res.status(503).json({
                    error: "Bảng mẫu câu chưa được tạo. Chạy migration sentence_patterns trên Supabase.",
                });
            }
            throw error;
        }
        logOk("sentence", "CREATE SENTENCE PATTERN", data);
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
        logStart("sentence", "UPDATE SENTENCE PATTERN", existingRow ?? req.body, userLabel(req));
        const row = sentencePatternToRow(
            { ...req.body, id: req.params.id },
            userId,
            { includeCreatedAt: false },
        );
        const { data, error } = await db
            .from("sentence_patterns")
            .update(row)
            .eq("id", req.params.id)
            .eq("user_id", userId)
            .select()
            .single();
        if (error) throw error;
        logOk("sentence", "UPDATE SENTENCE PATTERN", data);
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
        logStart("sentence", "DELETE SENTENCE PATTERN", existingRow ?? req.params.id, userLabel(req));

        const { data, error } = await db
            .from("sentence_patterns")
            .delete()
            .eq("id", req.params.id)
            .eq("user_id", userId)
            .select("id");
        if (error) throw error;
        if (!data?.length) return res.status(404).json({ error: "Sentence pattern not found" });
        logOk("sentence", "DELETE SENTENCE PATTERN", existingRow ?? req.params.id);
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});

// --- Lessons CRUD ---
dataRouter.get("/lessons", async (req, res, next) => {
    try {
        logStep("lesson", "LIST LESSONS", userLabel(req));
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
        logStart("lesson", "CREATE LESSON", req.body?.name ?? req.body, userLabel(req));
        const db = requireAdmin();
        const row = lessonToRow(req.body, getUserId(req));
        const { data, error } = await db.from("lessons").insert(row).select().single();
        if (error) throw error;
        logOk("lesson", "CREATE LESSON", data?.name ?? data);
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
        logStart("lesson", "UPDATE LESSON", existingRow?.name ?? req.body?.name ?? req.params.id, userLabel(req));
        const row = lessonToRow({ ...req.body, id: req.params.id }, userId);
        const { data, error } = await db
            .from("lessons")
            .update(row)
            .eq("id", req.params.id)
            .eq("user_id", userId)
            .select()
            .single();
        if (error) throw error;
        logOk("lesson", "UPDATE LESSON", data?.name ?? data);
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
        logStart("lesson", "DELETE LESSON", existingRow?.name ?? req.params.id, userLabel(req));

        const { data, error } = await db
            .from("lessons")
            .delete()
            .eq("id", req.params.id)
            .eq("user_id", userId)
            .select("id");
        if (error) throw error;
        if (!data?.length) return res.status(404).json({ error: "Lesson not found" });
        logOk("lesson", "DELETE LESSON", existingRow?.name ?? req.params.id);
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});
