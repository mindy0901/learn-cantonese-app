import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "../store/localeStore.js";
import { useGrammarBank } from "../store/appStore.js";
import { filterAndSortGrammar } from "../lib/grammarFilters.js";
import { paginateItems } from "../lib/pagination.js";
import { PAGE_SIZE } from "../lib/constants.js";
import { BankSearchInput } from "./BankSearchInput.jsx";
import { Pagination } from "./Pagination.jsx";
import { GrammarPickerItem } from "./GrammarPickerItem.jsx";
import { btnClass } from "./ui/buttonStyles.js";

export const GrammarPicker = memo(function GrammarPicker({ selected, onToggle, onClear }) {
    const { t, fmt } = useLocale();
    const grammarBank = useGrammarBank();
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const handleChange = useCallback((value) => setSearch(value), []);

    const filtered = useMemo(
        () => filterAndSortGrammar(grammarBank, search, "all", "title", "asc", true),
        [grammarBank, search],
    );

    useEffect(() => {
        setPage(1);
    }, [search]);

    const {
        items,
        page: safePage,
        totalPages,
        total,
        startIndex,
    } = useMemo(() => paginateItems(filtered, page), [filtered, page]);

    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
    }, [page, totalPages]);

    const hasQuery = search.trim().length > 0;

    const handleClear = () => {
        if (onClear) onClear();
    };

    return (
        <div className="border border-border rounded-[0.625rem] overflow-hidden">
            <div className="p-3 border-b border-border flex flex-col gap-2">
                <BankSearchInput onChange={handleChange} placeholder={t.picker.searchGrammarBank} />
            </div>

            <div className="flex justify-between items-center px-3 py-2 bg-bg text-[0.8125rem] text-text-muted">
                <span>{fmt(t.picker.selected, { count: selected.size })}</span>
                <div className="flex gap-1.5">
                    <button type="button" className={btnClass("ghost", "sm")} onClick={handleClear}>
                        {t.picker.clear}
                    </button>
                </div>
            </div>

            <div className="max-h-[280px] overflow-y-auto p-2 flex flex-col gap-1">
                {items.length === 0 ? (
                    <p className="text-text-muted text-sm">
                        {hasQuery ? t.picker.noGrammarMatch : t.picker.searchGrammarBankHint}
                    </p>
                ) : (
                    items.map((item) => (
                        <GrammarPickerItem
                            key={item.id}
                            item={item}
                            checked={selected.has(item.id)}
                            onToggle={onToggle}
                        />
                    ))
                )}
            </div>

            <Pagination
                page={safePage}
                totalPages={totalPages}
                total={total}
                startIndex={startIndex}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
            />
        </div>
    );
});
