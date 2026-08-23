import { memo, useMemo } from "react";
import { wordBankReturnMatches } from "../lib/wordBankReturn.js";
import { WordBankBrowseTable } from "./WordBankBrowseTable.jsx";

/**
 * Panel kho từ vựng — toolbar (search + faceted filter + sort + column toggle)
 * nằm TRONG WordBankBrowseTable (giống template shadcn data-table). Panel chỉ
 * seed prefs ban đầu + restore state khi quay lại.
 * ⚠️ KHÔNG fetch vocabulary sets ở đây — WordBankPage (cha) đã fetch khi mount;
 * VocabularySetsManager (avatar dropdown) tự fetch riêng. (2026-08-21)
 */
export const WordBankListPanel = memo(function WordBankListPanel({
    filter,
    showImportant,
    showMastered,
    hskLevel,
    setId,
    sortKey,
    sortDir,
    searchColumn,
    columnVisibility,
    pageSize,
    onFilterChange,
    onView,
    onEdit,
    onScan,
    onAdd,
    restoreState = null,
}) {
    const browseContext = useMemo(
        () => ({ filter, showImportant, showMastered, hskLevel, setId, sortKey, sortDir }),
        [filter, showImportant, showMastered, hskLevel, setId, sortKey, sortDir],
    );
    const activeRestore = useMemo(
        () => (wordBankReturnMatches(restoreState, browseContext) ? restoreState : null),
        [restoreState, browseContext],
    );

    return (
        <div className="w-full">
            <WordBankBrowseTable
                variant="bank"
                initial={{
                    filter,
                    hskLevel,
                    setId,
                    showImportant,
                    showMastered,
                    sortKey,
                    sortDir,
                    searchColumn,
                    columnVisibility,
                    pageSize,
                }}
                onStateChange={onFilterChange}
                onView={onView}
                onEdit={onEdit}
                onScan={onScan}
                onAdd={onAdd}
                restoreState={activeRestore}
            />
        </div>
    );
});
