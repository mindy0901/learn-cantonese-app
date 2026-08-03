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
import { btnClass } from "../components/ui/buttonStyles.js";
import { SkeletonTable } from "../components/ui/Skeleton.jsx";
import { IconSpinner } from "../components/NavIcons.jsx";
import {
    bankToolbarRowClass,
    bankToolbarSearchClass,
    bankToolbarSelectClass,
    bankToolbarButtonClass,
} from "../components/ui/bankToolbarStyles.js";
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
    { value: "popularity", labelKey: "sortPopularity" },
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
            if (sortKey === "popularity") {
                aVal = a.popularity ?? -1;
                bVal = b.popularity ?? -1;
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
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted m-0 px-1">
                            Sync Data
                        </h3>

                        <SyncButton
                            label={syncingHanChars ? "Syncing..." : "Sync Han Characters"}
                            desc="Sync all characters + details from vocabularies"
                            count={storeHanCharacters.length}
                            loading={syncingHanChars}
                            onClick={() => openPreview(syncMode)}
                        />
                    </aside>
                )}

                {/* ── Main Content ── */}
                <div className="flex-1 min-w-0">
                    <div className={bankToolbarRowClass}>
                        <BankSearchInput
                            className={bankToolbarSearchClass}
                            onChange={setSearch}
                            placeholder={t.hanCharacters.searchPlaceholder}
                        />
                        <select
                            className={bankToolbarSelectClass}
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            aria-label={t.common.filter || "Filter"}
                        >
                            {FILTER_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {t.hanCharacters[opt.labelKey]}
                                </option>
                            ))}
                        </select>
                        <select
                            className={bankToolbarSelectClass}
                            value={sortKey}
                            onChange={(e) => {
                                const nextKey = e.target.value;
                                setSortKey(nextKey);
                                if (nextKey === "createdAt" && sortKey !== "createdAt") setSortDir("desc");
                                else if (nextKey !== "createdAt" && sortKey === "createdAt") setSortDir("asc");
                            }}
                            aria-label={t.common.sort || "Sort"}
                        >
                            {SORT_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {t.hanCharacters[opt.labelKey]}
                                </option>
                            ))}
                        </select>
                        <button
                            type="button"
                            className={bankToolbarButtonClass}
                            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                        >
                            {sortDirLabel}
                        </button>
                        {isAdmin && (
                            <button type="button" className={btnClass("primary")} onClick={openAdd}>
                                + {t.hanCharacters.addCharacter}
                            </button>
                        )}
                    </div>

                    {loading ? (
                        <SkeletonTable rows={10} />
                    ) : items.length === 0 ? (
                        <p className="text-text-muted text-sm py-12 text-center">
                            {search ? t.hanCharacters.noSearchMatch : t.hanCharacters.empty}
                        </p>
                    ) : (
                        <>
                            <div className="overflow-x-auto rounded-xl border border-border">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-border bg-bg text-left text-text-muted text-xs uppercase tracking-wider">
                                            <th className="px-1.5 py-3 text-center w-10">#</th>
                                            <th className="px-3.5 py-3">
                                                {t.hanCharacters.hanViet || "Sino-Vietnamese"}
                                            </th>
                                            <th className="px-3.5 py-3">
                                                {t.hanCharacters.hanCharacter || "Chinese Character"}
                                            </th>
                                            <th className="px-3.5 py-3">{t.hanCharacters.pinyin || "Pinyin"}</th>
                                            <th className="px-3.5 py-3">{t.hanCharacters.jyutping || "Jyutping"}</th>
                                            <th className="px-3.5 py-3 text-center w-24">{t.common.actions || ""}</th>
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
                            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4"
                            onClick={previewLoading ? undefined : closePreview}
                        >
                            <div
                                className="w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-2xl bg-surface shadow-xl p-6 flex flex-col gap-4"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="flex items-center justify-between">
                                    <h3 className="text-base font-semibold text-text-h">Sync Han Characters</h3>
                                    {!previewLoading && (
                                        <button
                                            type="button"
                                            className="text-xl leading-none text-text-muted hover:text-text-h"
                                            onClick={closePreview}
                                        >
                                            ×
                                        </button>
                                    )}
                                </div>

                                {/* Mode selector: always visible */}
                                <div className="flex flex-col gap-2">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                                        Sync mode
                                    </p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            disabled={previewLoading}
                                            className={`rounded-lg border px-3 py-2 text-left flex flex-col gap-1 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
                                                syncMode === "fast"
                                                    ? "border-accent bg-accent/10"
                                                    : "border-border bg-bg hover:border-accent/50"
                                            }`}
                                            onClick={() => openPreview("fast")}
                                        >
                                            <span className="text-sm font-semibold text-text-h">Fast sync</span>
                                            <span className="text-xs text-text-muted leading-snug">
                                                Chỉ xử lý từ chưa có breakdown. Nhanh, không xóa gì.
                                            </span>
                                        </button>
                                        <button
                                            type="button"
                                            disabled={previewLoading}
                                            className={`rounded-lg border px-3 py-2 text-left flex flex-col gap-1 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
                                                syncMode === "full"
                                                    ? "border-accent bg-accent/10"
                                                    : "border-border bg-bg hover:border-accent/50"
                                            }`}
                                            onClick={() => openPreview("full")}
                                        >
                                            <span className="text-sm font-semibold text-text-h">Full overwrite</span>
                                            <span className="text-xs text-text-muted leading-snug">
                                                Xóa hết hán tự cũ rồi sync lại toàn bộ từ đầu.
                                            </span>
                                        </button>
                                    </div>
                                </div>

                                {previewLoading ? (
                                    <div className="flex items-center gap-2 text-sm text-text-muted">
                                        <IconSpinner size={16} />
                                        <span>Analyzing vocabularies…</span>
                                    </div>
                                ) : previewError ? (
                                    <p className="text-sm text-error-text">{previewError}</p>
                                ) : preview ? (
                                    <>
                                        <div className="flex flex-col gap-2 text-sm">
                                            <p className="text-text-h">
                                                Total unique characters:{" "}
                                                <strong className="tabular-nums">{preview.total}</strong>
                                            </p>
                                            <p className="text-green-600 dark:text-green-400">
                                                New characters to create:{" "}
                                                <strong className="tabular-nums">{preview.newCount}</strong>
                                            </p>
                                            <p className="text-amber-600 dark:text-amber-400">
                                                Existing to update:{" "}
                                                <strong className="tabular-nums">{preview.updateCount}</strong>
                                            </p>
                                            <p className="text-text-muted">
                                                Unchanged: <strong className="tabular-nums">{preview.sameCount}</strong>
                                            </p>
                                        </div>

                                        {preview.newChars.length > 0 && (
                                            <div className="flex flex-col gap-2">
                                                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                                                    New characters ({preview.newCount})
                                                </p>
                                                <div className="flex flex-col gap-2 max-h-52 overflow-y-auto">
                                                    {preview.newChars.map((c) => (
                                                        <div
                                                            key={c.character}
                                                            className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm"
                                                        >
                                                            <span className="flex items-baseline gap-1.5">
                                                                <span className="text-lg font-semibold leading-tight text-red-600 dark:text-red-400">
                                                                    {c.character}
                                                                </span>
                                                                {c.hanSimplified && c.hanSimplified !== c.character && (
                                                                    <span className="text-lg font-semibold leading-tight text-blue-600 dark:text-blue-400">
                                                                        {c.hanSimplified}
                                                                    </span>
                                                                )}
                                                            </span>
                                                            {c.pinyin?.length > 0 && (
                                                                <span className="flex items-baseline gap-1">
                                                                    <span className="text-xs text-text-muted">
                                                                        Pinyin
                                                                    </span>
                                                                    <span className="font-medium not-italic tracking-wide text-pinyin">
                                                                        {c.pinyin.join(" ")}
                                                                    </span>
                                                                </span>
                                                            )}
                                                            {c.jyutping?.length > 0 && (
                                                                <span className="flex items-baseline gap-1">
                                                                    <span className="text-xs text-text-muted">
                                                                        Jyutping
                                                                    </span>
                                                                    <span className="font-medium not-italic tracking-wide text-jyutping">
                                                                        {c.jyutping.join(" ")}
                                                                    </span>
                                                                </span>
                                                            )}
                                                            {c.sinoVietnamese?.length > 0 && (
                                                                <span className="flex items-baseline gap-1">
                                                                    <span className="text-xs text-text-muted">
                                                                        Sino
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
                                                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                                                    To update ({preview.updateCount})
                                                </p>
                                                <div className="flex flex-col gap-2 max-h-52 overflow-y-auto">
                                                    {preview.updateChars.map((c) => (
                                                        <div
                                                            key={c.character + (c.existingId ?? "")}
                                                            className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm"
                                                        >
                                                            <span className="text-lg font-semibold leading-tight text-red-600 dark:text-red-400">
                                                                {c.character}
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
                                                                            ? "Pinyin"
                                                                            : tag === "jp"
                                                                              ? "Jyutping"
                                                                              : "Sino";
                                                                    return (
                                                                        <span
                                                                            key={m}
                                                                            className="flex items-baseline gap-1"
                                                                        >
                                                                            <span className="text-xs text-text-muted">
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
                                                ⚠️ Full overwrite sẽ xóa toàn bộ hán tự hiện có rồi sync lại từ đầu —
                                                thời gian lâu hơn, chỉ dùng khi cần dựng lại dữ liệu.
                                            </p>
                                        )}

                                        <div className="flex justify-end gap-2 border-t border-border pt-4">
                                            <button type="button" className={btnClass("ghost")} onClick={closePreview}>
                                                Cancel
                                            </button>
                                            <button type="button" className={btnClass("primary")} onClick={confirmSync}>
                                                Confirm Sync
                                            </button>
                                        </div>
                                    </>
                                ) : null}
                            </div>
                        </div>
                    )}

                    {/* Progress modal while syncing */}
                    {progress && (
                        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4">
                            <div className="w-full max-w-md rounded-2xl bg-surface shadow-xl p-6 flex flex-col gap-4">
                                <h3 className="text-base font-semibold text-text-h">Syncing Han Characters…</h3>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-text-muted">
                                        {progress.job.status === "error"
                                            ? "Failed"
                                            : progress.job.done
                                              ? "Complete"
                                              : "In progress"}
                                    </span>
                                    <span className="text-text-h font-semibold tabular-nums">{progress.percent}%</span>
                                </div>
                                {progress.job.mode === "full" && !progress.job.done && (
                                    <p className="text-xs text-amber-600 dark:text-amber-400">
                                        Full overwrite — đang dựng lại toàn bộ hán tự từ đầu.
                                    </p>
                                )}
                                <div className="h-2 w-full rounded-full bg-bg overflow-hidden">
                                    <div
                                        className="h-full rounded-full bg-accent transition-[width] duration-300"
                                        style={{ width: `${progress.percent}%` }}
                                    />
                                </div>
                                <div className="flex flex-col gap-1 text-xs text-text-muted">
                                    <p>
                                        Vocabularies:{" "}
                                        <strong className="tabular-nums text-text-h">
                                            {progress.job.processed} / {progress.job.total}
                                        </strong>
                                    </p>
                                    {progress.job.current && (
                                        <p>
                                            Current:{" "}
                                            <span className="text-red-600 dark:text-red-400">
                                                {progress.job.current}
                                            </span>
                                        </p>
                                    )}
                                </div>
                                {progress.job.done && (
                                    <div className="flex flex-col gap-1 text-sm">
                                        <p className="text-green-600 dark:text-green-400">
                                            Created: <strong className="tabular-nums">{progress.job.created}</strong>
                                        </p>
                                        <p className="text-amber-600 dark:text-amber-400">
                                            Updated: <strong className="tabular-nums">{progress.job.updated}</strong>
                                        </p>
                                        <p className="text-text-muted">
                                            Linked: <strong className="tabular-nums">{progress.job.linked}</strong>
                                        </p>
                                        {progress.job.merged > 0 && (
                                            <p className="text-text-muted">
                                                Merged duplicates:{" "}
                                                <strong className="tabular-nums">{progress.job.merged}</strong>
                                            </p>
                                        )}
                                        {progress.job.error && <p className="text-error-text">{progress.job.error}</p>}
                                    </div>
                                )}
                                {progress.job.done && (
                                    <button
                                        type="button"
                                        className={btnClass("primary")}
                                        onClick={() => setProgress(null)}
                                    >
                                        Close
                                    </button>
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

function SyncButton({ label, desc, count, loading, onClick }) {
    return (
        <button
            type="button"
            className="w-full text-left px-3 py-2.5 rounded-lg border border-border bg-surface hover:bg-accent-bg transition-colors disabled:opacity-50"
            onClick={onClick}
            disabled={loading}
        >
            <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-text-h">{loading ? "Running..." : label}</span>
                {loading ? (
                    <span className="text-xs text-text-muted">⏳</span>
                ) : (
                    <span className="text-xs text-text-muted tabular-nums">{count}</span>
                )}
            </div>
            <p className="text-[0.6875rem] text-text-muted mt-0.5">{desc}</p>
        </button>
    );
}
