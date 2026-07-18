import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../store/localeStore.js";
import { useAppActions, useWords } from "../store/appStore.js";
import { normalizeWordFields } from "../lib/wordNormalize.js";
import { normalizeSearchText } from "../lib/wordSearch.js";
import { withAdminHint } from "../lib/emptyMessage.js";
import { saveWordBankReturnState, clearWordBankReturnState, restoreWordBankScroll } from "../lib/wordBankReturn.js";
import { useConfirmDialog } from "../hooks/useConfirmDialog.jsx";
import { useIsAdmin, useIsSignedIn } from "../store/authStore.js";
import { PAGE_SIZE } from "../lib/constants.js";
import { patchWordInBrowseCache } from "../lib/wordBrowseCache.js";
import { cn } from "../lib/cn.js";
import { Pagination } from "./Pagination.jsx";
import { WordRow } from "./WordRow.jsx";

const thClass =
    "text-left border-b border-border align-middle truncate bg-bg text-text-muted font-medium text-sm uppercase tracking-wide";

const thClassBank = "px-3.5 py-2.5";
const thClassPicker = "px-3 py-2";
const tdPicker = "[&_td]:px-3 [&_td]:py-2";

export const WordBankBrowseTable = memo(function WordBankBrowseTable({
    variant = "bank",
    search,
    filter,
    sortKey,
    sortDir,
    onView,
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
    const isAdmin = useIsAdmin();
    const isSignedIn = useIsSignedIn();
    const canEdit = !isPicker && isAdmin;
    const canMark = !isPicker && isSignedIn;
    const storeWords = useWords();
    const { editWord, removeWord, toggleImportant, toggleMastered } = useAppActions();
    const { ask, dialog } = useConfirmDialog();
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

    useEffect(() => {
        setItems((current) => {
            const byId = new Map(storeWords.map((w) => [w.id, w]));
            let changed = false;
            const next = current.map((item) => {
                const fromStore = byId.get(item.id);
                if (!fromStore) return item;
                const updated = {
                    ...item,
                    english: fromStore.english,
                    hanTraditional: fromStore.hanTraditional,
                    vietnamese: fromStore.vietnamese,
                    hanViet: fromStore.hanViet,
                    jyutping: fromStore.jyutping,
                    vietnameseDetail: fromStore.vietnameseDetail,
                    important: fromStore.important,
                    mastered: fromStore.mastered,
                    popularity: fromStore.popularity,
                };
                if (
                    updated.english === item.english &&
                    updated.hanTraditional === item.hanTraditional &&
                    updated.vietnamese === item.vietnamese &&
                    updated.hanViet === item.hanViet &&
                    updated.jyutping === item.jyutping &&
                    updated.vietnameseDetail === item.vietnameseDetail &&
                    updated.important === item.important &&
                    updated.mastered === item.mastered &&
                    updated.popularity === item.popularity
                ) {
                    return item;
                }
                changed = true;
                return updated;
            });
            return changed ? next : current;
        });
    }, [storeWords]);

    const handleEditWord = useCallback(
        (word, patch) => {
            const merged = normalizeWordFields({ ...word, ...patch });
            setItems((current) => current.map((item) => (item.id === word.id ? { ...item, ...merged } : item)));
            patchWordInBrowseCache(word.id, {
                english: merged.english,
                hanTraditional: merged.hanTraditional,
                vietnamese: merged.vietnamese,
                hanViet: merged.hanViet,
                jyutping: merged.jyutping,
                vietnameseDetail: merged.vietnameseDetail,
            });
            editWord(word, patch);
        },
        [editWord],
    );

    const handleDelete = useCallback(
        (word) => {
            const label =
                [word.hanTraditional, word.english || word.vietnamese].filter(Boolean).join(" · ") || word.hanViet;
            ask({
                title: t.confirm.deleteTitle,
                message: fmt(t.confirm.deleteWord, { label }),
                onConfirm: () => removeWord(word.id),
            });
        },
        [ask, fmt, t, removeWord],
    );

    const handleToggleImportant = useCallback(
        (word) => {
            const nextImportant = !word.important;
            if (filter === "important" && !nextImportant) {
                setTotal((current) => {
                    const next = Math.max(0, current - 1);
                    onTotalChange?.(next);
                    return next;
                });
            }
            toggleImportant(word);
        },
        [filter, onTotalChange, toggleImportant],
    );

    const handleToggleMastered = useCallback(
        (word) => {
            const nextMastered = !word.mastered;
            if (filter === "mastered" && !nextMastered) {
                setTotal((current) => {
                    const next = Math.max(0, current - 1);
                    onTotalChange?.(next);
                    return next;
                });
            }
            toggleMastered(word);
        },
        [filter, onTotalChange, toggleMastered],
    );

    const displayItems = useMemo(() => {
        if (filter === "important") return items.filter((word) => word.important);
        if (filter === "mastered") return items.filter((word) => word.mastered);
        return items;
    }, [items, filter]);

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
        [isPicker, onView, page, search, filter, sortKey, sortDir],
    );

    useEffect(() => {
        if (skipPageResetRef.current) {
            skipPageResetRef.current = false;
            return;
        }
        setPage(1);
    }, [search, filter, sortKey, sortDir]);

    // Client-side filter + sort + paginate from store data
    useEffect(() => {
        let filtered = storeWords;

        // Filter
        if (filter === "important") filtered = filtered.filter((w) => w.important);
        else if (filter === "mastered") filtered = filtered.filter((w) => w.mastered);

        // Client-side text search — use pre-built _searchBlob with normalized query
        const q = normalizeSearchText(search);
        if (q) {
            filtered = filtered.filter((w) => {
                if (w._searchBlob && w._searchBlob.includes(q)) return true;
                // Fallback: also check raw fields (handles edge cases where _searchBlob is missing)
                const haystack = [
                    w.hanTraditional,
                    w.hanSimplified,
                    w.english,
                    w.vietnamese,
                    w.hanViet,
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
        const getMatchScore = (word) => {
            const fields = [
                word.jyutping,
                word.hanTraditional,
                word.hanSimplified,
                word.english,
                word.vietnamese,
                word.hanViet,
                word.pinyin,
            ];
            let best = 0;
            for (const raw of fields) {
                const v = normalizeSearchText(raw ?? "");
                if (!v) continue;
                if (v === q) { best = Math.max(best, 3); }
                else if (v.startsWith(q)) { best = Math.max(best, 2); }
                else if (v.includes(q)) { best = Math.max(best, 1); }
            }
            return best;
        };

        // Sort — when searching, rank by: 1) match relevance, 2) fewer chars, 3) sortKey
        const sorted = [...filtered].sort((a, b) => {
            if (q) {
                const aScore = getMatchScore(a);
                const bScore = getMatchScore(b);
                if (aScore !== bScore) return bScore - aScore; // higher score first
                // Tiebreaker: fewer characters first
                const aLen = (a.hanTraditional ?? "").length;
                const bLen = (b.hanTraditional ?? "").length;
                if (aLen !== bLen) return aLen - bLen;
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
    }, [page, search, filter, sortKey, sortDir, storeWords, onTotalChange]);

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
    const colCount = isPicker ? 6 : 6 + (canMark ? 2 : 0) + (canEdit ? 1 : 0);
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
        if (hasQuery && isPicker && onAddNew) return 'ADD_NEW_PROMPT';
        if (hasQuery) return emptyNoMatch ?? t.wordBank.noSearchMatch;
        if (isPicker) return emptyHint ?? t.lessonEdit.searchBankHint;
        return withAdminHint(t.wordBank.empty, t.wordBank.emptyAdminHint, canEdit);
    }, [loadError, hasQuery, emptyNoMatch, emptyHint, isPicker, t, canEdit, onAddNew]);

    const rows = useMemo(() => {
        return displayItems.map((word, i) => (
            <WordRow
                key={word.id}
                word={word}
                index={startIndex + i}
                canEdit={canEdit}
                canMark={canMark}
                pickerMode={isPicker}
                selected={selected?.has(String(word.id))}
                onToggleSelect={onToggleSelect}
                onSave={handleEditWord}
                onDelete={handleDelete}
                onToggleImportant={handleToggleImportant}
                onToggleMastered={handleToggleMastered}
                onView={handleViewWord}
            />
        ));
    }, [
        displayItems,
        startIndex,
        canEdit,
        canMark,
        isPicker,
        selected,
        onToggleSelect,
        handleEditWord,
        handleDelete,
        handleToggleImportant,
        handleToggleMastered,
        handleViewWord,
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
                    "overflow-auto border border-border rounded-xl bg-surface",
                    !isPicker && "w-full max-w-full overflow-x-auto",
                    isPicker && tdPicker,
                )}
            >
                <table className={cn("w-full border-collapse text-base table-auto", isPicker && tdPicker)}>
                    <colgroup>
                        {isPicker ? <col className="w-9" /> : <col />}
                        {!isPicker && canMark && <col className="w-8" />}
                        <col />
                        <col />
                        <col />
                        <col />
                        <col />
                        {!isPicker && canMark && <col className="w-[4.75rem]" />}
                        {!isPicker && canEdit && <col className="w-16" />}
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
                            <th className={th}>{t.wordBank.colHanViet}</th>
                            <th className={th}>{t.wordBank.colHanTraditional}</th>
                            <th className={th}>{t.wordBank.colJyutping}</th>
                            <th className={th}>{t.wordBank.colVietnamese}</th>
                            <th className={th}>{t.wordBank.colEnglish}</th>
                            {!isPicker && canMark && (
                                <th
                                    className={cn(
                                        th,
                                        "px-2 py-1.5 text-center align-middle text-[0.6875rem] font-semibold leading-tight whitespace-nowrap tracking-wide",
                                    )}
                                >
                                    {t.wordBank.colMastered}
                                </th>
                            )}
                            {!isPicker && canEdit && (
                                <th
                                    className={cn(th, "px-0.5 py-1.5 text-center align-middle text-sm leading-none")}
                                    aria-label={t.common.actions}
                                    title={t.common.actions}
                                >
                                    ✎
                                </th>
                            )}
                        </tr>
                    </thead>
                    <tbody className="[&_tr:last-child]:border-b-0">
                        {loading ? (
                            <tr>
                                <td colSpan={colCount}>
                                    <p className="m-0 min-h-10 flex items-center justify-center text-center text-sm text-text-muted">
                                        {t.common.loading}
                                    </p>
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
                                    {emptyMessage === 'ADD_NEW_PROMPT' ? (
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
            {!isPicker && dialog}
        </>
    );
});
