import { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api } from "../lib/api.js";
import { logError } from "../lib/actionLog.js";
import { useDebouncedValue } from "../hooks/useDebouncedValue.js";
import { AddHanCharacterModal } from "../components/AddHanCharacterModal.jsx";
import { HanCharacterRow } from "../components/HanCharacterRow.jsx";
import { BankSearchInput } from "../components/BankSearchInput.jsx";
import { Pagination } from "../components/Pagination.jsx";
import { useConfirmDialog } from "../hooks/useConfirmDialog.jsx";
import { cn } from "../lib/cn.js";
import { useLocale } from "../store/localeStore.js";
import { useAppActions, useHanCharacters } from "../store/appStore.js";
import { Button } from "../components/shadcn/button.jsx";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "../components/shadcn/select.jsx";
import { SkeletonTable } from "../components/ui/Skeleton.jsx";
import { Spinner } from "../components/shadcn/spinner.jsx";
import { bankToolbarRowClass } from "../components/ui/bankToolbarStyles.js";
import { invalidateHanCharacterBrowseCache } from "../lib/hanCharacterBrowseCache.js";
import { invalidateDataCache } from "../lib/dataCache.js";
import { PAGE_SIZE } from "../lib/constants.js";

const FILTER_OPTIONS = [
    { value: "all", labelKey: "filterAll" },
    { value: "important", labelKey: "filterImportant" },
    { value: "mastered", labelKey: "filterMastered" },
];

const SORT_OPTIONS = [
    { value: "createdAt", labelKey: "sortDate" },
    { value: "hanSimplified", labelKey: "sortHanSimplified" },
];

