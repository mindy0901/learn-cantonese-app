import { useCallback, useEffect, useState } from "react";
import { AddWordPanel } from "../components/AddWordPanel.jsx";
import { OcrScanPanel } from "../components/OcrScanPanel.jsx";
import { EditWordPanel } from "../components/EditWordPanel.jsx";
import { WordBankListPanel } from "../components/WordBankListPanel.jsx";
import { usePrefsStore, useWordBankPrefs } from "../store/prefsStore.js";
import { useIsSignedIn } from "../store/authStore.js";
import { useAppActions, useVocabularySets } from "../store/appStore.js";
import { useOpenWordDetail } from "../hooks/useOpenWordDetail.js";
import { loadWordBankReturnState } from "../lib/wordBankReturn.js";

export function WordBankPage() {
    const isSignedIn = useIsSignedIn();
    const { fetchVocabularySets } = useAppActions();
    const hasSets = useVocabularySets().length > 0;
    const openWordDetail = useOpenWordDetail();
    const prefs = useWordBankPrefs();
    const setWordBankPrefs = usePrefsStore((s) => s.setWordBankPrefs);
    const [restoreState] = useState(() => loadWordBankReturnState());

    const [addOpen, setAddOpen] = useState(false);
    const [scanOpen, setScanOpen] = useState(false);
    const [editWord, setEditWord] = useState(null);

    // Fetch sets LAZY — chỉ khi store còn rỗng (mới đăng nhập / F5). Quay lại trang từ nav
    // khác → sets đã có trong store (mọi mutation đều cập nhật store) → KHÔNG gọi API nữa. (2026-08-21)
    useEffect(() => {
        if (isSignedIn && !hasSets) fetchVocabularySets().catch(() => {});
    }, [isSignedIn, hasSets, fetchVocabularySets]);

    const {
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
    } = prefs;

    const handleView = useCallback((word) => openWordDetail(word), [openWordDetail]);
    const handleEdit = useCallback((word) => setEditWord(word), []);
    const handleFilterChange = useCallback((patch) => setWordBankPrefs(patch), [setWordBankPrefs]);

    return (
        <main className="page-grid-bg flex-1 w-full px-4 py-8 pb-12">
            <WordBankListPanel
                onScan={() => setScanOpen(true)}
                onAdd={() => setAddOpen(true)}
                filter={filter}
                showImportant={showImportant}
                showMastered={showMastered}
                hskLevel={hskLevel}
                setId={setId}
                sortKey={sortKey}
                sortDir={sortDir}
                searchColumn={searchColumn}
                columnVisibility={columnVisibility}
                pageSize={pageSize}
                isSignedIn={isSignedIn}
                onFilterChange={handleFilterChange}
                onView={handleView}
                onEdit={handleEdit}
                restoreState={restoreState}
            />

            {addOpen && <AddWordPanel onClose={() => setAddOpen(false)} />}
            {scanOpen && <OcrScanPanel onClose={() => setScanOpen(false)} />}
            {editWord && <EditWordPanel vocabulary={editWord} onClose={() => setEditWord(null)} />}
        </main>
    );
}
