import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../store/localeStore.js";
import { useAppActions, useVocabularies, useHanCharacters, useVocabularySets } from "../store/appStore.js";
import { normalizeSearchText } from "../lib/wordSearch.js";
import { saveWordBankReturnState, clearWordBankReturnState, restoreWordBankScroll } from "../lib/wordBankReturn.js";
import { useIsSignedIn, useIsAdmin } from "../store/authStore.js";
import { PAGE_SIZE } from "../lib/constants.js";
import { cn } from "../lib/cn.js";
import { setHanStrokeMap } from "../lib/hanStroke.js";
import { flexRender, useTable } from "@tanstack/react-table";
import { features } from "./data-table-features.js";
import { Button } from "./shadcn/button.jsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./shadcn/dropdown-menu.jsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./shadcn/select.jsx";
import { BankSearchInput } from "./BankSearchInput.jsx";
import { DataTableFacetedFilter } from "./DataTableFacetedFilter.jsx";
import { DataTablePagination } from "./DataTablePagination.jsx";
import { DataTableViewOptions } from "./DataTableViewOptions.jsx";
import { buildWordRowColumns } from "./wordRowColumns.jsx";
import { SkeletonTable } from "./ui/Skeleton.jsx";
import { ConfirmDialog } from "./ConfirmDialog.jsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./shadcn/table.jsx";

const thClass =
    "sticky top-0 z-10 text-left border-b border-border align-middle truncate bg-background text-muted-foreground font-medium text-sm uppercase tracking-wide";

const thClassBank = "px-5 py-2.5";
const thClassPicker = "px-3 py-2";
const tdPicker = "[&_td]:px-3 [&_td]:py-2";

/** Map id cột (TanStack) <-> sortKey (prefs/restore). */
const COL_ID_TO_SORT_KEY = {
    sino: "sinoVietnamese",
    han: "hanTraditional",
    viet: "vietMeanings",
    eng: "engMeanings",
    hsk: "hskLevel",
};
const SORT_KEY_TO_COL_ID = Object.fromEntries(Object.entries(COL_ID_TO_SORT_KEY).map(([k, v]) => [v, k]));

const HSK_VALUES = ["HSK 1", "HSK 2", "HSK 3", "HSK 4", "HSK 5", "HSK 6", "HSK 7-9"];

/** Prefs lưu "1".."7-9" (legacy) hoặc "HSK 1".."HSK 7-9" (mới) → giá trị faceted. */
function seedHskFilter(v) {
    if (!v || v === "all") return null;
    return HSK_VALUES.includes(v) ? v : `HSK ${v}`;
}

