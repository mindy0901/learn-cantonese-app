import { useCallback, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { AddGrammarModal } from "../components/AddGrammarModal.jsx";
import { GrammarBankListPanel } from "../components/GrammarBankListPanel.jsx";
import { useGrammarCount, useGrammarBank, useAppActions } from "../store/appStore.js";
import { usePrefsStore, useGrammarBankPrefs } from "../store/prefsStore.js";
import { useLocale } from "../store/localeStore.js";
import { btnClass } from "../components/ui/buttonStyles.js";
import { EmptyState } from "../components/ui/EmptyState.jsx";
import { IconGrammar } from "../components/NavIcons.jsx";

export function GrammarBankPage() {
    const { isAdmin } = useOutletContext();
    const grammarCount = useGrammarCount();
    const items = useGrammarBank();
    const { createGrammar, editGrammar } = useAppActions();
    const { t } = useLocale();
    const prefs = useGrammarBankPrefs();
    const setGrammarBankPrefs = usePrefsStore((s) => s.setGrammarBankPrefs);

    const [addOpen, setAddOpen] = useState(false);
    const [editItem, setEditItem] = useState(null);

    const { filter, sortKey, sortDir } = prefs;

    const handleFilterChange = useCallback((patch) => setGrammarBankPrefs(patch), [setGrammarBankPrefs]);

    return (
        <main className="flex-1 max-w-[1800px] w-full mx-auto px-5 pt-8 pb-12">
            <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                    <h1>{t.grammarBank.title}</h1>
                </div>
                <div className="flex gap-2 shrink-0">
                    {isAdmin && (
                        <>
                            <button type="button" className={btnClass("success")} onClick={() => setAddOpen(true)}>
                                + {t.grammarBank.addItem}
                            </button>
                        </>
                    )}
                </div>
            </div>

            {grammarCount === 0 ? (
                <EmptyState
                    icon={<IconGrammar size={28} />}
                    title={t.grammarBank.empty}
                    description={isAdmin ? t.grammarBank.emptyAdminHint : undefined}
                    action={
                        isAdmin && (
                            <button type="button" className={btnClass("primary")} onClick={() => setAddOpen(true)}>
                                + {t.grammarBank.addItem}
                            </button>
                        )
                    }
                />
            ) : (
                <GrammarBankListPanel
                    filter={filter}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onFilterChange={handleFilterChange}
                />
            )}

            {addOpen && (
                <AddGrammarModal onSave={createGrammar} onClose={() => setAddOpen(false)} existingItems={items} />
            )}
            {editItem && (
                <AddGrammarModal
                    item={items.find((g) => g.id === editItem.id) ?? editItem}
                    onSave={editGrammar}
                    onClose={() => setEditItem(null)}
                    existingItems={items}
                />
            )}
        </main>
    );
}
