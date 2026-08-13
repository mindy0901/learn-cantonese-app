import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "../store/localeStore.js";
import { useVocabularySets, useAppActions } from "../store/appStore.js";
import { getWordBankSortDirLabel } from "../lib/wordFilters.js";
import { wordBankReturnMatches } from "../lib/wordBankReturn.js";
import { useDebouncedValue } from "../hooks/useDebouncedValue.js";
import { bankToolbarRowClass } from "./ui/bankToolbarStyles.js";
import { Button } from "./shadcn/button.jsx";
import { Checkbox } from "./shadcn/checkbox.jsx";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "./shadcn/select.jsx";
import { BankSearchInput } from "./BankSearchInput.jsx";
import { WordBankBrowseTable } from "./WordBankBrowseTable.jsx";

export const WordBankListPanel = memo(function WordBankListPanel({
    filter,
    showImportant,
    showMastered,
    hskLevel,
    setId,
    sortKey,
    sortDir,
    searchColumn,
    isSignedIn = false,
    onFilterChange,
    onView,
    onEdit,
    restoreState = null,
}) {
    const { t, fmt } = useLocale();
    const sets = useVocabularySets();
    const { fetchVocabularySets } = useAppActions();
    const browseContext = useMemo(
        () => ({ filter, showImportant, showMastered, hskLevel, setId, sortKey, sortDir }),
        [filter, showImportant, showMastered, hskLevel, setId, sortKey, sortDir],
    );
    useEffect(() => {
        if (!isSignedIn) return;
        fetchVocabularySets().catch(() => {});
    }, [isSignedIn, fetchVocabularySets]);
    const setVocabularyIds = useMemo(() => Object.fromEntries(sets.map((s) => [s.id, s.vocabularyIds])), [sets]);
    const activeRestore = useMemo(
        () => (wordBankReturnMatches(restoreState, browseContext) ? restoreState : null),
        [restoreState, browseContext],
    );
    const [search, setSearch] = useState(() => activeRestore?.search ?? "");
    const debouncedSearch = useDebouncedValue(search, 500);
    const [filteredTotal, setFilteredTotal] = useState(0);
    const handleSearch = useCallback((value) => setSearch(value), []);
    const handleTotalChange = useCallback((total) => setFilteredTotal(total), []);

    const hskLevels = [
        { value: "all", label: t.wordBank.levelAll },
        { value: "1", label: "HSK 1" },
        { value: "2", label: "HSK 2" },
        { value: "3", label: "HSK 3" },
        { value: "4", label: "HSK 4" },
        { value: "5", label: "HSK 5" },
        { value: "6", label: "HSK 6" },
        { value: "7-9", label: "HSK 7-9" },
    ];

    const searchColumns = [
        { value: "sinoVietnamese", label: t.wordBank.colSinoVietnamese },
        { value: "han", label: t.wordBank.colHanChars },
        { value: "meaning", label: t.wordBank.colMeaning },
    ];

    const sortOptions = [
        { value: "sinoVietnamese", label: t.sort.sinoVietnamese },
        { value: "hanTraditional", label: t.sort.hanTraditional },
        { value: "pinyin", label: t.sort.pinyin },
        { value: "jyutping", label: t.sort.jyutping },
        { value: "createdAt", label: t.sort.createdAt },
    ];

    const sortDirLabel = getWordBankSortDirLabel(sortKey, sortDir, t);

    const setOptions = [
        { value: "all", label: t.vocabSets.filterAll },
        ...sets.map((s) => ({ value: s.id, label: s.name })),
    ];

    return (
        <div className="w-full">
            <div className={bankToolbarRowClass}>
                <Select value={hskLevel} onValueChange={(value) => onFilterChange({ hskLevel: value })}>
                    <SelectTrigger aria-label={t.wordBank.levelFilter}>
                        <SelectValue>{hskLevels.find((o) => o.value === hskLevel)?.label ?? hskLevel}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectGroup>
                            {hskLevels.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                    {o.label}
                                </SelectItem>
                            ))}
                        </SelectGroup>
                    </SelectContent>
                </Select>
                {isSignedIn && (
                    <Select value={setId} onValueChange={(value) => onFilterChange({ setId: value })}>
                        <SelectTrigger aria-label={t.vocabSets.filterLabel || "Set"}>
                            <SelectValue>{setOptions.find((o) => o.value === setId)?.label ?? setId}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectGroup>
                                {setOptions.map((o) => (
                                    <SelectItem key={o.value} value={o.value}>
                                        {o.label}
                                    </SelectItem>
                                ))}
                            </SelectGroup>
                        </SelectContent>
                    </Select>
                )}
                <Select
                    value={sortKey}
                    onValueChange={(value) => {
                        onFilterChange({
                            sortKey: value,
                            ...(value === "createdAt" && sortKey !== "createdAt" ? { sortDir: "desc" } : {}),
                        });
                    }}
                >
                    <SelectTrigger aria-label={t.wordBank.sortBy}>
                        <SelectValue>{sortOptions.find((o) => o.value === sortKey)?.label ?? sortKey}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectGroup>
                            {sortOptions.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                    {o.label}
                                </SelectItem>
                            ))}
                        </SelectGroup>
                    </SelectContent>
                </Select>
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => onFilterChange({ sortDir: sortDir === "asc" ? "desc" : "asc" })}
                >
                    {sortDirLabel}
                </Button>
                <label className="inline-flex cursor-pointer items-center gap-1.5 px-2 py-1 text-sm select-none">
                    <Checkbox
                        checked={showImportant}
                        onCheckedChange={(checked) => onFilterChange({ showImportant: Boolean(checked) })}
                    />
                    <span className="text-foreground">{t.wordBank.filterImportant}</span>
                </label>
                <label className="inline-flex cursor-pointer items-center gap-1.5 px-2 py-1 text-sm select-none">
                    <Checkbox
                        checked={showMastered}
                        onCheckedChange={(checked) => onFilterChange({ showMastered: Boolean(checked) })}
                    />
                    <span className="text-foreground">{t.wordBank.filterMastered}</span>
                </label>
                <div className="ml-auto flex min-w-0 items-center gap-2">
                    <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
                        <span className="text-sm font-medium text-muted-foreground">{t.wordBank.searchIn}</span>
                        <Select value={searchColumn} onValueChange={(value) => onFilterChange({ searchColumn: value })}>
                            <SelectTrigger aria-label={t.wordBank.searchIn || "Search in"}>
                                <SelectValue>
                                    {searchColumns.find((o) => o.value === searchColumn)?.label ?? searchColumn}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    {searchColumns.map((o) => (
                                        <SelectItem key={o.value} value={o.value}>
                                            {o.label}
                                        </SelectItem>
                                    ))}
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                    </div>
                    <BankSearchInput
                        className="min-w-0 w-full shrink-0 min-[640px]:w-auto min-[640px]:min-w-55 min-[640px]:max-w-75 min-[640px]:flex-[1_1_240px]"
                        onChange={handleSearch}
                        placeholder={t.wordBank.searchPlaceholder}
                        initialValue={activeRestore?.search ?? ""}
                    />
                </div>
            </div>

            <WordBankBrowseTable
                variant="bank"
                search={debouncedSearch}
                searchColumn={searchColumn}
                filter={filter}
                showImportant={showImportant}
                showMastered={showMastered}
                hskLevel={hskLevel}
                setId={setId}
                setVocabularyIds={setVocabularyIds}
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