export const WordBankBrowseTable = memo(function WordBankBrowseTable({
    variant = "bank",
    initial = {},
    onStateChange,
    onView,
    onEdit,
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
    const vocabSets = useVocabularySets();
    const setVocabularyIds = useMemo(
        () => Object.fromEntries(vocabSets.map((s) => [s.id, s.vocabularyIds])),
        [vocabSets],
    );
    const { toggleImportant, toggleMastered, removeVocabulary, addVocabularyToSet } = useAppActions();
    const restoredScrollRef = useRef(false);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

    // Load char→strokeCount map từ store (han sort native dùng map này).
    useEffect(() => {
        setHanStrokeMap(hanCharacters);
    }, [hanCharacters]);

    useEffect(() => {
        setLoading(false);
        setLoadError(null);
    }, []);

    // ── TanStack Table state (native sort / filter / paginate / select / visibility) ──
    const [searchColumn, setSearchColumn] = useState(() => initial.searchColumn ?? "han");
    const [searchValue, setSearchValue] = useState(() => restoreState?.search ?? "");
    const [sorting, setSorting] = useState(() => {
        const key = restoreState?.sortKey ?? initial.sortKey;
        if (!key) return [];
        return [{ id: SORT_KEY_TO_COL_ID[key] ?? key, desc: (restoreState?.sortDir ?? initial.sortDir) === "desc" }];
    });
    const [columnFilters, setColumnFilters] = useState(() => {
        const filters = [];
        const hsk = seedHskFilter(initial.hskLevel);
        if (hsk) filters.push({ id: "hsk", value: [hsk] });
        if (initial.setId && initial.setId !== "all") filters.push({ id: "sets", value: [initial.setId] });
        const status = [];
        if (initial.showImportant) status.push("important");
        if (initial.showMastered) status.push("mastered");
        if (status.length) filters.push({ id: "status", value: status });
        return filters;
    });
    // Helper columns (search/sets/status) LUÔN ẩn — merge chồng lên setting đã lưu.
    const [columnVisibility, setColumnVisibility] = useState(() => ({
        search: false,
        sets: false,
        status: false,
        ...(initial.columnVisibility ?? {}),
    }));
    const [rowSelection, setRowSelection] = useState({});
    const [pagination, setPagination] = useState(() => {
        const page = typeof restoreState?.page === "number" && restoreState.page >= 1 ? restoreState.page : 1;
        return { pageIndex: page - 1, pageSize: initial.pageSize ?? PAGE_SIZE };
    });

    // v9: row.index = index trong core model (không phải trang) → dùng ref map
    // để hiển thị số thứ tự đúng theo trang hiện tại (populate sau khi tạo table).
    const indexByRowIdRef = useRef({});
    const getDisplayIndex = useCallback((row) => indexByRowIdRef.current[String(row.original?.id)] ?? 0, []);

    const handleToggleImportant = useCallback((word) => toggleImportant(word), [toggleImportant]);
    const handleToggleMastered = useCallback((word) => toggleMastered(word), [toggleMastered]);

    const handleDelete = useCallback((word) => {
        setDeleteTarget(word);
    }, []);

    const handleViewWord = useCallback(
        (word) => {
            if (!isPicker && onView) {
                saveWordBankReturnState({
                    wordId: word.id,
                    page: pagination.pageIndex + 1,
                    scrollY: window.scrollY,
                    search: searchValue,
                    sortKey: sorting[0] ? (COL_ID_TO_SORT_KEY[sorting[0].id] ?? sorting[0].id) : "sinoVietnamese",
                    sortDir: sorting[0]?.desc ? "desc" : "asc",
                    searchColumn,
                });
                onView(word);
            }
        },
        [isPicker, onView, pagination.pageIndex, searchValue, sorting, searchColumn],
    );

    const columns = useMemo(
        () =>
            buildWordRowColumns({
                t,
                canMark,
                isPicker,
                selectable: !isPicker,
                sortable: !isPicker,
                startIndex: pagination.pageIndex * pagination.pageSize,
                selected,
                onToggleSelect,
                onToggleImportant: handleToggleImportant,
                onToggleMastered: handleToggleMastered,
                onView: handleViewWord,
                onEdit: isAdmin ? onEdit : undefined,
                onDelete: isAdmin ? handleDelete : undefined,
                searchColumn,
                setVocabularyIds,
                getDisplayIndex,
            }),
        [
            t,
            canMark,
            isPicker,
            pagination.pageIndex,
            pagination.pageSize,
            selected,
            onToggleSelect,
            handleToggleImportant,
            handleToggleMastered,
            handleViewWord,
            onEdit,
            isAdmin,
            handleDelete,
            searchColumn,
            setVocabularyIds,
            getDisplayIndex,
        ],
    );

    const table = useTable({
        features,
        data: storeWords,
        columns,
        state: { sorting, columnFilters, columnVisibility, rowSelection, pagination },
        onSortingChange: setSorting,
        onColumnFiltersChange: setColumnFilters,
        onColumnVisibilityChange: setColumnVisibility,
        onRowSelectionChange: setRowSelection,
        onPaginationChange: setPagination,
        enableRowSelection: true,
        getRowId: (row) => String(row.id),
    });

    const pageRows = table.getRowModel().rows;
    const filteredTotal = table.getFilteredRowModel().rows.length;
    const startIndex = pagination.pageIndex * pagination.pageSize;

    pageRows.forEach((row, i) => {
        indexByRowIdRef.current[String(row.id)] = startIndex + i;
    });
    // Từ được chọn (toàn bộ kết quả lọc, không chỉ trang hiện tại).
    const selectedWords = table.getFilteredSelectedRowModel().rows.map((r) => r.original);

    // ── Search (native column filter trên hidden "search" column) ──
    const tableRef = useRef(null);
    tableRef.current = table;
    useEffect(() => {
        tableRef.current
            ?.getColumn("search")
            ?.setFilterValue(searchValue ? normalizeSearchText(searchValue) : undefined);
    }, [searchValue, searchColumn]);

    // ── Persist prefs (fire-and-forget, không sync ngược về state) ──
    const onStateChangeRef = useRef(onStateChange);
    onStateChangeRef.current = onStateChange;
    useEffect(() => {
        const cb = onStateChangeRef.current;
        if (!cb) return;
        const s = sorting[0];
        const f = Object.fromEntries(columnFilters.map((cf) => [cf.id, cf.value]));
        const status = f.status ?? [];
        cb({
            sortKey: s ? (COL_ID_TO_SORT_KEY[s.id] ?? s.id) : "sinoVietnamese",
            sortDir: s?.desc ? "desc" : "asc",
            hskLevel: f.hsk?.[0] ?? "all",
            setId: f.sets?.[0] ?? "all",
            showImportant: status.includes("important"),
            showMastered: status.includes("mastered"),
            searchColumn,
            columnVisibility,
            pageSize: pagination.pageSize,
        });
    }, [sorting, columnFilters, searchColumn, columnVisibility, pagination.pageSize]);

    const confirmDelete = useCallback(() => {
        if (deleteTarget) {
            removeVocabulary(deleteTarget.id);
            setDeleteTarget(null);
        }
    }, [deleteTarget, removeVocabulary]);

    const confirmBulkDelete = useCallback(() => {
        for (const w of selectedWords) removeVocabulary(w.id);
        setRowSelection({});
        setBulkDeleteOpen(false);
    }, [selectedWords, removeVocabulary]);

    const addAllToSet = useCallback(
        (setIdTarget) => {
            for (const w of selectedWords) addVocabularyToSet(setIdTarget, w.id).catch(() => {});
            setRowSelection({});
        },
        [selectedWords, addVocabularyToSet],
    );

    // ── Restore scroll khi quay lại từ trang detail ──
    useEffect(() => {
        if (isPicker || !restoreState || restoredScrollRef.current || loading) return;
        if (pageRows.length === 0 && !loadError) return;

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
    }, [isPicker, restoreState, loading, pageRows, loadError]);

    const hasQuery = searchValue.trim().length > 0;
    const showEmpty = !loading && filteredTotal === 0;
    const colCount = columns.length;
    const placeholderCount = Math.max(0, PAGE_SIZE - (showEmpty ? 1 : pageRows.length));

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

    const th = cn(thClass, isPicker ? thClassPicker : thClassBank);

    const headerClassFor = (id) => {
        const base = th;
        switch (id) {
            case "select":
                return cn(base, "px-2 text-center align-middle w-10");
            case "index":
                return cn(
                    base,
                    "text-muted-foreground text-[0.8125rem] whitespace-nowrap text-center px-1.5",
                    !isPicker && "pr-0.5",
                );
            case "star":
                return cn(base, "px-0.5 py-1.5 text-center align-middle w-8");
            case "sino":
                return cn(base, "w-30");
            case "han":
                return cn(base, "text-center");
            case "viet":
            case "eng":
                return cn(
                    base,
                    "px-5 py-1.5 text-left align-middle text-[0.6875rem] font-semibold leading-tight whitespace-nowrap tracking-wide",
                );
            case "hsk":
                return cn(base, "text-center");
            case "actions":
                return cn(base, "px-0 text-center w-10");
            default:
                return base;
        }
    };

    // ── Toolbar (bank mode) — search + faceted filters + column toggle + bulk actions ──
    const searchColumns = [
        { value: "han", label: t.wordBank.colHanChars },
        { value: "sinoVietnamese", label: t.wordBank.colSinoVietnamese },
        { value: "meaning", label: t.wordBank.colMeaning },
    ];
    const hskOptions = HSK_VALUES.map((v) => ({ value: v, label: v }));
    const setOptions = vocabSets.map((s) => ({ value: s.id, label: s.name, dot: s.color || "#7c3aed" }));
    const statusOptions = [
        { value: "important", label: t.wordBank.filterImportant },
        { value: "mastered", label: t.wordBank.filterMastered },
    ];

    const toolbar = !isPicker && (
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
            <div className="flex flex-wrap items-center gap-2">
                <BankSearchInput
                    onChange={setSearchValue}
                    placeholder={t.wordBank.searchPlaceholder}
                    initialValue={restoreState?.search ?? ""}
                    className="w-48 min-w-40"
                />
                <Select value={searchColumn} onValueChange={setSearchColumn}>
                    <SelectTrigger aria-label={t.wordBank.searchIn} className="h-7 min-w-28">
                        <SelectValue>
                            {searchColumns.find((o) => o.value === searchColumn)?.label ?? searchColumn}
                        </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        {searchColumns.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                                {o.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <DataTableFacetedFilter
                    column={table.getColumn("hsk")}
                    title={t.wordBank.levelFilter}
                    options={hskOptions}
                    className="min-w-28"
                />
                {vocabSets.length > 0 && (
                    <DataTableFacetedFilter
                        column={table.getColumn("sets")}
                        title={t.vocabSets.filterLabel}
                        options={setOptions}
                        className="min-w-28"
                    />
                )}
                <DataTableFacetedFilter
                    column={table.getColumn("status")}
                    title={t.wordBank.statusFilter}
                    options={statusOptions}
                    className="min-w-28"
                />
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="min-w-28" />}>
                        {t.vocabSets.addToSet}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        {vocabSets.length === 0 ? (
                            <p className="px-3 py-2 text-xs italic text-muted-foreground">{t.vocabSets.empty}</p>
                        ) : (
                            vocabSets.map((set) => (
                                <DropdownMenuItem
                                    key={set.id}
                                    disabled={selectedWords.length === 0}
                                    onSelect={() => addAllToSet(set.id)}
                                >
                                    <span
                                        className="size-2.5 rounded-full shrink-0"
                                        style={{ background: set.color || "#7c3aed" }}
                                    />
                                    {set.name}
                                </DropdownMenuItem>
                            ))
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
                <Button
                    variant="destructive"
                    size="sm"
                    className="min-w-24"
                    disabled={selectedWords.length === 0}
                    onClick={() => setBulkDeleteOpen(true)}
                >
                    {t.common.delete}
                </Button>
                <DataTableViewOptions table={table} />
            </div>
        </div>
    );

    const paginationEl = <DataTablePagination table={table} showSelection={!isPicker} />;

    return (
        <>
            {isPicker && <div className="border-t border-border px-3 pt-2 pb-3">{paginationEl}</div>}
            {toolbar}
            <div
                className={cn(
                    "overflow-y-auto overflow-x-visible border border-border rounded-xl bg-card shadow-sm",
                    !isPicker && "w-full max-w-full",
                    isPicker && tdPicker,
                )}
            >
                <Table className={cn("border-collapse text-base table-auto", isPicker && tdPicker)}>
                    <colgroup>
                        {columns.map((c) => (
                            <col
                                key={c.id}
                                className={
                                    c.id === "index"
                                        ? isPicker
                                            ? "w-9"
                                            : undefined
                                        : c.id === "star"
                                          ? "w-8"
                                          : undefined
                                }
                            />
                        ))}
                    </colgroup>
                    <TableHeader>
                        {table.getHeaderGroups().map((hg) => (
                            <TableRow key={hg.id} className="hover:bg-transparent">
                                {hg.headers.map((h) => {
                                    const id = h.column.id;
                                    return (
                                        <TableHead
                                            key={h.id}
                                            className={headerClassFor(id)}
                                            {...(id === "index" && isPicker ? { "aria-label": t.picker.selected } : {})}
                                        >
                                            {h.isPlaceholder
                                                ? null
                                                : flexRender(h.column.columnDef.header, h.getContext())}
                                        </TableHead>
                                    );
                                })}
                            </TableRow>
                        ))}
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
                                                onClick={() => onAddNew(searchValue)}
                                            >
                                                {fmt(t.picker.addNew, { word: searchValue })}
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
                            pageRows.map((row) => {
                                const word = row.original;
                                return (
                                    <TableRow
                                        key={row.id}
                                        data-word-id={String(word.id)}
                                        data-state={row.getIsSelected() ? "selected" : undefined}
                                        className={cn(
                                            "border-b border-border",
                                            "data-[state=selected]:bg-muted",
                                            isPicker && "cursor-pointer hover:bg-background",
                                            isPicker &&
                                                selected?.has(String(word.id)) &&
                                                "bg-primary/10 hover:bg-primary/10",
                                            !isPicker && "transition-colors hover:bg-background/60",
                                            !isPicker && onView && "cursor-pointer",
                                            word.important && "bg-orange-600/4",
                                            word.mastered && "opacity-75",
                                        )}
                                        onClick={
                                            isPicker
                                                ? () => onToggleSelect?.(String(word.id))
                                                : handleViewWord
                                                  ? () => handleViewWord(word)
                                                  : undefined
                                        }
                                    >
                                        {row.getVisibleCells().map((cell) => (
                                            <TableCell key={cell.id} className={cell.column.columnDef.meta?.className}>
                                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                );
                            })
                        )}
                        {!loading && placeholderRows}
                    </TableBody>
                </Table>
            </div>
            {!isPicker && <div className="mt-3">{paginationEl}</div>}

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

            {bulkDeleteOpen && (
                <ConfirmDialog
                    title={t.confirm.bulkDeleteTitle}
                    message={fmt(t.confirm.bulkDeleteVocabulary, { count: selectedWords.length })}
                    confirmLabel={t.confirm.deleteYes}
                    cancelLabel={t.common.cancel}
                    onConfirm={confirmBulkDelete}
                    onCancel={() => setBulkDeleteOpen(false)}
                    danger
                />
            )}
        </>
    );
});
