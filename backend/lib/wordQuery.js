import { searchQueryVariants } from "./searchNormalize.js";

const STALE_STUDY_DAYS = 3;

const SORT_COLUMNS = {
    sinoVietnamese: "sino_vietnamese",
    hanTraditional: "han_traditional",
    jyutping: "jyutping",
    pinyin: "pinyin",
    vietMeanings: "vietMeanings",
    engMeanings: "engMeanings",
    hskLevel: "hsk_level",
    createdAt: "created_at",
    studyProgressAt: "study_progress_at",
};

function dueReviewCutoffIso() {
    return new Date(Date.now() - STALE_STUDY_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

function escapeIlike(value) {
    return String(value ?? "")
        .replace(/\\/g, "\\\\")
        .replace(/%/g, "\\%")
        .replace(/_/g, "\\_");
}

function applyVocabularyFilters(
    query,
    { filter = "all", search = "", studyDue = false, maxProgress = null, hskLevel = null } = {},
) {
    let q = query;
    if (filter === "important") q = q.eq("important", true);
    else if (filter === "mastered") q = q.eq("mastered", true);

    if (hskLevel === "hsk") {
        // Only HSK data (has hsk_level set)
        q = q.not("hsk_level", "is", null);
    } else if (hskLevel === "legacy") {
        // Only legacy/user data (hsk_level is null)
        q = q.is("hsk_level", null);
    } else if (hskLevel && hskLevel !== "all") {
        // Specific HSK level, e.g. "HSK 1", "HSK 7-9"
        q = q.eq("hsk_level", hskLevel);
    }

    if (studyDue) {
        q = q
            .eq("mastered", false)
            .gt("study_progress", 0)
            .lt("study_progress", 100)
            .or(`study_progress_at.is.null,study_progress_at.lt.${dueReviewCutoffIso()}`);
    }

    if (maxProgress != null && maxProgress !== "") {
        const parsed = Number(maxProgress);
        if (Number.isFinite(parsed)) {
            q = q.eq("mastered", false).lte("study_progress", Math.max(0, Math.min(100, Math.round(parsed))));
        }
    }

    const variants = searchQueryVariants(search);
    if (variants.length === 1) {
        const pattern = `%${escapeIlike(variants[0])}%`;
        q = q.ilike("search_key", pattern);
    } else if (variants.length > 1) {
        const orFilter = variants
            .map((variant) => {
                const pattern = escapeIlike(variant).replace(/"/g, '\\"');
                return `search_key.ilike."%${pattern}%"`;
            })
            .join(",");
        q = q.or(orFilter);
    }
    return q;
}

export async function countVocabularies(
    db,
    userId,
    { filter = "all", search = "", studyDue = false, maxProgress = null, hskLevel = null } = {},
) {
    let q = db.from("words").select("id", { count: "exact", head: true }).eq("user_id", userId);
    q = applyVocabularyFilters(q, { filter, search, studyDue, maxProgress, hskLevel });
    const { count, error } = await q;
    if (error) throw error;
    return count ?? 0;
}

export async function queryVocabularies(
    db,
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
    const column = SORT_COLUMNS[sortKey] ?? (studyDue ? "study_progress_at" : "created_at");
    const ascending = studyDue ? true : sortDir === "asc";

    let q = db.from("words").select("*", { count: "exact" }).eq("user_id", userId);
    q = applyVocabularyFilters(q, { filter, search, studyDue, maxProgress, hskLevel });

    if (importantFirst) {
        q = q.order("important", { ascending: false });
    }
    if (studyDue) {
        q = q.order("study_progress_at", { ascending: true, nullsFirst: true });
    }
    q = q.order(column, { ascending, nullsFirst: false }).order("id", { ascending: true });

    const from = (safePage - 1) * safePageSize;
    const { data, error, count } = await q.range(from, from + safePageSize - 1);
    if (error) throw error;

    const total = count ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / safePageSize) || 1);

    return {
        items: data ?? [],
        page: safePage,
        pageSize: safePageSize,
        total,
        totalPages,
        startIndex: from,
    };
}

export async function fetchVocabulariesByIds(db, userId, ids) {
    const unique = [...new Set((ids ?? []).map(String).filter(Boolean))];
    if (unique.length === 0) return [];

    const { data, error } = await db.from("words").select("*").eq("user_id", userId).in("id", unique);
    if (error) throw error;
    return data ?? [];
}
