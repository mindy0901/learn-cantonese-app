import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../store/localeStore.js";
import { useAppActions, useVocabularies, useHanCharacters } from "../store/appStore.js";
import { normalizeSearchText, hasToneDiacritics } from "../lib/wordSearch.js";
import { collectMeaningsField } from "../lib/wordNormalize.js";
import { vocabRomanizationField, vocabMeanings } from "../lib/wordDisplay.js";
import { comparePinyinTone } from "../lib/pinyinSort.js";
import { saveWordBankReturnState, clearWordBankReturnState, restoreWordBankScroll } from "../lib/wordBankReturn.js";
import { useIsSignedIn, useIsAdmin } from "../store/authStore.js";
import { PAGE_SIZE } from "../lib/constants.js";
import { cn } from "../lib/cn.js";
import { hanSortKey, compareHanKeys, setHanStrokeMap } from "../lib/hanStroke.js";
import { Pagination } from "./Pagination.jsx";
import { WordRow } from "./WordRow.jsx";
import { SkeletonTable } from "./ui/Skeleton.jsx";
import { ConfirmDialog } from "./ConfirmDialog.jsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./shadcn/table.jsx";

const thClass =
    "sticky top-0 z-10 text-left border-b border-border align-middle truncate bg-background text-muted-foreground font-medium text-sm uppercase tracking-wide";

const thClassBank = "px-5 py-2.5";
const thClassPicker = "px-3 py-2";
const tdPicker = "[&_td]:px-3 [&_td]:py-2";

/**
 * Deterministic tiebreak for equal sort values — keeps row order stable across refreshes.
 */
function stableTiebreak(a, b) {
    const ha = String(a.hanTraditional ?? "");
    const hb = String(b.hanTraditional ?? "");
    if (ha !== hb) return compareHan(ha, hb);
    const ia = String(a.id ?? "");
    const ib = String(b.id ?? "");
    return ia < ib ? -1 : ia > ib ? 1 : 0;
}

/** Lightweight han comparison (stroke collator) for tiebreaks only. */
const tiebreakCollator = (() => {
    try {
        return new Intl.Collator("zh-Hant-u-co-stroke", { sensitivity: "variant" });
    } catch {
        return null;
    }
})();

function compareHan(a, b) {
    if (tiebreakCollator) return tiebreakCollator.compare(a, b);
    return a < b ? -1 : a > b ? 1 : 0;
}

function comparePinyin(a, b) {
    // Prefer DB-computed pinyin_numeric (yi1 yi2 yi4 — stable, locale-free).
    const na = String(a.pinyinNumeric ?? "")
        .trim()
        .toLowerCase();
    const nb = String(b.pinyinNumeric ?? "")
        .trim()
        .toLowerCase();
    if (na && nb && na !== nb) return na < nb ? -1 : 1;
    // Tone collator — orders yī, yí, yǐ, yì by tone (1,2,3,4).
    return comparePinyinTone(
        vocabRomanizationField(a, "pinyin") || (a.pinyin ?? ""),
        vocabRomanizationField(b, "pinyin") || (b.pinyin ?? ""),
    );
}

/** Vocabulary fields searched for a given "Search in" column selector. */
function searchFieldsFor(column) {
    switch (column) {
        case "han":
            // "Chữ Hán & Phiên âm" — search han forms (simp + hk) and romanizations
            return ["hanTraditional", "hanSimplified", "hanHongKong", "pinyin", "jyutping"];
        case "sinoVietnamese":
            return ["sinoVietnamese"];
        case "meaning":
            // "Nghĩa" — search both Vietnamese and English meanings
            return ["vietMeanings", "engMeanings"];
        default:
            return ["hanTraditional", "hanSimplified", "hanHongKong"];
    }
}

/**
 * Resolve a field's searchable value, preferring the child `word.meanings`
 * (meanings_json) per project rule, falling back to the flat column.
 * For meaning fields, reads across `romanization` when present.
 */
