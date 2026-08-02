import { useCallback, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { PinyinSyncButton } from "../components/PinyinSyncButton.jsx";
import { JyutpingSyncButton } from "../components/JyutpingSyncButton.jsx";
import { AddWordPanel } from "../components/AddWordPanel.jsx";
import { EditWordPanel } from "../components/EditWordPanel.jsx";
import { WordBankListPanel } from "../components/WordBankListPanel.jsx";
import { usePrefsStore, useWordBankPrefs } from "../store/prefsStore.js";
import { useLocale } from "../store/localeStore.js";
import { btnClass } from "../components/ui/buttonStyles.js";
import { useOpenWordDetail } from "../hooks/useOpenWordDetail.js";
import { loadWordBankReturnState } from "../lib/wordBankReturn.js";

export function WordBankPage() {
    const { isAdmin } = useOutletContext();
    const { t } = useLocale();
    const openWordDetail = useOpenWordDetail();
    const prefs = useWordBankPrefs();
    const setWordBankPrefs = usePrefsStore((s) => s.setWordBankPrefs);
    const [restoreState] = useState(() => loadWordBankReturnState());

    const [addOpen, setAddOpen] = useState(false);
    const [editWord, setEditWord] = useState(null);

    const { filter, showImportant, showMastered, hskLevel, sortKey, sortDir } = prefs;

    const handleView = useCallback((word) => openWordDetail(word), [openWordDetail]);
    const handleEdit = useCallback((word) => setEditWord(word), []);
    const handleFilterChange = useCallback((patch) => setWordBankPrefs(patch), [setWordBankPrefs]);

    return (
        <main className="flex-1 w-full px-5 pt-8 pb-12">
            <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                    <h1>{t.wordBank.title}</h1>
                </div>
                <div className="flex gap-2 shrink-0">
                    {isAdmin && (
                        <>
                            <PinyinSyncButton />
                            <JyutpingSyncButton />
                            <button type="button" className={btnClass("success")} onClick={() => setAddOpen(true)}>
                                + {t.wordBank.addWord}
                            </button>
                        </>
                    )}
                </div>
            </div>

            <WordBankListPanel
                filter={filter}
                showImportant={showImportant}
                showMastered={showMastered}
                hskLevel={hskLevel}
                sortKey={sortKey}
                sortDir={sortDir}
                onFilterChange={handleFilterChange}
                onView={handleView}
                onEdit={handleEdit}
                restoreState={restoreState}
            />

            {addOpen && <AddWordPanel onClose={() => setAddOpen(false)} />}
            {editWord && <EditWordPanel vocabulary={editWord} onClose={() => setEditWord(null)} />}
        </main>
    );
}
