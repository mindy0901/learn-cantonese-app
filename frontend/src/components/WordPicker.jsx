import { memo, useCallback, useState } from "react";
import { useLocale } from "../store/localeStore.js";
import { useDebouncedValue } from "../hooks/useDebouncedValue.js";
import { BankSearchInput } from "./BankSearchInput.jsx";
import { WordBankBrowseTable } from "./WordBankBrowseTable.jsx";

export const WordPicker = memo(function WordPicker({ selected, onToggle, onAddNew }) {
    const { t } = useLocale();
    const [search, setSearch] = useState("");
    const debouncedSearch = useDebouncedValue(search, 300);
    const handleChange = useCallback((value) => setSearch(value), []);

    return (
        <div className="border border-border rounded-[10px] overflow-hidden">
            <div className="p-3 border-b border-border flex flex-col gap-2">
                <BankSearchInput onChange={handleChange} placeholder={t.picker.searchBank} />
            </div>

            <WordBankBrowseTable
                variant="picker"
                search={debouncedSearch}
                filter="all"
                sortKey="createdAt"
                sortDir="desc"
                selected={selected}
                onToggleSelect={onToggle}
                emptyHint={t.picker.searchBankHint}
                emptyNoMatch={t.picker.noMatch}
                onAddNew={onAddNew}
            />
        </div>
    );
});
