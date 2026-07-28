import { useCallback, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { AddSentenceModal } from "../components/AddSentenceModal.jsx";
import { SentenceBankListPanel } from "../components/SentenceBankListPanel.jsx";
import { SentenceDetailModal } from "../components/SentenceDetailModal.jsx";
import { useSentenceCount, useSentencePatterns, useAppActions } from "../store/appStore.js";
import { usePrefsStore, useSentenceBankPrefs } from "../store/prefsStore.js";
import { useLocale } from "../store/localeStore.js";
import { useIsSignedIn } from "../store/authStore.js";
import { btnClass } from "../components/ui/buttonStyles.js";
import { EmptyState } from "../components/ui/EmptyState.jsx";
import { IconSentences } from "../components/NavIcons.jsx";

export function SentencePatternsPage() {
    const { isAdmin } = useOutletContext();
    const sentenceCount = useSentenceCount();
    const items = useSentencePatterns();
    const { createSentence, editSentence, toggleSentenceImportant, toggleSentenceMastered } = useAppActions();
    const { t } = useLocale();
    const canMark = useIsSignedIn();
    const prefs = useSentenceBankPrefs();
    const setSentenceBankPrefs = usePrefsStore((s) => s.setSentenceBankPrefs);

    const [addOpen, setAddOpen] = useState(false);
    const [viewItem, setViewItem] = useState(null);
    const [editItem, setEditItem] = useState(null);

    const { filter, sortKey, sortDir } = prefs;

    const handleView = useCallback((item) => setViewItem(item), []);
    const handleFilterChange = useCallback((patch) => setSentenceBankPrefs(patch), [setSentenceBankPrefs]);

    return (
        <main className="flex-1 max-w-[1800px] w-full mx-auto px-5 pt-8 pb-12">
            <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                    <h1>{t.sentenceBank.title}</h1>
                </div>
                <div className="flex gap-2 shrink-0">
                    {isAdmin && (
                        <button type="button" className={btnClass("success")} onClick={() => setAddOpen(true)}>
                            + {t.sentenceBank.addItem}
                        </button>
                    )}
                </div>
            </div>

            {sentenceCount === 0 ? (
                <EmptyState
                    icon={<IconSentences size={28} />}
                    title={t.sentenceBank.empty}
                    description={isAdmin ? t.sentenceBank.emptyAdminHint : undefined}
                    action={
                        isAdmin && (
                            <button type="button" className={btnClass("primary")} onClick={() => setAddOpen(true)}>
                                + {t.sentenceBank.addItem}
                            </button>
                        )
                    }
                />
            ) : (
                <SentenceBankListPanel
                    filter={filter}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onFilterChange={handleFilterChange}
                    onView={handleView}
                />
            )}

            {addOpen && (
                <AddSentenceModal onSave={createSentence} onClose={() => setAddOpen(false)} existingItems={items} />
            )}
            {editItem && (
                <AddSentenceModal
                    item={items.find((s) => s.id === editItem.id) ?? editItem}
                    onSave={editSentence}
                    onClose={() => setEditItem(null)}
                    existingItems={items}
                />
            )}
            {viewItem && (
                <SentenceDetailModal
                    item={items.find((s) => s.id === viewItem.id) ?? viewItem}
                    onClose={() => setViewItem(null)}
                    onToggleImportant={canMark ? toggleSentenceImportant : undefined}
                    onToggleMastered={canMark ? toggleSentenceMastered : undefined}
                    canEdit={isAdmin}
                    onEdit={(item) => {
                        setViewItem(null);
                        setEditItem(item);
                    }}
                />
            )}
        </main>
    );
}
