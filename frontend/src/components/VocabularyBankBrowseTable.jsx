import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SEARCH_DEBOUNCE_MS } from "../lib/timing.js";
import { useLocale } from "../store/localeStore.js";
import { useAppActions, useLanguage, useVocabularies, useVocabularySets } from "../store/appStore.js";
import { normalizeSearchText } from "../lib/wordSearch.js";
import { saveWordBankReturnState, clearWordBankReturnState, restoreWordBankScroll } from "../lib/wordBankReturn.js";
import { useIsSignedIn, useIsAdmin } from "../store/authStore.js";
import { PAGE_SIZE } from "../lib/constants.js";
import { cn } from "../lib/cn.js";
import { flexRender, useTable } from "@tanstack/react-table";
import { features } from "./data-table-features.js";
import { Button } from "./shadcn/button.jsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./shadcn/dropdown-menu.jsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./shadcn/select.jsx";
import { BankSearchInput } from "./BankSearchInput.jsx";
import { DataTableFacetedFilter } from "./DataTableFacetedFilter.jsx";
import { DataTablePagination } from "./DataTablePagination.jsx";
import { DataTableViewOptions } from "./DataTableViewOptions.jsx";
import { buildVocabularyRowColumns } from "./VocabularyRowColumns.jsx";
import { SkeletonTable } from "./ui/Skeleton.jsx";
import { ConfirmDialog } from "./ConfirmDialog.jsx";
import { toast } from "./shadcn/toast.jsx";
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
    hanLen: "hanLen", // sort theo SỐ LƯỢNG hán tự của từ vựng (cột ẩn)
    viet: "vietMeanings",
    eng: "engMeanings",
    hsk: "hskLevel",
    created: "createdAt",
    updated: "updatedAt",
};
const SORT_KEY_TO_COL_ID = Object.fromEntries(Object.entries(COL_ID_TO_SORT_KEY).map(([k, v]) => [v, k]));

const HSK_VALUES = ["YSK", "HSK 1", "HSK 2", "HSK 3", "HSK 4", "HSK 5", "HSK 6", "HSK 7-9"];

/** Prefs lưu "1".."7-9" (legacy) hoặc "HSK 1".."HSK 7-9" (mới) → giá trị faceted. */
function seedHskFilter(v) {
    if (!v || v === "all") return null;
    return HSK_VALUES.includes(v) ? v : `HSK ${v}`;
}

