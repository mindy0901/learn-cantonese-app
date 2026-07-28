import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../store/localeStore.js";
import { useAppActions, useVocabularies } from "../store/appStore.js";
import { normalizeSearchText, hasToneDiacritics } from "../lib/wordSearch.js";
import { saveWordBankReturnState, clearWordBankReturnState, restoreWordBankScroll } from "../lib/wordBankReturn.js";
import { useIsSignedIn, useIsAdmin } from "../store/authStore.js";
import { PAGE_SIZE } from "../lib/constants.js";
import { cn } from "../lib/cn.js";
import { Pagination } from "./Pagination.jsx";
import { WordRow } from "./WordRow.jsx";
import { SkeletonTable } from "./ui/Skeleton.jsx";
import { ConfirmDialog } from "./ConfirmDialog.jsx";

const thClass =
    "text-left border-b border-border align-middle truncate bg-bg text-text-muted font-medium text-sm uppercase tracking-wide";

const thClassBank = "px-5 py-2.5";
const thClassPicker = "px-3 py-2";
const tdPicker = "[&_td]:px-3 [&_td]:py-2";

export const WordBankBrowseTable = memo(function WordBankBrowseTable({
    variant = "bank",
    search,
    filter,
    showImportant,
    showMastered,
    hskLevel,
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
                    sinoVietnamese: fromStore.sinoVietnamese,
                    jyutping: fromStore.jyutping,
                    vietExamples: fromStore.vietExamples,
                    important: fromStore.important,
                    mastered: fromStore.mastered,
                };
                if (
                    updated.engMeanings !== item.engMeanings ||
                    updated.hanTraditional !== item.hanTraditional ||
                    updated.vietMeanings !== item.vietMeanings ||
                    updated.sinoVietnamese !== item.sinoVietnamese ||
                    updated.jyutping !== item.jyutping ||
                    updated.vietExamples !== item.vietExamples ||
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
        [isPicker, onView, page, search, filter, hskLevel, sortKey, sortDir],
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
    }, [search, filter, hskLevel, sortKey, sortDir]);

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

        // Filter checkboxes
        if (showImportant) filtered = filtered.filter((w) => w.important);
        if (showMastered) filtered = filtered.filter((w) => w.mastered);

        // Client-side text search
        const rawSearch = search.trim();
        const q = normalizeSearchText(rawSearch);
        // Only treat as "strict diacritic search" when user typed tone marks (sắc/huyền/hỏi/ngã/nặng).
        // Vowel diacritics alone (ă/â/ê/ô/ơ/ư) → broad normalized match.
        const strictTones = hasToneDiacritics(rawSearch);

        if (q) {
            filtered = filtered.filter((w) => {
                // Tone-strict: require exact tone match in raw fields
                if (strictTones) {
                    const haystack = [
                        w.sinoVietnamese,
                        w.hanTraditional,
                        w.hanSimplified,
                        w.engMeanings,
                        w.vietMeanings,
                        w.jyutping,
                        w.pinyin,
                    ]
                        .filter(Boolean)
                        .join(" ")
                        .toLowerCase();
                    return haystack.includes(rawSearch.toLowerCase());
                }
                // No tone marks (or pure ASCII): broad normalized match via pre-built _searchBlob
                if (w._searchBlob && w._searchBlob.includes(q)) return true;
                // Fallback
                const haystack = [
                    w.hanTraditional,
                    w.hanSimplified,
                    w.engMeanings,
                    w.vietMeanings,
                    w.sinoVietnamese,
                    w.jyutping,
                    w.pinyin,
                ]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase();
                return haystack.includes(q);
            });
        }

        // Relevance scoring for search — prioritize exact matches first
        const rawQuery = search.trim();
        const getMatchScore = (word) => {
            // Check first token of sinoVietnamese (before | or , or /) — case-insensitive, keep diacritics
            const svRaw = (word.sinoVietnamese ?? "").split(/[|,/]+/)[0]?.trim() ?? "";
            if (svRaw.toLowerCase() === rawQuery.toLowerCase()) return 5;
            if (svRaw.toLowerCase().startsWith(rawQuery.toLowerCase())) return 4;

            const fields = [
                word.jyutping,
                word.hanTraditional,
                word.hanSimplified,
                word.engMeanings,
                word.vietMeanings,
                word.sinoVietnamese,
                word.pinyin,
            ];
            let best = 0;
            for (const raw of fields) {
                const v = normalizeSearchText(raw ?? "");
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

        // Sort — when searching, only rank by relevance, don't apply sortKey
        const sorted = [...filtered].sort((a, b) => {
            if (q) {
                const aScore = getMatchScore(a);
                const bScore = getMatchScore(b);
                if (aScore !== bScore) return bScore - aScore;
                // Tiebreaker: fewer characters first
                const aLen = (a.hanTraditional ?? "").length;
                const bLen = (b.hanTraditional ?? "").length;
                if (aLen !== bLen) return aLen - bLen;
                return 0;
            }
            let aVal = a[sortKey];
            let bVal = b[sortKey];
            if (sortKey === "createdAt") {
                aVal = a.createdAt ?? "";
                bVal = b.createdAt ?? "";
            }
            if (aVal == null || bVal == null) {
                if (aVal == null && bVal == null) return 0;
                return aVal == null ? 1 : -1;
            }
            const aStr = String(aVal).toLowerCase();
            const bStr = String(bVal).toLowerCase();
            if (aStr < bStr) return sortDir === "asc" ? -1 : 1;
            if (aStr > bStr) return sortDir === "asc" ? 1 : -1;
            return 0;
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
    }, [page, search, filter, showImportant, showMastered, hskLevel, sortKey, sortDir, storeWords, onTotalChange]);

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
    const colCount = isPicker ? 7 : 8 + (canMark ? 2 : 0);
    const placeholderCount = Math.max(0, PAGE_SIZE - (showEmpty ? 1 : displayItems.length));

    const placeholderRows = useMemo(
        () =>
            Array.from({ length: placeholderCount }, (_, i) => (
                <tr key={`placeholder-${i}`} aria-hidden="true" className="border-b border-border last:border-b-0">
                    <td colSpan={colCount} className="py-2.5 align-middle">
                        <span className="block min-h-5 invisible" aria-hidden="true">
                            &nbsp;
                        </span>
                    </td>
                </tr>
            )),
        [placeholderCount, colCount],
    );

    const emptyMessage = useMemo(() => {
        if (loadError) return null;
        if (hasQuery && isPicker && onAddNew) return "ADD_NEW_PROMPT";
        if (hasQuery) return emptyNoMatch ?? t.wordBank.noSearchMatch;
        if (isPicker) return emptyHint ?? t.lessonEdit.searchBankHint;
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
                onEdit={onEdit}
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
        "text-text-muted text-[0.8125rem] whitespace-nowrap text-center px-1.5",
        !isPicker && "pr-0.5",
    );

    return (
        <>
            {isPicker && <div className="border-t border-border px-3 pt-2 pb-3">{pagination}</div>}
            <div
                className={cn(
                    "overflow-y-auto overflow-x-visible border border-border rounded-xl bg-surface",
                    !isPicker && "w-full max-w-full",
                    isPicker && tdPicker,
                )}
            >
                <table className={cn("w-full border-collapse text-base table-auto", isPicker && tdPicker)}>
                    <colgroup>
                        {isPicker ? <col className="w-9" /> : <col />}
                        {!isPicker && canMark && <col className="w-8" />}
                        <col />
                        <col />
                        {!isPicker && canMark && <col className="w-32" />}
                    </colgroup>
                    <thead>
                        <tr>
                            {isPicker ? (
                                <th className={cn(th, "text-center align-middle")} aria-label={t.lessonEdit.selected} />
                            ) : (
                                <th className={numHeadClass}>{t.wordBank.colNum}</th>
                            )}
                            {!isPicker && canMark && (
                                <th className={cn(th, "px-0.5 py-1.5 text-center align-middle w-8")}>
                                    {t.wordBank.colStar}
                                </th>
                            )}
                            <th className={th}>{t.wordBank.colSinoVietnamese}</th>
                            <th className={cn(th, "text-center")} colSpan={4}>
                                {t.wordBank.colHanChars}
                            </th>
                            {!isPicker && canMark && (
                                <th
                                    className={cn(
                                        th,
                                        "px-5 py-1.5 text-left align-middle text-[0.6875rem] font-semibold leading-tight whitespace-nowrap tracking-wide",
                                    )}
                                >
                                    {t.wordBank.colVietMeanings}
                                </th>
                            )}
                            <th className={cn(th, "text-center")}>{t.wordBank.colLevel}</th>
                            {!isPicker && <th className={cn(th, "px-0 text-center w-10")} />}
                        </tr>
                    </thead>
                    <tbody className="[&_tr:last-child]:border-b-0">
                        {loading ? (
                            <tr>
                                <td colSpan={colCount} className="p-0">
                                    <SkeletonTable rows={8} />
                                </td>
                            </tr>
                        ) : loadError ? (
                            <tr>
                                <td colSpan={colCount}>
                                    <p
                                        className="m-0 min-h-10 flex items-center justify-center text-center px-4 py-3 rounded-lg text-sm bg-error-bg text-error-text border border-error-border"
                                        role="alert"
                                    >
                                        {loadError}
                                    </p>
                                </td>
                            </tr>
                        ) : showEmpty ? (
                            <tr>
                                <td colSpan={colCount}>
                                    {emptyMessage === "ADD_NEW_PROMPT" ? (
                                        <div className="min-h-10 flex flex-col items-center justify-center gap-2 py-3 text-center">
                                            <p className="m-0 text-sm text-text-muted">{t.wordBank.noSearchMatch}</p>
                                            <button
                                                type="button"
                                                className="text-sm font-medium text-accent hover:text-accent-hover underline underline-offset-2 transition-colors"
                                                onClick={() => onAddNew(search)}
                                            >
                                                {fmt(t.lessonEdit.addToLessonAndBank, { word: search })}
                                            </button>
                                        </div>
                                    ) : (
                                        <p className="m-0 min-h-10 flex items-center justify-center text-center text-sm text-text-muted">
                                            {emptyMessage}
                                        </p>
                                    )}
                                </td>
                            </tr>
                        ) : (
                            rows
                        )}
                        {!loading && placeholderRows}
                    </tbody>
                </table>
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
