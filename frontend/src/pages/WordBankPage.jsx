import { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { AddWordPanel } from "../components/AddWordPanel.jsx";
import { OcrScanPanel } from "../components/OcrScanPanel.jsx";
import { EditWordPanel } from "../components/EditWordPanel.jsx";
import { WordBankListPanel } from "../components/WordBankListPanel.jsx";
import { usePrefsStore, useWordBankPrefs } from "../store/prefsStore.js";
import { useLocale } from "../store/localeStore.js";
import { useIsSignedIn } from "../store/authStore.js";
import { useAppActions } from "../store/appStore.js";
import { Button } from "../components/shadcn/button.jsx";
import { useOpenWordDetail } from "../hooks/useOpenWordDetail.js";
import { loadWordBankReturnState } from "../lib/wordBankReturn.js";

export function WordBankPage() {
    const { isAdmin } = useOutletContext();
    const { t } = useLocale();
    const isSignedIn = useIsSignedIn();
    const { fetchVocabularySets } = useAppActions();
    const openWordDetail = useOpenWordDetail();
    const prefs = useWordBankPrefs();
    const setWordBankPrefs = usePrefsStore((s) => s.setWordBankPrefs);
    const [restoreState] = useState(() => loadWordBankReturnState());

    const [addOpen, setAddOpen] = useState(false);
    const [scanOpen, setScanOpen] = useState(false);
    const [editWord, setEditWord] = useState(null);

    useEffect(() => {
        if (isSignedIn) fetchVocabularySets().catch(() => {});
    }, [isSignedIn, fetchVocabularySets]);

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
            <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                    <h1>{t.wordBank.title}</h1>
                </div>
                <div className="flex shrink-0 gap-2">
                    {isAdmin && (
                        <div className="flex shrink-0 gap-2">
                            <Button type="button" variant="outline" onClick={() => setScanOpen(true)}>
                                {t.addWord.ocrScan}
                            </Button>
                            <Button type="button" variant="default" onClick={() => setAddOpen(true)}>
                                + {t.wordBank.addWord}
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            <WordBankListPanel
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