export function HanCharactersPage() {
    const { isAdmin } = useOutletContext();
    const { t, fmt } = useLocale();
    const { ask, dialog } = useConfirmDialog();

    const storeHanCharacters = useHanCharacters();
    const { mergeHanCharacters, removeHanCharacter, refreshHanCharacters } = useAppActions();

    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [hanTraditionalCount, setHanTraditionalCount] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const debouncedSearch = useDebouncedValue(search, 300);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [addOpen, setAddOpen] = useState(false);
    const [editItem, setEditItem] = useState(null);
    const [filter, setFilter] = useState("all");
    const [sortKey, setSortKey] = useState("createdAt");
    const [sortDir, setSortDir] = useState("desc");

    // Reset page when filter/search/sort changes
    useEffect(() => {
        setPage(1);
    }, [debouncedSearch, filter, sortKey, sortDir]);

    // Data: always client-side from store data
    useEffect(() => {
        let filtered = storeHanCharacters;

        // Filter
        if (filter === "important") filtered = filtered.filter((h) => h.important);
        else if (filter === "mastered") filtered = filtered.filter((h) => h.mastered);

        // Client-side text search
        const q = debouncedSearch.trim().toLowerCase();
        if (q) {
            filtered = filtered.filter((h) => {
                const haystack = [h.hanSimplified, h.hanTraditional, h.sinoVietnamese, h.pinyin, h.jyutping]
                    .flat()
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase();
                return haystack.includes(q);
            });
        }

        const tradCount = storeHanCharacters.filter((h) => h.hanTraditional).length;

        // Sort
        const sorted = [...filtered].sort((a, b) => {
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
        setHanTraditionalCount(tradCount);
        setLoading(false);
        setLoadError(null);
    }, [page, debouncedSearch, filter, sortKey, sortDir, storeHanCharacters]);

    // Clamp page when beyond total
    useEffect(() => {
        if (loading) return;
        if (page > totalPages) setPage(totalPages);
    }, [page, totalPages, loading]);

    const handleCreate = useCallback(
        async (item) => {
            try {
                const created = await api.createHanCharacter(item);
                invalidateHanCharacterBrowseCache();
                mergeHanCharacters([created]);
                setPage(1);
            } catch (err) {
                logError("Create han character failed", err instanceof Error ? err.message : String(err));
            }
        },
        [mergeHanCharacters],
    );

    const handleUpdate = useCallback(
        async (existing, patch) => {
            try {
                const updated = await api.updateHanCharacter(existing.id, {
                    ...existing,
                    ...patch,
                });

                invalidateHanCharacterBrowseCache();
                mergeHanCharacters([updated]);
                setItems((prev) => prev.map((it) => (it.id === existing.id ? { ...it, ...updated } : it)));
            } catch (err) {
                logError("Update han character failed", err instanceof Error ? err.message : String(err));
            }
        },
        [mergeHanCharacters],
    );

    const handleDelete = useCallback(
        (item) => {
            const label = item.hanSimplified || item.sinoVietnamese || item.id;
            ask({
                title: t.confirm.deleteTitle,
                message: fmt(t.hanCharacters.deleteConfirm, { label: String(label).slice(0, 20) }),
                onConfirm: async () => {
                    try {
                        await api.deleteHanCharacter(item.id);
                        invalidateHanCharacterBrowseCache();
                        invalidateDataCache();
                        removeHanCharacter(item.id);
                        setItems((prev) => prev.filter((it) => it.id !== item.id));
                        setTotal((t) => Math.max(0, t - 1));
                    } catch (err) {
                        logError("Delete han character failed", err instanceof Error ? err.message : String(err));
                    }
                },
            });
        },
        [ask, t, fmt, removeHanCharacter],
    );

    const handleSave = useCallback(
        (item) => {
            if (item.id && editItem?.id) {
                handleUpdate(editItem, item);
            } else {
                handleCreate(item);
            }
            setEditItem(null);
        },
        [editItem, handleCreate, handleUpdate],
    );

    const openAdd = useCallback(() => {
        setEditItem(null);
        setAddOpen(true);
    }, []);

    const [syncingHanChars, setSyncingHanChars] = useState(false);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [preview, setPreview] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState("");
    const [syncMode, setSyncMode] = useState("fast"); // "fast" | "full"
    const [progress, setProgress] = useState(null); // { job, percent }
    const [progressTimer, setProgressTimer] = useState(null);

    // Poll job progress until done
    const pollProgress = useCallback(
        async (jobId) => {
            const poll = async () => {
                try {
                    const res = await api.syncHanCharactersProgress(jobId);
                    const job = res?.job;
                    if (!job) return;
                    const percent = job.total > 0 ? Math.round((job.processed / job.total) * 100) : 0;
                    setProgress({ job, percent });
                    if (job.done) {
                        if (progressTimer) clearInterval(progressTimer);
                        setProgressTimer(null);
                        setSyncingHanChars(false);
                        invalidateHanCharacterBrowseCache();
                        invalidateDataCache();
                        await refreshHanCharacters();
                    }
                } catch (err) {
                    logError("Poll sync progress failed", err instanceof Error ? err.message : String(err));
                }
            };
            await poll();
            const timer = setInterval(poll, 1500);
            setProgressTimer(timer);
        },
        [progressTimer, refreshHanCharacters],
    );

    const openPreview = useCallback(
        async (mode = "fast") => {
            if (syncingHanChars) return;
            setSyncMode(mode);
            setPreviewOpen(true);
            setPreviewLoading(true);
            setPreviewError("");
            try {
                const res = await api.previewSyncHanCharacters(mode);
                setPreview(res);
            } catch (err) {
                setPreviewError(err instanceof Error ? err.message : String(err));
            } finally {
                setPreviewLoading(false);
            }
        },
        [syncingHanChars],
    );

    const closePreview = useCallback(() => {
        setPreviewOpen(false);
        setPreview(null);
    }, []);

    const confirmSync = useCallback(async () => {
        setPreviewOpen(false);
        setPreview(null);
        setSyncingHanChars(true);
        setProgress(null);
        try {
            const res = await api.syncHanCharacters(syncMode);
            if (res?.jobId) {
                await pollProgress(res.jobId);
            } else {
                // Fallback: no job → treat as immediate
                invalidateHanCharacterBrowseCache();
                invalidateDataCache();
                await refreshHanCharacters();
                setSyncingHanChars(false);
            }
        } catch (err) {
            logError("Sync han characters failed", err instanceof Error ? err.message : String(err));
            setSyncingHanChars(false);
        }
    }, [pollProgress, refreshHanCharacters, syncMode]);

    // Clean up timer on unmount
    useEffect(() => {
        return () => {
            if (progressTimer) clearInterval(progressTimer);
        };
    }, [progressTimer]);

    // ── Sync stroke count ──
    const [syncingStrokes, setSyncingStrokes] = useState(false);
    const [strokePreviewOpen, setStrokePreviewOpen] = useState(false);
    const [strokePreview, setStrokePreview] = useState(null);
    const [strokePreviewLoading, setStrokePreviewLoading] = useState(false);
    const [strokePreviewError, setStrokePreviewError] = useState("");
    const [strokeMode, setStrokeMode] = useState("fast"); // "fast" | "full"
    const [strokeProgress, setStrokeProgress] = useState(null); // { job, percent }
    const [strokeTimer, setStrokeTimer] = useState(null);

    const pollStrokeProgress = useCallback(
        async (jobId) => {
            const poll = async () => {
                try {
                    const res = await api.syncHanCharStrokesProgress(jobId);
                    const job = res?.job;
                    if (!job) return;
                    const percent = job.total > 0 ? Math.round((job.processed / job.total) * 100) : 0;
                    setStrokeProgress({ job, percent });
                    if (job.done) {
                        if (strokeTimer) clearInterval(strokeTimer);
                        setStrokeTimer(null);
                        setSyncingStrokes(false);
                        invalidateHanCharacterBrowseCache();
                        invalidateDataCache();
                        await refreshHanCharacters();
                    }
                } catch (err) {
                    logError("Poll stroke sync progress failed", err instanceof Error ? err.message : String(err));
                }
            };
            await poll();
            const timer = setInterval(poll, 1500);
            setStrokeTimer(timer);
        },
        [strokeTimer, refreshHanCharacters],
    );

    const openStrokePreview = useCallback(
        async (mode = "fast") => {
            if (syncingStrokes) return;
            setStrokeMode(mode);
            setStrokePreviewOpen(true);
            setStrokePreviewLoading(true);
            setStrokePreviewError("");
            try {
                const res = await api.previewSyncHanCharStrokes(mode);
                setStrokePreview(res);
            } catch (err) {
                setStrokePreviewError(err instanceof Error ? err.message : String(err));
            } finally {
                setStrokePreviewLoading(false);
            }
        },
        [syncingStrokes],
    );

    const closeStrokePreview = useCallback(() => {
        setStrokePreviewOpen(false);
        setStrokePreview(null);
    }, []);

    const confirmStrokeSync = useCallback(async () => {
        setStrokePreviewOpen(false);
        setStrokePreview(null);
        setSyncingStrokes(true);
        setStrokeProgress(null);
        try {
            const res = await api.syncHanCharStrokes(strokeMode);
            if (res?.jobId) {
                await pollStrokeProgress(res.jobId);
            } else {
                invalidateHanCharacterBrowseCache();
                invalidateDataCache();
                await refreshHanCharacters();
                setSyncingStrokes(false);
            }
        } catch (err) {
            logError("Sync stroke count failed", err instanceof Error ? err.message : String(err));
            setSyncingStrokes(false);
        }
    }, [pollStrokeProgress, refreshHanCharacters, strokeMode]);

    useEffect(() => {
        return () => {
            if (strokeTimer) clearInterval(strokeTimer);
        };
    }, [strokeTimer]);

    const sortDirLabel =
        sortKey === "createdAt"
            ? sortDir === "asc"
                ? t.hanCharacters.sortDateAsc
                : t.hanCharacters.sortDateDesc
            : sortDir === "asc"
              ? t.hanCharacters.sortAsc
              : t.hanCharacters.sortDesc;

    return (
        <main className="flex-1 w-full mx-auto px-5 pt-8 pb-12">
            <div className="flex gap-6 items-start mx-auto">
                {/* ── Left Sidebar: Sync Tools ── */}
                {isAdmin && (
                    <aside className="shrink-0 w-56 flex flex-col gap-3 sticky top-20">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground m-0 px-1">
                            {t.hanCharacters.syncData}
                        </h3>

                        <SyncButton
                            label={syncingHanChars ? t.hanCharacters.syncing : t.hanCharacters.syncHanCharacters}
                            runningLabel={t.hanCharacters.running}
                            desc={t.hanCharacters.syncDesc}
                            count={storeHanCharacters.length}
                            loading={syncingHanChars}
                            onClick={() => openPreview(syncMode)}
                        />

                        <SyncButton
                            label={syncingStrokes ? t.hanCharacters.syncing : t.hanCharacters.syncStrokeCount}
                            runningLabel={t.hanCharacters.running}
                            desc={t.hanCharacters.syncStrokeDesc}
                            count={storeHanCharacters.filter((h) => h.strokeCount > 0).length}
                            loading={syncingStrokes}
                            onClick={() => openStrokePreview(strokeMode)}
                        />
                    </aside>
                )}

                {/* ── Main Content ── */}
                <div className="flex-1 min-w-0">
                    <div className={bankToolbarRowClass}>
                        <BankSearchInput
                            className="min-w-0 w-full shrink-0 min-[640px]:w-auto min-[640px]:min-w-55 min-[640px]:max-w-75 min-[640px]:flex-[1_1_240px]"
                            onChange={setSearch}
                            placeholder={t.hanCharacters.searchPlaceholder}
                        />
                        <Select value={filter} onValueChange={setFilter}>
                            <SelectTrigger aria-label={t.common.filter}>
                                <SelectValue>
                                    {FILTER_OPTIONS.find((o) => o.value === filter)?.labelKey
                                        ? t.hanCharacters[FILTER_OPTIONS.find((o) => o.value === filter).labelKey]
                                        : filter}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    {FILTER_OPTIONS.map((opt) => (
                                        <SelectItem key={opt.value} value={opt.value}>
                                            {t.hanCharacters[opt.labelKey]}
                                        </SelectItem>
                                    ))}
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        <Select
                            value={sortKey}
                            onValueChange={(nextKey) => {
                                setSortKey(nextKey);
                                if (nextKey === "createdAt" && sortKey !== "createdAt") setSortDir("desc");
                                else if (nextKey !== "createdAt" && sortKey === "createdAt") setSortDir("asc");
                            }}
                        >
                            <SelectTrigger aria-label={t.common.sort}>
                                <SelectValue>
                                    {SORT_OPTIONS.find((o) => o.value === sortKey)?.labelKey
                                        ? t.hanCharacters[SORT_OPTIONS.find((o) => o.value === sortKey).labelKey]
                                        : sortKey}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    {SORT_OPTIONS.map((opt) => (
                                        <SelectItem key={opt.value} value={opt.value}>
                                            {t.hanCharacters[opt.labelKey]}
                                        </SelectItem>
                                    ))}
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                        >
                            {sortDirLabel}
                        </Button>
                        {isAdmin && (
                            <Button type="button" variant="default" onClick={openAdd}>
                                + {t.hanCharacters.addCharacter}
                            </Button>
                        )}
                    </div>

                    {loading ? (
                        <SkeletonTable rows={10} />
                    ) : items.length === 0 ? (
                        <p className="text-muted-foreground text-sm py-12 text-center">
                            {search ? t.hanCharacters.noSearchMatch : t.hanCharacters.empty}
                        </p>
                    ) : (
                        <>
                            <div className="overflow-x-auto rounded-xl border border-border">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-border bg-background text-left text-muted-foreground text-xs uppercase tracking-wider">
                                            <th className="px-1.5 py-3 text-center w-10">#</th>
                                            <th className="px-3.5 py-3">{t.hanCharacters.colSinoVietnamese}</th>
                                            <th className="px-3.5 py-3">{t.hanCharacters.colHanSimplified}</th>
                                            <th className="px-3.5 py-3">{t.hanCharacters.pinyin}</th>
                                            <th className="px-3.5 py-3">{t.hanCharacters.jyutping}</th>
                                            <th className="px-3.5 py-3 text-center w-24">{t.common.actions}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.map((item, idx) => (
                                            <HanCharacterRow
                                                key={item.id}
                                                item={item}
                                                index={(page - 1) * PAGE_SIZE + idx}
                                                canEdit={isAdmin}
                                                onSave={handleUpdate}
                                                onDelete={handleDelete}
                                            />
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {totalPages > 1 && (
                                <div className="mt-4">
                                    <Pagination
                                        page={page}
                                        totalPages={totalPages}
                                        total={total}
                                        startIndex={(page - 1) * PAGE_SIZE}
                                        pageSize={PAGE_SIZE}
                                        onPageChange={setPage}
                                    />
                                </div>
                            )}
                        </>
                    )}

                    {addOpen && (
                        <AddHanCharacterModal
                            item={editItem}
                            onSave={handleSave}
                            onClose={() => {
                                setAddOpen(false);
                                setEditItem(null);
                            }}
                        />
                    )}

                    {/* Preview modal: confirm before syncing */}
                    {previewOpen && (
                        <div
                            className="fixed inset-0 z-110 flex items-center justify-center bg-black/40 p-4"
                            onClick={previewLoading ? undefined : closePreview}
                        >
                            <div
                                className="w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-2xl bg-card shadow-xl p-6 flex flex-col gap-4"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="flex items-center justify-between">
                                    <h3 className="text-base font-semibold text-foreground">
                                        {t.hanCharacters.syncHanCharacters}
                                    </h3>
                                    {!previewLoading && (
                                        <button
                                            type="button"
                                            className="text-xl leading-none text-muted-foreground hover:text-foreground"
                                            onClick={closePreview}
                                        >
                                            ×
                                        </button>
                                    )}
                                </div>

                                {/* Mode selector: always visible */}
                                <div className="flex flex-col gap-2">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                        {t.hanCharacters.syncMode}
                                    </p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            disabled={previewLoading}
                                            className={`rounded-lg border px-3 py-2 text-left flex flex-col gap-1 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
                                                syncMode === "fast"
                                                    ? "border-primary bg-primary/10"
                                                    : "border-border bg-background hover:border-primary/50"
                                            }`}
                                            onClick={() => openPreview("fast")}
                                        >
                                            <span className="text-sm font-semibold text-foreground">
                                                {t.hanCharacters.fastSync}
                                            </span>
                                            <span className="text-xs text-muted-foreground leading-snug">
                                                {t.hanCharacters.fastSyncHint}
                                            </span>
                                        </button>
                                        <button
                                            type="button"
                                            disabled={previewLoading}
                                            className={`rounded-lg border px-3 py-2 text-left flex flex-col gap-1 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
                                                syncMode === "full"
                                                    ? "border-primary bg-primary/10"
                                                    : "border-border bg-background hover:border-primary/50"
                                            }`}
                                            onClick={() => openPreview("full")}
                                        >
                                            <span className="text-sm font-semibold text-foreground">
                                                {t.hanCharacters.fullOverwrite}
                                            </span>
                                            <span className="text-xs text-muted-foreground leading-snug">
                                                {t.hanCharacters.fullOverwriteHint}
                                            </span>
                                        </button>
                                    </div>
                                </div>

                                {previewLoading ? (
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <Spinner />
                                        <span>{t.hanCharacters.analyzing}</span>
                                    </div>
                                ) : previewError ? (
                                    <p className="text-sm text-destructive">{previewError}</p>
                                ) : preview ? (
                                    <>
                                        <div className="flex flex-col gap-2 text-sm">
                                            <p className="text-foreground">
                                                {t.hanCharacters.totalUnique}{" "}
                                                <strong className="tabular-nums">{preview.total}</strong>
                                            </p>
                                            <p className="text-green-600 dark:text-green-400">
                                                {t.hanCharacters.newToCreate}{" "}
                                                <strong className="tabular-nums">{preview.newCount}</strong>
                                            </p>
                                            <p className="text-amber-600 dark:text-amber-400">
                                                {t.hanCharacters.existingToUpdate}{" "}
                                                <strong className="tabular-nums">{preview.updateCount}</strong>
                                            </p>
                                            <p className="text-muted-foreground">
                                                {t.hanCharacters.unchanged}{" "}
                                                <strong className="tabular-nums">{preview.sameCount}</strong>
                                            </p>
                                        </div>

                                        {preview.newChars.length > 0 && (
                                            <div className="flex flex-col gap-2">
                                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                    {t.hanCharacters.newChars.replace("{count}", preview.newCount)}
                                                </p>
                                                <div className="flex flex-col gap-2 max-h-52 overflow-y-auto">
                                                    {preview.newChars.map((c) => (
                                                        <div
                                                            key={c.hanTraditional}
                                                            className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                                                        >
                                                            <span className="flex items-baseline gap-1.5">
                                                                <span className="text-lg font-semibold leading-tight text-han-trad">
                                                                    {c.hanTraditional}
                                                                </span>
                                                                {c.hanSimplified &&
                                                                    c.hanSimplified !== c.hanTraditional && (
                                                                        <span className="text-lg font-semibold leading-tight text-han-simp">
                                                                            {c.hanSimplified}
                                                                        </span>
                                                                    )}
                                                            </span>
                                                            {c.pinyin?.length > 0 && (
                                                                <span className="flex items-baseline gap-1">
                                                                    <span className="text-xs text-muted-foreground">
                                                                        {t.hanCharacters.pinyin}
                                                                    </span>
                                                                    <span className="font-medium not-italic tracking-wide text-pinyin">
                                                                        {c.pinyin.join(" ")}
                                                                    </span>
                                                                </span>
                                                            )}
                                                            {c.jyutping?.length > 0 && (
                                                                <span className="flex items-baseline gap-1">
                                                                    <span className="text-xs text-muted-foreground">
                                                                        {t.hanCharacters.jyutping}
                                                                    </span>
                                                                    <span className="font-medium not-italic tracking-wide text-jyutping">
                                                                        {c.jyutping.join(" ")}
                                                                    </span>
                                                                </span>
                                                            )}
                                                            {c.sinoVietnamese?.length > 0 && (
                                                                <span className="flex items-baseline gap-1">
                                                                    <span className="text-xs text-muted-foreground">
                                                                        {t.hanCharacters.sino}
                                                                    </span>
                                                                    <span className="font-medium text-viet">
                                                                        {c.sinoVietnamese.join(" ")}
                                                                    </span>
                                                                </span>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {preview.updateChars.length > 0 && (
                                            <div className="flex flex-col gap-2">
                                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                    {t.hanCharacters.toUpdate.replace("{count}", preview.updateCount)}
                                                </p>
                                                <div className="flex flex-col gap-2 max-h-52 overflow-y-auto">
                                                    {preview.updateChars.map((c) => (
                                                        <div
                                                            key={c.hanTraditional + (c.existingId ?? "")}
                                                            className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                                                        >
                                                            <span className="text-lg font-semibold leading-tight text-han-trad">
                                                                {c.hanTraditional}
                                                            </span>
                                                            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                                                {c.missing.map((m) => {
                                                                    const [tag, ...rest] = m.split(":");
                                                                    const val = rest.join(":");
                                                                    const cls =
                                                                        tag === "py"
                                                                            ? "text-pinyin"
                                                                            : tag === "jp"
                                                                              ? "text-jyutping"
                                                                              : "text-viet";
                                                                    const label =
                                                                        tag === "py"
                                                                            ? t.hanCharacters.pinyin
                                                                            : tag === "jp"
                                                                              ? t.hanCharacters.jyutping
                                                                              : t.hanCharacters.sino;
                                                                    return (
                                                                        <span
                                                                            key={m}
                                                                            className="flex items-baseline gap-1"
                                                                        >
                                                                            <span className="text-xs text-muted-foreground">
                                                                                +{label}
                                                                            </span>
                                                                            <span
                                                                                className={`font-medium not-italic tracking-wide ${cls}`}
                                                                            >
                                                                                {val}
                                                                            </span>
                                                                        </span>
                                                                    );
                                                                })}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {syncMode === "full" && (
                                            <p className="text-sm text-amber-600 dark:text-amber-400">
                                                {t.hanCharacters.fullWarning}
                                            </p>
                                        )}

                                        <div className="flex justify-end gap-2 border-t border-border pt-4">
                                            <Button type="button" variant="ghost" onClick={closePreview}>
                                                {t.common.cancel}
                                            </Button>
                                            <Button type="button" variant="default" onClick={confirmSync}>
                                                {t.hanCharacters.confirmSync}
                                            </Button>
                                        </div>
                                    </>
                                ) : null}
                            </div>
                        </div>
                    )}

                    {/* Progress modal while syncing */}
                    {progress && (
                        <div className="fixed inset-0 z-110 flex items-center justify-center bg-black/40 p-4">
                            <div className="w-full max-w-md rounded-2xl bg-card shadow-xl p-6 flex flex-col gap-4">
                                <h3 className="text-base font-semibold text-foreground">{t.hanCharacters.syncingTitle}</h3>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">
                                        {progress.job.status === "error"
                                            ? t.hanCharacters.failed
                                            : progress.job.done
                                              ? t.hanCharacters.complete
                                              : t.hanCharacters.inProgress}
                                    </span>
                                    <span className="text-foreground font-semibold tabular-nums">{progress.percent}%</span>
                                </div>
                                {progress.job.mode === "full" && !progress.job.done && (
                                    <p className="text-xs text-amber-600 dark:text-amber-400">
                                        {t.hanCharacters.fullProgressHint}
                                    </p>
                                )}
                                <div className="h-2 w-full rounded-full bg-background overflow-hidden">
                                    <div
                                        className="h-full rounded-full bg-primary transition-[width] duration-300"
                                        style={{ width: `${progress.percent}%` }}
                                    />
                                </div>
                                <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                                    <p>
                                        {t.hanCharacters.vocabularies}{" "}
                                        <strong className="tabular-nums text-foreground">
                                            {progress.job.processed} / {progress.job.total}
                                        </strong>
                                    </p>
                                    {progress.job.current && (
                                        <p>
                                            {t.hanCharacters.current}{" "}
                                            <span className="text-han-trad">{progress.job.current}</span>
                                        </p>
                                    )}
                                </div>
                                {progress.job.done && (
                                    <div className="flex flex-col gap-1 text-sm">
                                        <p className="text-green-600 dark:text-green-400">
                                            {t.hanCharacters.created}{" "}
                                            <strong className="tabular-nums">{progress.job.created}</strong>
                                        </p>
                                        <p className="text-amber-600 dark:text-amber-400">
                                            {t.hanCharacters.updated}{" "}
                                            <strong className="tabular-nums">{progress.job.updated}</strong>
                                        </p>
                                        <p className="text-muted-foreground">
                                            {t.hanCharacters.linked}{" "}
                                            <strong className="tabular-nums">{progress.job.linked}</strong>
                                        </p>
                                        {progress.job.merged > 0 && (
                                            <p className="text-muted-foreground">
                                                {t.hanCharacters.mergedDuplicates}{" "}
                                                <strong className="tabular-nums">{progress.job.merged}</strong>
                                            </p>
                                        )}
                                        {progress.job.error && <p className="text-destructive">{progress.job.error}</p>}
                                    </div>
                                )}
                                {progress.job.done && (
                                    <Button type="button" variant="default" onClick={() => setProgress(null)}>
                                        {t.hanCharacters.close}
                                    </Button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Stroke sync: preview modal */}
                    {strokePreviewOpen && (
                        <div className="fixed inset-0 z-110 flex items-center justify-center bg-black/40 p-4">
                            <div className="w-full max-w-md rounded-2xl bg-card shadow-xl p-6 flex flex-col gap-4">
                                <h3 className="text-base font-semibold text-foreground">
                                    {t.hanCharacters.syncStrokeCount}
                                </h3>

                                {!strokePreviewLoading && (
                                    <div className="flex gap-3">
                                        <button
                                            type="button"
                                            disabled={strokePreviewLoading}
                                            className={`flex-1 rounded-lg border px-3 py-2 text-left flex flex-col gap-1 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
                                                strokeMode === "fast"
                                                    ? "border-primary bg-primary/10"
                                                    : "border-border bg-background hover:border-primary/50"
                                            }`}
                                            onClick={() => openStrokePreview("fast")}
                                        >
                                            <span className="text-sm font-semibold text-foreground">
                                                {t.hanCharacters.fastSync}
                                            </span>
                                            <span className="text-xs text-muted-foreground leading-snug">
                                                {t.hanCharacters.syncStrokeFastHint}
                                            </span>
                                        </button>
                                        <button
                                            type="button"
                                            disabled={strokePreviewLoading}
                                            className={`flex-1 rounded-lg border px-3 py-2 text-left flex flex-col gap-1 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
                                                strokeMode === "full"
                                                    ? "border-primary bg-primary/10"
                                                    : "border-border bg-background hover:border-primary/50"
                                            }`}
                                            onClick={() => openStrokePreview("full")}
                                        >
                                            <span className="text-sm font-semibold text-foreground">
                                                {t.hanCharacters.fullOverwrite}
                                            </span>
                                            <span className="text-xs text-muted-foreground leading-snug">
                                                {t.hanCharacters.syncStrokeFullHint}
                                            </span>
                                        </button>
                                    </div>
                                )}

                                {strokePreviewLoading ? (
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <Spinner />
                                        <span>{t.hanCharacters.analyzing}</span>
                                    </div>
                                ) : strokePreviewError ? (
                                    <p className="text-sm text-destructive">{strokePreviewError}</p>
                                ) : strokePreview ? (
                                    <>
                                        <div className="flex flex-col gap-2 text-sm">
                                            <p className="text-foreground">
                                                {t.hanCharacters.totalUnique}{" "}
                                                <strong className="tabular-nums">{strokePreview.total}</strong>
                                            </p>
                                            <p className="text-green-600 dark:text-green-400">
                                                {t.hanCharacters.strokeNew}{" "}
                                                <strong className="tabular-nums">{strokePreview.newCount}</strong>
                                            </p>
                                            <p className="text-amber-600 dark:text-amber-400">
                                                {t.hanCharacters.strokeUpdate}{" "}
                                                <strong className="tabular-nums">{strokePreview.updateCount}</strong>
                                            </p>
                                            <p className="text-muted-foreground">
                                                {t.hanCharacters.unchanged}{" "}
                                                <strong className="tabular-nums">{strokePreview.sameCount}</strong>
                                            </p>
                                        </div>

                                        {strokePreview.newChars.length > 0 && (
                                            <div className="flex flex-col gap-2">
                                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                    {t.hanCharacters.strokeNewChars.replace(
                                                        "{count}",
                                                        strokePreview.newCount,
                                                    )}
                                                </p>
                                                <div className="flex flex-wrap gap-2 max-h-52 overflow-y-auto">
                                                    {strokePreview.newChars.map((c) => (
                                                        <span
                                                            key={c.char}
                                                            className="flex items-baseline gap-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                                                        >
                                                            <span className="text-lg font-semibold leading-tight text-han-trad">
                                                                {c.char}
                                                            </span>
                                                            <span className="text-foreground tabular-nums">
                                                                {c.strokes}
                                                            </span>
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {strokePreview.updateChars.length > 0 && (
                                            <div className="flex flex-col gap-2">
                                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                    {t.hanCharacters.strokeUpdateChars.replace(
                                                        "{count}",
                                                        strokePreview.updateCount,
                                                    )}
                                                </p>
                                                <div className="flex flex-wrap gap-2 max-h-52 overflow-y-auto">
                                                    {strokePreview.updateChars.map((c) => (
                                                        <span
                                                            key={c.char}
                                                            className="flex items-baseline gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                                                        >
                                                            <span className="text-lg font-semibold leading-tight text-han-trad">
                                                                {c.char}
                                                            </span>
                                                            <span className="text-muted-foreground tabular-nums">
                                                                {c.old} →{" "}
                                                                <strong className="text-foreground">{c.strokes}</strong>
                                                            </span>
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        <div className="flex justify-end gap-2 border-t border-border pt-4">
                                            <Button type="button" variant="ghost" onClick={closeStrokePreview}>
                                                {t.common.cancel}
                                            </Button>
                                            <Button type="button" variant="default" onClick={confirmStrokeSync}>
                                                {t.hanCharacters.confirmSync}
                                            </Button>
                                        </div>
                                    </>
                                ) : null}
                            </div>
                        </div>
                    )}

                    {/* Stroke sync: progress modal */}
                    {strokeProgress && (
                        <div className="fixed inset-0 z-110 flex items-center justify-center bg-black/40 p-4">
                            <div className="w-full max-w-md rounded-2xl bg-card shadow-xl p-6 flex flex-col gap-4">
                                <h3 className="text-base font-semibold text-foreground">
                                    {t.hanCharacters.syncStrokeCount}
                                </h3>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">
                                        {strokeProgress.job.status === "error"
                                            ? t.hanCharacters.failed
                                            : strokeProgress.job.done
                                              ? t.hanCharacters.complete
                                              : t.hanCharacters.inProgress}
                                    </span>
                                    <span className="text-foreground font-semibold tabular-nums">
                                        {strokeProgress.percent}%
                                    </span>
                                </div>
                                <div className="h-2 w-full rounded-full bg-background overflow-hidden">
                                    <div
                                        className="h-full rounded-full bg-primary transition-[width] duration-300"
                                        style={{ width: `${strokeProgress.percent}%` }}
                                    />
                                </div>
                                <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                                    <p>
                                        {t.hanCharacters.vocabularies}{" "}
                                        <strong className="tabular-nums text-foreground">
                                            {strokeProgress.job.processed} / {strokeProgress.job.total}
                                        </strong>
                                    </p>
                                    {strokeProgress.job.current && (
                                        <p>
                                            {t.hanCharacters.current}{" "}
                                            <span className="text-han-trad">{strokeProgress.job.current}</span>
                                        </p>
                                    )}
                                </div>
                                {strokeProgress.job.done && (
                                    <div className="flex flex-col gap-1 text-sm">
                                        <p className="text-green-600 dark:text-green-400">
                                            {t.hanCharacters.strokeUpdated}{" "}
                                            <strong className="tabular-nums">{strokeProgress.job.updated}</strong>
                                        </p>
                                        {strokeProgress.job.error && (
                                            <p className="text-destructive">{strokeProgress.job.error}</p>
                                        )}
                                        <Button type="button" variant="default" onClick={() => setStrokeProgress(null)}>
                                            {t.hanCharacters.close}
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {dialog}
        </main>
    );
}

function SyncButton({ label, desc, count, loading, runningLabel, onClick }) {
    return (
        <button
            type="button"
            className="w-full text-left px-3 py-2.5 rounded-lg border border-border bg-card hover:bg-primary/10 transition-colors disabled:opacity-50"
            onClick={onClick}
            disabled={loading}
        >
            <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">{loading ? runningLabel : label}</span>
                {loading ? (
                    <span className="text-xs text-muted-foreground">⏳</span>
                ) : (
                    <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
                )}
            </div>
            <p className="text-[0.6875rem] text-muted-foreground mt-0.5">{desc}</p>
        </button>
    );
}
