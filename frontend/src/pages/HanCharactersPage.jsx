import { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api } from "../lib/api.js";
import { logError, logWarn } from "../lib/actionLog.js";
import { useDebouncedValue } from "../hooks/useDebouncedValue.js";
import { AddHanCharacterModal } from "../components/AddHanCharacterModal.jsx";
import { HanCharacterRow } from "../components/HanCharacterRow.jsx";
import { MissingHanCharsSync } from "../components/MissingHanCharsSync.jsx";
import { BankSearchInput } from "../components/BankSearchInput.jsx";
import { Pagination } from "../components/Pagination.jsx";
import { useConfirmDialog } from "../hooks/useConfirmDialog.jsx";
import { cn } from "../lib/cn.js";
import { useLocale } from "../store/localeStore.js";
import { useAppActions, useHanCharacters } from "../store/appStore.js";
import { btnClass, spinnerClass } from "../components/ui/buttonStyles.js";
import { SkeletonTable } from "../components/ui/Skeleton.jsx";
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
    const { mergeHanCharacters, removeHanCharacter, bumpHanCharactersRevision, refreshHanCharacters } = useAppActions();

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
    const [deduping, setDeduping] = useState(false);

    const handleDedupHanChars = useCallback(async () => {
        if (deduping) return;
        setDeduping(true);
        try {
            const groups = new Map();
            for (const h of storeHanCharacters) {
                const key = (h.hanSimplified ?? "").trim();
                if (!key) continue;
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key).push(h);
            }
            let removed = 0;
            const toDelete = [];
            for (const [, group] of groups) {
                if (group.length <= 1) continue;
                // Keep the one with most readings, break ties by popularity
                const score = (h) => {
                    let s = 0;
                    const jp = Array.isArray(h.jyutping) ? h.jyutping : h.jyutping ? [h.jyutping] : [];
                    const py = Array.isArray(h.pinyin) ? h.pinyin : h.pinyin ? [h.pinyin] : [];
                    const hv = Array.isArray(h.sinoVietnamese)
                        ? h.sinoVietnamese
                        : h.sinoVietnamese
                          ? [h.sinoVietnamese]
                          : [];
                    s += jp.length + py.length + hv.length;
                    if (h.hanTraditional) s += 2;
                    s += h.popularity ?? 0;
                    return s;
                };
                group.sort((a, b) => score(b) - score(a));
                const [, ...dupes] = group;
                for (const d of dupes) {
                    removeHanCharacter(d.id);
                    toDelete.push(d.id);
                    removed++;
                }
            }
            // Delete from backend and wait for all to complete before refreshing
            if (toDelete.length > 0) {
                await Promise.all(toDelete.map((id) => api.deleteHanCharacter(id).catch(() => {})));
                invalidateDataCache();
            }
            await refreshHanCharacters();
            if (removed > 0) {
                alert(`Removed ${removed} duplicate Chinese characters.`);
            } else {
                alert("No duplicate Chinese characters found.");
            }
        } finally {
            setDeduping(false);
        }
    }, [storeHanCharacters, removeHanCharacter, refreshHanCharacters, deduping]);

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

    const [syncingPinyin, setSyncingPinyin] = useState(false);
    const handleBackfillPinyin = useCallback(async () => {
        setSyncingPinyin(true);
        try {
            const result = await api.backfillHanCharPinyin();
            logWarn(`Han char pinyin backfill: updated ${result.updated ?? "?"} / ${result.total ?? "?"}`);
            invalidateHanCharacterBrowseCache();
            await refreshHanCharacters();
        } catch (err) {
            logError("Han char pinyin backfill failed", err instanceof Error ? err.message : String(err));
        } finally {
            setSyncingPinyin(false);
        }
    }, [refreshHanCharacters]);

    const [syncingJyutping, setSyncingJyutping] = useState(false);
    const handleBackfillJyutping = useCallback(async () => {
        setSyncingJyutping(true);
        try {
            const result = await api.backfillHanCharJyutping();
            logWarn(`Han char jyutping backfill: updated ${result.updated ?? "?"} / ${result.total ?? "?"}`);
            invalidateHanCharacterBrowseCache();
            await refreshHanCharacters();
        } catch (err) {
            logError("Han char jyutping backfill failed", err instanceof Error ? err.message : String(err));
        } finally {
            setSyncingJyutping(false);
        }
    }, [refreshHanCharacters]);

    const [syncingVariants, setSyncingVariants] = useState(false);
    const [variantResult, setVariantResult] = useState(null);
    const handleBackfillVariants = useCallback(async () => {
        setSyncingVariants(true);
        setVariantResult(null);
        try {
            const result = await api.backfillHanCharVariants();
            setVariantResult(result);
            const lines = [];
            if (result.updated > 0) lines.push(`✅ Updated variants: ${result.updated}`);
            if (result.merged > 0) lines.push(`🔗 Merged duplicates: ${result.merged}`);
            if (result.same > 0) lines.push(`= Same (no change): ${result.same}`);
            if (result.skipped > 0) lines.push(`⏭️ Skipped: ${result.skipped}`);
            lines.push(`📊 Total: ${result.total}`);
            if (result.mergedSample?.length > 0) {
                lines.push(`\nMerged: ${result.mergedSample.join(", ")}`);
            }
            if (result.updatedSample?.length > 0) {
                lines.push(`Updated: ${result.updatedSample.join(", ")}`);
            }
            alert(lines.join("\n"));
            invalidateHanCharacterBrowseCache();
            invalidateDataCache();
            await refreshHanCharacters();
        } catch (err) {
            logError("Han char variants backfill failed", err instanceof Error ? err.message : String(err));
            alert("Failed: " + (err instanceof Error ? err.message : String(err)));
        } finally {
            setSyncingVariants(false);
        }
    }, [refreshHanCharacters]);

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
                            label="Pinyin"
                            desc="From pinyin-pro (OpenCC)"
                            count={storeHanCharacters.length}
                            loading={syncingPinyin}
                            onClick={handleBackfillPinyin}
                        />
                        <SyncButton
                            label="Jyutping"
                            desc="From jyut6ping3.dict.yaml"
                            count={storeHanCharacters.length}
                            loading={syncingJyutping}
                            onClick={handleBackfillJyutping}
                        />
                        <SyncButton
                            label="Traditional/Simplified"
                            desc="From OpenCC (both ways)"
                            count={storeHanCharacters.length}
                            loading={syncingVariants}
                            onClick={handleBackfillVariants}
                        />

                        <div className="border-t border-border pt-3 mt-1">
                            <MissingHanCharsSync />
                        </div>

                        <div className="border-t border-border pt-3 mt-1">
                            <button
                                type="button"
                                className="w-full text-left px-3 py-2 rounded-lg border border-border bg-surface text-sm font-medium text-text-h transition-colors duration-150 hover:bg-error-bg hover:border-error-border hover:text-error-text disabled:opacity-50"
                                onClick={handleDedupHanChars}
                                disabled={deduping}
                            >
                                <span className="block text-xs font-semibold text-error-text">
                                    {deduping ? "Removing..." : "Remove duplicates"}
                                </span>
                                <span className="block text-[0.6875rem] text-text-muted mt-0.5">
                                    Merge duplicate characters
                                </span>
                            </button>
                        </div>
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

                    {variantResult && (
                        <div
                            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4"
                            onClick={() => setVariantResult(null)}
                        >
                            <div
                                className="m-auto w-full max-w-[420px] rounded-2xl bg-surface p-6 shadow-lg"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-base font-semibold">Sync Traditional/Simplified (OpenCC)</h3>
                                    <button
                                        type="button"
                                        className="text-xl text-text-muted hover:text-text-h"
                                        onClick={() => setVariantResult(null)}
                                    >
                                        ×
                                    </button>
                                </div>
                                <div className="flex flex-col gap-2 text-sm text-text-h">
                                    <p>
                                        Total: <strong>{variantResult.total}</strong> characters
                                    </p>
                                    <p className="text-green-600">
                                        Updated simplified: <strong>{variantResult.updated}</strong>
                                    </p>
                                    <p className="text-text-muted">
                                        Same simplified/traditional: <strong>{variantResult.same}</strong>
                                    </p>
                                    <p className="text-text-muted">
                                        Skipped: <strong>{variantResult.skipped}</strong>
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    className={cn(btnClass("primary"), "mt-4 w-full")}
                                    onClick={() => setVariantResult(null)}
                                >
                                    Close
                                </button>
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