function searchFieldValue(word, field) {
    if (field === "vietMeanings" || field === "engMeanings") {
        const joined = collectMeaningsField(vocabMeanings(word), field) || collectMeaningsField(word.meanings, field);
        return joined || word[field] || "";
    }
    if (field === "pinyin") return vocabRomanizationField(word, "pinyin") || word[field] || "";
    if (field === "jyutping") return vocabRomanizationField(word, "jyutping") || word[field] || "";
    if (field === "sinoVietnamese") return vocabRomanizationField(word, "sinoVietnamese") || word[field] || "";
    return word[field] ?? "";
}

/**
 * Whole-word matching for the "meaning" search (Vietnamese & English).
 * The query must match a complete word, not a substring of a longer word:
 *   "cam" matches "cam quýt" but NOT "Camel" / "camera" / "campus".
 * Multi-word queries fall back to phrase (substring) matching.
 * Assumes both haystack and q are already normalized (lowercased, tone-less).
 */
function matchesWholeWord(haystack, q) {
    if (!haystack || !q) return false;
    if (q.includes(" ")) return haystack.includes(q);
    const tokens = haystack.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    return tokens.includes(q);
}

export const WordBankBrowseTable = memo(function WordBankBrowseTable({
    variant = "bank",
    search,
    searchColumn,
    filter,
    showImportant,
    showMastered,
    hskLevel,
    setId,
    setVocabularyIds,
    sortKey,
    sortDir,
    onView,
    onEdit,
    onTotalChange,
    selected,
    onToggleSelect,
    emptyHint,
    emptyNoMatch,
    restoreState = null,
    onAddNew,
}) {
    const { t, fmt } = useLocale();
    const isPicker = variant === "picker";
    const isSignedIn = useIsSignedIn();
    const canMark = !isPicker && isSignedIn;
    const isAdmin = useIsAdmin();
    const storeWords = useVocabularies();
    const hanCharacters = useHanCharacters();
    const { toggleImportant, toggleMastered, removeVocabulary } = useAppActions();
    const restoredScrollRef = useRef(false);
    const skipPageResetRef = useRef(Boolean(restoreState));
    const [page, setPage] = useState(() => {
        const next = restoreState?.page;
        return typeof next === "number" && next >= 1 ? next : 1;
    });
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);

    // Load char→strokeCount map from store once (used by han sort, no cnchar).
    useEffect(() => {
        setHanStrokeMap(hanCharacters);
    }, [hanCharacters]);

    useEffect(() => {
        setItems((current) => {
            const byId = new Map(storeWords.map((w) => [w.id, w]));
            let changed = false;
            const next = [];
            for (const item of current) {
                const fromStore = byId.get(item.id);
                if (!fromStore) {
                    // Word was deleted from store — remove from local list
                    changed = true;
                    continue;
                }
                const updated = {
                    ...item,
                    engMeanings: fromStore.engMeanings,
                    hanTraditional: fromStore.hanTraditional,
                    vietMeanings: fromStore.vietMeanings,
                    meanings: fromStore.meanings,
                    sinoVietnamese: fromStore.sinoVietnamese,
                    jyutping: fromStore.jyutping,
                    vietExamples: fromStore.vietExamples,
                    romanization: fromStore.romanization,
                    important: fromStore.important,
                    mastered: fromStore.mastered,
                };
                if (
                    updated.engMeanings !== item.engMeanings ||
                    updated.hanTraditional !== item.hanTraditional ||
                    updated.vietMeanings !== item.vietMeanings ||
                    updated.meanings !== item.meanings ||
                    updated.sinoVietnamese !== item.sinoVietnamese ||
                    updated.jyutping !== item.jyutping ||
                    updated.vietExamples !== item.vietExamples ||
                    updated.romanization !== item.romanization ||
                    updated.important !== item.important ||
                    updated.mastered !== item.mastered
                ) {
                    changed = true;
                }
                next.push(updated);
            }
            return changed ? next : current;
        });
    }, [storeWords]);

    const handleToggleImportant = useCallback(
        (word) => {
            const nextImportant = !word.important;
            if (showImportant && !nextImportant) {
                setTotal((current) => {
                    const next = Math.max(0, current - 1);
                    onTotalChange?.(next);
                    return next;
                });
            }
            toggleImportant(word);
        },
        [showImportant, onTotalChange, toggleImportant],
    );

    const handleToggleMastered = useCallback(
        (word) => {
            const nextMastered = !word.mastered;
            if (showMastered && !nextMastered) {
                setTotal((current) => {
                    const next = Math.max(0, current - 1);
                    onTotalChange?.(next);
                    return next;
                });
            }
            toggleMastered(word);
        },
        [showMastered, onTotalChange, toggleMastered],
    );

    const displayItems = useMemo(() => {
        let result = items;
        if (showImportant) result = result.filter((word) => word.important);
        if (showMastered) result = result.filter((word) => word.mastered);
        return result;
    }, [items, showImportant, showMastered]);

    const hasQuery = search.trim().length > 0;

    const handleViewWord = useCallback(
        (word) => {
            if (!isPicker && onView) {
                saveWordBankReturnState({
                    wordId: word.id,
                    page,
                    scrollY: window.scrollY,
                    search,
                    filter,
                    sortKey,
                    sortDir,
                });
                onView(word);
            }
        },
        [isPicker, onView, page, search, filter, hskLevel, setId, sortKey, sortDir, searchColumn],
    );

    const handleDelete = useCallback((word) => {
        setDeleteTarget(word);
    }, []);

    const confirmDelete = useCallback(() => {
        if (deleteTarget) {
            removeVocabulary(deleteTarget.id);
            setDeleteTarget(null);
        }
    }, [deleteTarget, removeVocabulary]);

    useEffect(() => {
        if (skipPageResetRef.current) {
            skipPageResetRef.current = false;
            return;
        }
        setPage(1);
    }, [search, filter, hskLevel, setId, sortKey, sortDir, searchColumn]);

    // Client-side filter + sort + paginate from store data
    useEffect(() => {
        let filtered = storeWords;

        // HSK level filter
        if (hskLevel && hskLevel !== "all") {
            const lvl = hskLevel;
            filtered = filtered.filter((w) => {
                const hsk = String(w.hskLevel ?? "");
                if (!hsk) return false;
                // "HSK 7-9" contains "7", "HSK 1" contains "1"
                return hsk.includes(lvl);
            });
        }

        // Vocabulary set filter
        if (setId && setId !== "all") {
            const ids = setVocabularyIds?.[setId] ?? [];
            filtered = filtered.filter((w) => ids.includes(w.id));
        }

        // Filter checkboxes
        if (showImportant) filtered = filtered.filter((w) => w.important);
        if (showMastered) filtered = filtered.filter((w) => w.mastered);

        // Client-side text search
        const rawSearch = search.trim();
        const q = normalizeSearchText(rawSearch);
        // Only treat as "strict diacritic search" when user typed tone marks (sắc/huyền/hỏi/ngã/nặng).
        // Vowel diacritics alone (ă/â/ê/ô/ơ/ư) → broad normalized match.
        const strictTones = hasToneDiacritics(rawSearch);
        const searchFields = searchFieldsFor(searchColumn);

        if (q) {
            const wholeWord = searchColumn === "meaning";
            filtered = filtered.filter((w) => {
                // Tone-strict: require exact tone match in the searched fields
                if (strictTones) {
                    const haystack = searchFields
                        .map((f) => searchFieldValue(w, f))
                        .filter(Boolean)
                        .join(" ")
                        .toLowerCase();
                    return haystack.includes(rawSearch.toLowerCase());
                }
                // Broad normalized match against the selected column(s).
                // Normalize haystack the same way as q (strip diacritics) so
                // "nhat" matches "NHẤT" / "nhất".
                const haystack = searchFields
                    .map((f) => normalizeSearchText(searchFieldValue(w, f)))
                    .filter(Boolean)
                    .join(" ");
                // "Tiếng Việt & tiếng Anh" matches complete words only ("cam"
                // should not match "Camel"); other columns use substring.
                return wholeWord ? matchesWholeWord(haystack, q) : haystack.includes(q);
            });
        }

        // Relevance scoring for search — prioritize exact matches first
        const getMatchScore = (word) => {
            // Score only against the selected search column(s).
            let best = 0;
            for (const f of searchFields) {
                const v = normalizeSearchText(searchFieldValue(word, f));
                if (!v) continue;
                if (v === q) {
                    best = Math.max(best, 3);
                } else if (v.startsWith(q)) {
                    best = Math.max(best, 2);
                } else if (v.includes(q)) {
                    best = Math.max(best, 1);
                }
            }
            return best;
        };

        // Precompute han sort keys ONCE (cnchar is expensive — avoid calling
        // it per-comparison inside Array.sort).
        const hanKeys = new Map();
        const hanKey = (str) => {
            const k = String(str ?? "");
            let key = hanKeys.get(k);
            if (!key) {
                key = hanSortKey(k);
                hanKeys.set(k, key);
            }
            return key;
        };

        // Sort — when searching, only rank by relevance, don't apply sortKey
        const sorted = [...filtered].sort((a, b) => {
            if (q) {
                const aScore = getMatchScore(a);
                const bScore = getMatchScore(b);
                if (aScore !== bScore) return bScore - aScore;
                // Tiebreaker: fewer characters first, then stable key
                const aLen = (a.hanTraditional ?? "").length;
                const bLen = (b.hanTraditional ?? "").length;
                if (aLen !== bLen) return aLen - bLen;
                return stableTiebreak(a, b);
            }
            let aVal = a[sortKey];
            let bVal = b[sortKey];
            if (sortKey === "createdAt") {
                aVal = a.createdAt ?? "";
                bVal = b.createdAt ?? "";
            } else if (sortKey === "hanTraditional") {
                aVal = a.hanTraditional || a.hanSimplified || "";
                bVal = b.hanTraditional || b.hanSimplified || "";
            }
            if (aVal == null || bVal == null) {
                if (aVal == null && bVal == null) return stableTiebreak(a, b);
                return aVal == null ? 1 : -1;
            }
            const aStr = String(aVal).toLowerCase();
            const bStr = String(bVal).toLowerCase();
            if (sortKey === "hanTraditional") {
                const cmp = compareHanKeys(hanKey(aStr), hanKey(bStr), aStr, bStr);
                if (cmp !== 0) return sortDir === "asc" ? cmp : -cmp;
                // Same han chars → tiebreak by pinyin (yī, yí, yì…), then id.
                const pc = comparePinyin(a, b);
                if (pc !== 0) return pc;
                return stableTiebreak(a, b);
            }
            if (aStr < bStr) return sortDir === "asc" ? -1 : 1;
            if (aStr > bStr) return sortDir === "asc" ? 1 : -1;
            return stableTiebreak(a, b);
        });

        // Paginate
        const start = (page - 1) * PAGE_SIZE;
        const paged = sorted.slice(start, start + PAGE_SIZE);

        setItems(paged);
        setTotal(sorted.length);
        setTotalPages(Math.max(1, Math.ceil(sorted.length / PAGE_SIZE)));
        onTotalChange?.(sorted.length);
        setLoading(false);
        setLoadError(null);
    }, [
        page,
        search,
        filter,
        showImportant,
        showMastered,
        hskLevel,
        setId,
        setVocabularyIds,
        sortKey,
        sortDir,
        searchColumn,
        storeWords,
        onTotalChange,
    ]);

    useEffect(() => {
        if (loading) return;
        if (page > totalPages) setPage(totalPages);
    }, [page, totalPages, loading]);

    useEffect(() => {
        if (isPicker || !restoreState || restoredScrollRef.current || loading) return;
        if (displayItems.length === 0 && !loadError) return;

        let attempts = 0;
        const maxAttempts = 30;

        const tryRestore = () => {
            attempts += 1;
            if (restoreWordBankScroll(restoreState)) {
                restoredScrollRef.current = true;
                clearWordBankReturnState();
                return;
            }
            if (attempts < maxAttempts) {
                requestAnimationFrame(tryRestore);
                return;
            }
            restoredScrollRef.current = true;
            clearWordBankReturnState();
        };

        requestAnimationFrame(tryRestore);
    }, [isPicker, restoreState, loading, displayItems, loadError]);

    const safePage = Math.min(page, totalPages);
    const startIndex = (safePage - 1) * PAGE_SIZE;
    const showEmpty = !loading && displayItems.length === 0;
    const colCount = isPicker ? 7 : 10 + (canMark ? 1 : 0);
    const placeholderCount = Math.max(0, PAGE_SIZE - (showEmpty ? 1 : displayItems.length));

    const placeholderRows = useMemo(
        () =>
            Array.from({ length: placeholderCount }, (_, i) => (
                <TableRow
                    key={`placeholder-${i}`}
                    aria-hidden="true"
                    className="border-b border-border last:border-b-0 hover:bg-transparent"
                >
                    <TableCell colSpan={colCount} className="py-2.5 align-middle">
                        <span className="block min-h-5 invisible" aria-hidden="true">
                            &nbsp;
                        </span>
                    </TableCell>
                </TableRow>
            )),
        [placeholderCount, colCount],
    );

    const emptyMessage = useMemo(() => {
        if (loadError) return null;
        if (hasQuery && isPicker && onAddNew) return "ADD_NEW_PROMPT";
        if (hasQuery) return emptyNoMatch ?? t.wordBank.noSearchMatch;
        if (isPicker) return emptyHint ?? t.picker.searchBankHint;
        return t.wordBank.empty;
    }, [loadError, hasQuery, emptyNoMatch, emptyHint, isPicker, t, onAddNew]);

    const rows = useMemo(() => {
        return displayItems.map((word, i) => (
            <WordRow
                key={word.id}
                word={word}
                index={startIndex + i}
                canMark={canMark}
                pickerMode={isPicker}
                selected={selected?.has(String(word.id))}
                onToggleSelect={onToggleSelect}
                onToggleImportant={handleToggleImportant}
                onToggleMastered={handleToggleMastered}
                onView={handleViewWord}
                onEdit={isAdmin ? onEdit : undefined}
                onDelete={isAdmin ? handleDelete : undefined}
            />
        ));
    }, [
        displayItems,
        startIndex,
        canMark,
        isPicker,
        selected,
        onToggleSelect,
        handleToggleImportant,
        handleToggleMastered,
        handleViewWord,
        onEdit,
        isAdmin,
    ]);

    const pagination = (
        <Pagination
            page={safePage}
            totalPages={totalPages}
            total={total}
            startIndex={startIndex}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            reserveSpace={!isPicker}
        />
    );

    const th = cn(thClass, isPicker ? thClassPicker : thClassBank);
    const numHeadClass = cn(
        th,
        "text-muted-foreground text-[0.8125rem] whitespace-nowrap text-center px-1.5",
        !isPicker && "pr-0.5",
    );

    return (
        <>
            {isPicker && <div className="border-t border-border px-3 pt-2 pb-3">{pagination}</div>}
            <div
                className={cn(
                    "overflow-y-auto overflow-x-visible border border-border rounded-xl bg-card shadow-sm",
                    !isPicker && "w-full max-w-full",
                    isPicker && tdPicker,
                )}
            >
                <Table className={cn("border-collapse text-base table-auto", isPicker && tdPicker)}>
                    <colgroup>
                        {isPicker ? <col className="w-9" /> : <col />}
                        {!isPicker && canMark && <col className="w-8" />}
                        <col />
                        <col />
                        {!isPicker && <col />}
                        {!isPicker && <col />}
                        {!isPicker && <col />}
                        {!isPicker && <col />}
                    </colgroup>
                    <TableHeader>
                        <TableRow className="hover:bg-transparent">
                            {isPicker ? (
                                <TableHead
                                    className={cn(th, "text-center align-middle")}
                                    aria-label={t.picker.selected}
                                />
                            ) : (
                                <TableHead className={numHeadClass}>{t.wordBank.colNum}</TableHead>
                            )}
                            {!isPicker && canMark && (
                                <TableHead className={cn(th, "px-0.5 py-1.5 text-center align-middle w-8")}>
                                    {t.wordBank.colStar}
                                </TableHead>
                            )}
                            <TableHead className={cn(th, "w-30")}>{t.wordBank.colSinoVietnamese}</TableHead>
                            <TableHead className={cn(th, "text-center")} colSpan={4}>
                                {t.wordBank.colHanChars}
                            </TableHead>
                            {!isPicker && (
                                <>
                                    <TableHead
                                        className={cn(
                                            th,
                                            "px-5 py-1.5 text-left align-middle text-[0.6875rem] font-semibold leading-tight whitespace-nowrap tracking-wide",
                                        )}
                                    >
                                        {t.wordBank.colVietMeanings}
                                    </TableHead>
                                    <TableHead
                                        className={cn(
                                            th,
                                            "px-5 py-1.5 text-left align-middle text-[0.6875rem] font-semibold leading-tight whitespace-nowrap tracking-wide",
                                        )}
                                    >
                                        {t.wordBank.colEngMeanings}
                                    </TableHead>
                                </>
                            )}
                            <TableHead className={cn(th, "text-center")}>{t.wordBank.colLevel}</TableHead>
                            {!isPicker && <TableHead className={cn(th, "px-0 text-center w-10")} />}
                        </TableRow>
                    </TableHeader>
                    <TableBody className="[&_tr:last-child]:border-b-0">
                        {loading ? (
                            <TableRow className="hover:bg-transparent">
                                <TableCell colSpan={colCount} className="p-0">
                                    <SkeletonTable rows={8} />
                                </TableCell>
                            </TableRow>
                        ) : loadError ? (
                            <TableRow className="hover:bg-transparent">
                                <TableCell colSpan={colCount}>
                                    <p
                                        className="m-0 min-h-10 flex items-center justify-center text-center px-4 py-3 rounded-lg text-sm bg-destructive/10 text-destructive border border-destructive/30"
                                        role="alert"
                                    >
                                        {loadError}
                                    </p>
                                </TableCell>
                            </TableRow>
                        ) : showEmpty ? (
                            <TableRow className="hover:bg-transparent">
                                <TableCell colSpan={colCount}>
                                    {emptyMessage === "ADD_NEW_PROMPT" ? (
                                        <div className="min-h-10 flex flex-col items-center justify-center gap-2 py-3 text-center">
                                            <p className="m-0 text-sm text-muted-foreground">
                                                {t.wordBank.noSearchMatch}
                                            </p>
                                            <button
                                                type="button"
                                                className="text-sm font-medium text-primary hover:text-primary underline underline-offset-2 transition-colors"
                                                onClick={() => onAddNew(search)}
                                            >
                                                {fmt(t.picker.addNew, { word: search })}
                                            </button>
                                        </div>
                                    ) : (
                                        <p className="m-0 min-h-10 flex items-center justify-center text-center text-sm text-muted-foreground">
                                            {emptyMessage}
                                        </p>
                                    )}
                                </TableCell>
                            </TableRow>
                        ) : (
                            rows
                        )}
                        {!loading && placeholderRows}
                    </TableBody>
                </Table>
            </div>
            {!isPicker && <div className="min-h-11 mt-3 [&_.pagination]:mt-0">{pagination}</div>}

            {deleteTarget && (
                <ConfirmDialog
                    title={t.confirm.deleteTitle}
                    message={fmt(t.confirm.deleteVocabulary, { label: deleteTarget.hanTraditional })}
                    confirmLabel={t.confirm.deleteYes}
                    cancelLabel={t.common.cancel}
                    onConfirm={confirmDelete}
                    onCancel={() => setDeleteTarget(null)}
                    danger
                />
            )}
        </>
    );
});
