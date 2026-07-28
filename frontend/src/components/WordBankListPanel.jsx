import { memo, useCallback, useMemo, useState } from "react";
import { useLocale } from "../store/localeStore.js";
import { getWordBankSortDirLabel } from "../lib/wordFilters.js";
import { wordBankReturnMatches } from "../lib/wordBankReturn.js";
import { useDebouncedValue } from "../hooks/useDebouncedValue.js";
import {
    bankToolbarButtonClass,
    bankToolbarRowClass,
    bankToolbarSearchClass,
    bankToolbarSelectClass,
} from "./ui/bankToolbarStyles.js";
import { BankSearchInput } from "./BankSearchInput.jsx";
import { WordBankBrowseTable } from "./WordBankBrowseTable.jsx";

export const WordBankListPanel = memo(function WordBankListPanel({
    filter,
    showImportant,
    showMastered,
    hskLevel,
    sortKey,
    sortDir,
    onFilterChange,
    onView,
    onEdit,
    restoreState = null,
}) {
    const { t, fmt } = useLocale();
    const browseContext = useMemo(
        () => ({ filter, showImportant, showMastered, hskLevel, sortKey, sortDir }),
        [filter, showImportant, showMastered, hskLevel, sortKey, sortDir],
    );
    const activeRestore = useMemo(
        () => (wordBankReturnMatches(restoreState, browseContext) ? restoreState : null),
        [restoreState, browseContext],
    );
    const [search, setSearch] = useState(() => activeRestore?.search ?? "");
    const debouncedSearch = useDebouncedValue(search, 300);
    const [filteredTotal, setFilteredTotal] = useState(0);
    const handleSearch = useCallback((value) => setSearch(value), []);
    const handleTotalChange = useCallback((total) => setFilteredTotal(total), []);

    const hskLevels = [
        { value: "all", label: t.wordBank.levelAll || "Tất cả cấp" },
        { value: "1", label: "HSK 1" },
        { value: "2", label: "HSK 2" },
        { value: "3", label: "HSK 3" },
        { value: "4", label: "HSK 4" },
        { value: "5", label: "HSK 5" },
        { value: "6", label: "HSK 6" },
        { value: "7-9", label: "HSK 7-9" },
    ];

    const sortOptions = [
        { value: "sinoVietnamese", label: t.sort.sinoVietnamese },
        { value: "hanTraditional", label: t.sort.hanTraditional },
        { value: "jyutping", label: t.sort.jyutping },
        { value: "createdAt", label: t.sort.createdAt },
    ];

    const sortDirLabel = getWordBankSortDirLabel(sortKey, sortDir, t);

    return (
        <div className="w-full">
            <div className={bankToolbarRowClass}>
                <select
                    className={bankToolbarSelectClass}
                    value={hskLevel}
                    onChange={(e) => onFilterChange({ hskLevel: e.target.value })}
                    aria-label={t.wordBank.levelFilter || "Level"}
                >
                    {hskLevels.map((l) => (
                        <option key={l.value} value={l.value}>
                            {l.label}
                        </option>
                    ))}
                </select>
                <select
                    className={bankToolbarSelectClass}
                    value={sortKey}
                    onChange={(e) => {
                        const nextKey = e.target.value;
                        onFilterChange({
                            sortKey: nextKey,
                            ...(nextKey === "createdAt" && sortKey !== "createdAt" ? { sortDir: "desc" } : {}),
                        });
                    }}
                    aria-label={t.wordBank.sortBy}
                >
                    {sortOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                            {o.label}
                        </option>
                    ))}
                </select>
                <button
                    type="button"
                    className={bankToolbarButtonClass}
                    onClick={() => onFilterChange({ sortDir: sortDir === "asc" ? "desc" : "asc" })}
                >
                    {sortDirLabel}
                </button>
                <label className="inline-flex items-center gap-1.5 px-2 py-1 text-sm cursor-pointer select-none">
                    <input
                        type="checkbox"
                        className="size-4 rounded border-border accent-amber-500 cursor-pointer"
                        checked={showImportant}
                        onChange={(e) => onFilterChange({ showImportant: e.target.checked })}
                    />
                    <span className="text-text-h">{t.wordBank.filterImportant}</span>
                </label>
                <label className="inline-flex items-center gap-1.5 px-2 py-1 text-sm cursor-pointer select-none">
                    <input
                        type="checkbox"
                        className="size-4 rounded border-border accent-green-500 cursor-pointer"
                        checked={showMastered}
                        onChange={(e) => onFilterChange({ showMastered: e.target.checked })}
                    />
                    <span className="text-text-h">{t.wordBank.filterMastered}</span>
                </label>
                <BankSearchInput
                    className={bankToolbarSearchClass + " ml-auto"}
                    onChange={handleSearch}
                    placeholder={t.wordBank.searchPlaceholder}
                    initialValue={activeRestore?.search ?? ""}
                />
            </div>

            <WordBankBrowseTable
                variant="bank"
                search={debouncedSearch}
                filter={filter}
                showImportant={showImportant}
                showMastered={showMastered}
                hskLevel={hskLevel}
                sortKey={sortKey}
                sortDir={sortDir}
                onView={onView}
                onEdit={onEdit}
                onTotalChange={handleTotalChange}
                restoreState={activeRestore}
            />
        </div>
    );
});
