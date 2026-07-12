import { searchQueryVariants } from "./searchNormalize.js";

const STALE_STUDY_DAYS = 3;

const SORT_COLUMNS = {
    hanViet: "han_viet",
    hanTraditional: "han_traditional",
    jyutping: "jyutping",
    pinyin: "pinyin",
    vietnamese: "vietnamese",
    english: "english",
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

function applyWordFilters(query, { filter = "all", search = "", studyDue = false, maxProgress = null } = {}) {
    let q = query;
    if (filter === "important") q = q.eq("important", true);
    else if (filter === "mastered") q = q.eq("mastered", true);

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

export async function countWords(
    db,
    userId,
    { filter = "all", search = "", studyDue = false, maxProgress = null } = {},
) {
    let q = db.from("words").select("id", { count: "exact", head: true }).eq("user_id", userId);
    q = applyWordFilters(q, { filter, search, studyDue, maxProgress });
    const { count, error } = await q;
    if (error) throw error;
    return count ?? 0;
}

export async function queryWords(
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
    } = {},
) {
    const safePageSize = Math.min(50, Math.max(1, Number(pageSize) || 10));
    const safePage = Math.max(1, Number(page) || 1);
    const column = SORT_COLUMNS[sortKey] ?? (studyDue ? "study_progress_at" : "created_at");
    const ascending = studyDue ? true : sortDir === "asc";

    let q = db.from("words").select("*", { count: "exact" }).eq("user_id", userId);
    q = applyWordFilters(q, { filter, search, studyDue, maxProgress });

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

export async function fetchWordsByIds(db, userId, ids) {
    const unique = [...new Set((ids ?? []).map(String).filter(Boolean))];
    if (unique.length === 0) return [];

    const { data, error } = await db.from("words").select("*").eq("user_id", userId).in("id", unique);
    if (error) throw error;
    return data ?? [];
}
