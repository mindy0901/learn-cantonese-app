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
    sortKey,
    sortDir,
    onFilterChange,
    onView,
    restoreState = null,
}) {
    const { t, fmt } = useLocale();
    const browseContext = useMemo(() => ({ filter, sortKey, sortDir }), [filter, sortKey, sortDir]);
    const activeRestore = useMemo(
        () => (wordBankReturnMatches(restoreState, browseContext) ? restoreState : null),
        [restoreState, browseContext],
    );
    const [search, setSearch] = useState(() => activeRestore?.search ?? "");
    const debouncedSearch = useDebouncedValue(search, 300);
    const [filteredTotal, setFilteredTotal] = useState(0);
    const handleSearch = useCallback((value) => setSearch(value), []);
    const handleTotalChange = useCallback((total) => setFilteredTotal(total), []);

    const sortOptions = [
        { value: "hanViet", label: t.sort.hanViet },
        { value: "hanTraditional", label: t.sort.hanTraditional },
        { value: "jyutping", label: t.sort.jyutping },
        { value: "vietnamese", label: t.sort.vietnamese },
        { value: "english", label: t.sort.english },
        { value: "createdAt", label: t.sort.createdAt },
    ];

    const sortDirLabel = getWordBankSortDirLabel(sortKey, sortDir, t);

    return (
        <div className="w-full">
            <div className={bankToolbarRowClass}>
                <BankSearchInput
                    className={bankToolbarSearchClass}
                    onChange={handleSearch}
                    placeholder={t.wordBank.searchPlaceholder}
                    initialValue={activeRestore?.search ?? ""}
                />
                <select
                    className={bankToolbarSelectClass}
                    value={filter}
                    onChange={(e) => onFilterChange({ filter: e.target.value })}
                    aria-label="Filter"
                >
                    <option value="all">{t.wordBank.filterAll}</option>
                    <option value="important">{t.wordBank.filterImportant}</option>
                    <option value="mastered">{t.wordBank.filterMastered}</option>
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
            </div>

            <WordBankBrowseTable
                variant="bank"
                search={debouncedSearch}
                filter={filter}
                sortKey={sortKey}
                sortDir={sortDir}
                onView={onView}
                onTotalChange={handleTotalChange}
                restoreState={activeRestore}
            />
        </div>
    );
});