export const VocabularyBankBrowseTable = memo(function VocabularyBankBrowseTable({
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
    onScan,
    onAdd,
}) {
    const { t, fmt } = useLocale();
    const isPicker = variant === "picker";
    const isSignedIn = useIsSignedIn();
    const canMark = false; // user_vocabularies đã bỏ (2026-08-17) — không còn đánh dấu yêu thích
    const isAdmin = useIsAdmin();
    // Hành động HÀNG LOẠT: "Thêm vào bộ" cần đăng nhập (bộ thẻ thuộc user),
    // "Xóa" chỉ admin (giống nút sửa/xóa từng dòng). Ẩn cả cột chọn dòng nếu
    // không có quyền nào → khách vãng lai không thấy checkbox vô dụng. (2026-09-20)
    const canBulkAddToSet = isSignedIn;
    const canBulkDelete = isAdmin;
    const canBulkSelect = canBulkAddToSet || canBulkDelete;
    const hasBulkActions = canBulkAddToSet || canBulkDelete || (isAdmin && (onScan || onAdd));
    const storeWords = useVocabularies();
    const language = useLanguage();
    const vocabSets = useVocabularySets();
    const setVocabularyIds = useMemo(
        () => Object.fromEntries(vocabSets.map((s) => [s.id, s.vocabularyIds])),
        [vocabSets],
    );
    const { removeVocabulary, addVocabularyToSet } = useAppActions();
    const restoredScrollRef = useRef(false);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

    useEffect(() => {
        setLoading(false);
        setLoadError(null);
    }, []);

    // ── TanStack Table state (native sort / filter / paginate / select / visibility) ──
    const [searchColumn, setSearchColumn] = useState(() => initial.searchColumn ?? "han");
    const [searchValue, setSearchValue] = useState(
        () => new URLSearchParams(window.location.search).get("q")?.trim() || restoreState?.search || "",
    );
    // Debounce search (rule 700ms — lib/timing.js) — tránh lọc lại toàn bộ từ vựng mỗi lần gõ.
    const [debouncedSearch, setDebouncedSearch] = useState(searchValue);
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(searchValue), SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(t);
    }, [searchValue]);
    // Query search chuẩn hóa — dùng cho prefix sort (cột hidden "search").
    const normalizedQuery = debouncedSearch ? normalizeSearchText(debouncedSearch) : "";
    const searchQuery = normalizedQuery;
    const [sorting, setSorting] = useState(() => {
        const key = restoreState?.sortKey ?? initial.sortKey;
        if (!key) return [];
        const id = SORT_KEY_TO_COL_ID[key] ?? key;
        // Cantonese không có cột cấp độ → bỏ sort cấp độ còn sót.
        if (language === "cantonese" && id === "hsk") return [];
        return [{ id, desc: (restoreState?.sortDir ?? initial.sortDir) === "desc" }];
    });
    const [columnFilters, setColumnFilters] = useState(() => {
        const filters = [];
        // Filter cấp độ CHỈ ở Mandarin (Cantonese không có level).
        if (language === "mandarin") {
            let hsk = seedHskFilter(initial.hskLevel);
            if (hsk === "YSK") hsk = null;
            if (hsk) filters.push({ id: "hsk", value: [hsk] });
        }
        if (initial.setId && initial.setId !== "all") filters.push({ id: "sets", value: [initial.setId] });
        return filters;
    });
    // Đổi sang Mandarin khi đang filter YSK → tự bỏ filter đó.
    useEffect(() => {
        if (language !== "mandarin") return;
        setColumnFilters((prev) =>
            prev.some((f) => f.id === "hsk" && f.value?.[0] === "YSK")
                ? prev.filter((f) => !(f.id === "hsk" && f.value?.[0] === "YSK"))
                : prev,
        );
    }, [language]);
    // Helper columns (search/sets/status) LUÔN ẩn — merge chồng lên setting đã lưu.
    const [columnVisibility, setColumnVisibility] = useState(() => ({
        search: false,
        sets: false,
        status: false,
        hanLen: false,
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

    const handleDelete = useCallback((word) => {
        setDeleteTarget(word);
    }, []);

    // Ref đọc searchValue MỚI NHẤT mà không khiến handleViewWord đổi tham chiếu mỗi keystroke.
    // Trước đây handleViewWord phụ thuộc searchValue → columns useMemo rebuild toàn bộ column
    // definitions mỗi lần gõ → LAG khi gõ search. (2026-08-17)
    const searchValueRef = useRef(searchValue);
    searchValueRef.current = searchValue;

    // Ref đọc `filter` hiện tại (pref word bank) — cần lưu vào return state để
    // wordBankReturnMatches(restore, browse) khớp, nếu không restore bị vứt bỏ → bảng
    // luôn nhảy về trang 1 khi quay lại từ trang chi tiết. (2026-08-23)
    const filterRef = useRef(initial.filter ?? "all");
    filterRef.current = initial.filter ?? "all";

    // Ref tới table instance (gán sau useTable) — để handleViewWord đọc thứ tự bảng hiện tại
    // (filtered + sorted rows) mà không phụ thuộc state → tránh rebuild columns.
    const tableRef = useRef(null);

    const handleViewWord = useCallback(
        (word) => {
            if (!isPicker && onView) {
                // Thứ tự bảng hiện tại = getSortedRowModel (đã filter + sort, chưa paginate).
                // ⚠️ KHÔNG dùng getFilteredRowModel — nó trả rows sau filter nhưng CHƯA sort
                // (pipeline: filter → sort → paginate) → "Từ tiếp theo" đi theo data gốc (random).
                const orderIds =
                    tableRef.current
                        ?.getSortedRowModel?.()
                        .rows.map((r) => String(r.original?.id))
                        .filter(Boolean) ?? [];
                saveWordBankReturnState({
                    wordId: word.id,
                    page: pagination.pageIndex + 1,
                    scrollY: window.scrollY,
                    search: searchValueRef.current,
                    filter: filterRef.current,
                    sortKey: sorting[0] ? (COL_ID_TO_SORT_KEY[sorting[0].id] ?? sorting[0].id) : "sinoVietnamese",
                    sortDir: sorting[0]?.desc ? "desc" : "asc",
                    searchColumn,
                    orderIds,
                });
                onView(word);
            }
        },
        [isPicker, onView, pagination.pageIndex, sorting, searchColumn],
    );

    const columns = useMemo(
        () =>
            buildVocabularyRowColumns({
                t,
                language,
                canMark,
                isPicker,
                selectable: !isPicker && canBulkSelect,
                sortable: !isPicker,
                startIndex: pagination.pageIndex * pagination.pageSize,
                selected,
                onToggleSelect,
                onView: handleViewWord,
                onEdit: isAdmin ? onEdit : undefined,
                onDelete: isAdmin ? handleDelete : undefined,
                searchColumn,
                searchQuery,
                setVocabularyIds,
                getDisplayIndex,
            }),
        [
            t,
            language,
            canMark,
            isPicker,
            canBulkSelect,
            pagination.pageIndex,
            pagination.pageSize,
            selected,
            onToggleSelect,
            handleViewWord,
            onEdit,
            isAdmin,
            handleDelete,
            searchColumn,
            searchQuery,
            setVocabularyIds,
            getDisplayIndex,
        ],
    );

    // Ưu tiên prefix match khi search (sortFn custom trên cột hidden "search").
    // Không tắt sort → pagination vẫn hoạt động. useMemo để state.sorting giữ
    // tham chiếu ỔN ĐỊNH giữa các render — nếu là mảng mới mỗi render, TanStack
    // pagination không advance được trang (đã reproduce).
    const effectiveSorting = useMemo(
        () => (normalizedQuery ? [{ id: "search", desc: false }, ...sorting] : sorting),
        [normalizedQuery, sorting],
    );

    const table = useTable({
        features,
        data: storeWords,
        columns,
        state: { sorting: effectiveSorting, columnFilters, columnVisibility, rowSelection, pagination },
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
    tableRef.current = table;
    useEffect(() => {
        tableRef.current
            ?.getColumn("search")
            ?.setFilterValue(debouncedSearch ? normalizeSearchText(debouncedSearch) : undefined);
    }, [debouncedSearch, searchColumn]);

    // ── Persist prefs (fire-and-forget, không sync ngược về state) ──
    const onStateChangeRef = useRef(onStateChange);
    onStateChangeRef.current = onStateChange;
    useEffect(() => {
        const cb = onStateChangeRef.current;
        if (!cb) return;
        const s = sorting[0];
        const f = Object.fromEntries(columnFilters.map((cf) => [cf.id, cf.value]));
        cb({
            sortKey: s ? (COL_ID_TO_SORT_KEY[s.id] ?? s.id) : "sinoVietnamese",
            sortDir: s?.desc ? "desc" : "asc",
            hskLevel: f.hsk?.[0] ?? "all",
            setId: f.sets?.[0] ?? "all",
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

    // Thao tác hàng loạt khi CHƯA chọn dòng → báo toast (nút không còn "chết" im lặng). (2026-09-20)
    const requireSelection = useCallback(() => {
        if (selectedWords.length > 0) return true;
        toast.add({
            type: "error",
            title: t.wordBank.selectRowsFirst,
            description: t.wordBank.selectRowsFirstHint,
        });
        return false;
    }, [selectedWords.length, t]);

    const addAllToSet = useCallback(
        (setIdTarget) => {
            if (!requireSelection()) return;
            for (const w of selectedWords) addVocabularyToSet(setIdTarget, w.id, language).catch(() => {});
            setRowSelection({});
        },
        [selectedWords, addVocabularyToSet, language, requireSelection],
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

    const hasQuery = debouncedSearch.trim().length > 0;
    // Debounce đang chạy (user vừa gõ, chưa áp filter) → hiện loading trong table body.
    const searching = searchValue !== debouncedSearch;
    const showEmpty = !loading && !searching && filteredTotal === 0;
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
    // Mandarin: không có cấp độ YSK → chỉ hiện HSK.
    const levelValues = language === "mandarin" ? HSK_VALUES.filter((v) => v !== "YSK") : HSK_VALUES;
    const hskOptions = levelValues.map((v) => ({ value: v, label: v }));
    const setOptions = vocabSets.map((s) => ({ value: s.id, label: s.name, dot: s.color || "#7c3aed" }));
    const toolbar = !isPicker && (
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
            <div className="flex flex-wrap items-center gap-2">
                <BankSearchInput
                    onChange={setSearchValue}
                    placeholder={t.wordBank.searchPlaceholder}
                    initialValue={searchValue}
                    className="w-48 min-w-40"
                />
                <Select value={searchColumn} onValueChange={setSearchColumn}>
                    <SelectTrigger aria-label={t.wordBank.searchIn} className="h-7 min-w-32">
                        <SelectValue>
                            {searchColumns.find((o) => o.value === searchColumn)?.label ?? searchColumn}
                        </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="min-w-56">
                        {searchColumns.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                                {o.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {language === "mandarin" && (
                    <DataTableFacetedFilter
                        column={table.getColumn("hsk")}
                        title={t.wordBank.levelFilter}
                        options={hskOptions}
                        className="min-w-28"
                    />
                )}
                {vocabSets.length > 0 && (
                    <DataTableFacetedFilter
                        column={table.getColumn("sets")}
                        title={t.vocabSets.filterLabel}
                        options={setOptions}
                        className="min-w-28"
                    />
                )}
                <DataTableViewOptions table={table} />
            </div>
            {hasBulkActions && (
                <div className="flex flex-wrap items-center gap-2">
                    {canBulkAddToSet && (
                        <DropdownMenu>
                            <DropdownMenuTrigger render={<Button variant="default" size="sm" className="min-w-28" />}>
                                {t.vocabSets.addToSet}
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                {vocabSets.length === 0 ? (
                                    <p className="px-3 py-2 text-xs italic text-muted-foreground">
                                        {t.vocabSets.empty}
                                    </p>
                                ) : (
                                    vocabSets.map((set) => (
                                        // ⚠️ Base UI Menu.Item KHÔNG hỗ trợ `onSelect` (API Radix) → dùng onClick.
                                        // Trước đây onSelect nên bấm vào bộ KHÔNG có gì xảy ra. (2026-09-20)
                                        <DropdownMenuItem key={set.id} onClick={() => addAllToSet(set.id)}>
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
                    )}
                    {canBulkDelete && (
                        <Button
                            variant="destructive"
                            size="sm"
                            className="bg-destructive! text-destructive-foreground! border-destructive! hover:enabled:bg-destructive/90! min-w-24"
                            onClick={() => {
                                if (!requireSelection()) return;
                                setBulkDeleteOpen(true);
                            }}
                        >
                            {t.common.delete}
                        </Button>
                    )}
                    {isAdmin && onScan && (
                        <Button type="button" variant="default" size="sm" onClick={onScan}>
                            {t.addWord.ocrScan}
                        </Button>
                    )}
                    {isAdmin && onAdd && (
                        <Button type="button" variant="default" size="sm" onClick={onAdd}>
                            + {t.wordBank.addWord}
                        </Button>
                    )}
                </div>
            )}
        </div>
    );

    const paginationEl = <DataTablePagination table={table} showSelection={!isPicker && canBulkSelect} />;

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
                        ) : searching ? (
                            <TableRow className="hover:bg-transparent">
                                <TableCell colSpan={colCount} className="p-0">
                                    <SkeletonTable rows={6} />
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
                                            word.favorite && "bg-primary/5",
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
                        {!loading && !searching && placeholderRows}
                    </TableBody>
                </Table>
            </div>
            {!isPicker && <div className="mt-3">{paginationEl}</div>}

            {deleteTarget && (
                <ConfirmDialog
                    title={t.confirm.deleteTitle}
                    message={fmt(t.confirm.deleteVocabulary, {
                        // 2026-08-18: fallback qua hanHongKong — từ Cantonese chỉ có Phồn thể HK.
                        label:
                            deleteTarget.hanTraditional ||
                            deleteTarget.hanSimplified ||
                            deleteTarget.hanHongKong ||
                            deleteTarget.id?.slice(0, 8) ||
                            "",
                    })}
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
