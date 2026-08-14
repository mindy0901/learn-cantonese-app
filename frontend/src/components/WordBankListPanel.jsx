import { memo, useEffect, useMemo } from "react";
import { useVocabularySets, useAppActions } from "../store/appStore.js";
import { wordBankReturnMatches } from "../lib/wordBankReturn.js";
import { useIsSignedIn } from "../store/authStore.js";
import { WordBankBrowseTable } from "./WordBankBrowseTable.jsx";

/**
 * Panel kho từ vựng — toolbar (search + faceted filter + sort + column toggle)
 * nằm TRONG WordBankBrowseTable (giống template shadcn data-table). Panel chỉ
 * fetch vocabulary sets + seed prefs ban đầu + restore state khi quay lại.
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
    isSignedIn = false,
    onFilterChange,
    onView,
    onEdit,
    restoreState = null,
}) {
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
    const activeRestore = useMemo(
        () => (wordBankReturnMatches(restoreState, browseContext) ? restoreState : null),
        [restoreState, browseContext],
    );

    return (
        <div className="w-full">
            <WordBankBrowseTable
                variant="bank"
                initial={{
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
                restoreState={activeRestore}
            />
        </div>
    );
});
