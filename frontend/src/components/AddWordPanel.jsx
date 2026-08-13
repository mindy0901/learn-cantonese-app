import { useCallback, useMemo } from "react";
import { useLocale } from "../store/localeStore.js";
import { useAppActions } from "../store/appStore.js";
import { WordDetailContent } from "./WordDetailContent.jsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./shadcn/dialog.jsx";
import { emptyVocabulary } from "../types/word.js";

/**
 * Modal for creating a new vocabulary word.
 * Reuses WordDetailContent in edit mode — same mechanism as EditWordPanel.
 */
export function AddWordPanel({ onClose, initialHanTraditional }) {
    const { t } = useLocale();
    const { createVocabulary } = useAppActions();

    // Fresh stub each mount — ensures unique UUID per add session
    const stubWord = useMemo(
        () => emptyVocabulary({ hanTraditional: initialHanTraditional?.trim() || "" }),
        [initialHanTraditional],
    );

    const handleSave = useCallback(
        async (_word, patch) => {
            const newWord = { ...stubWord, ...patch };
            await createVocabulary(newWord);
            onClose();
        },
        [createVocabulary, onClose, stubWord],
    );

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent
                showCloseButton
                className="max-w-360 gap-0 overflow-hidden p-0 max-h-[min(calc(100vh-2rem),calc(100dvh-2rem))] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-360"
            >
                <DialogHeader className="sr-only">
                    <DialogTitle>{t.addWord.title}</DialogTitle>
                </DialogHeader>

                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
                    <section className="flex min-h-0 flex-col gap-4 rounded-xl bg-card px-4 py-6 sm:px-8">
                        <WordDetailContent vocabulary={stubWord} canEdit initialEditing onSave={handleSave} />
                    </section>
                </div>
            </DialogContent>
        </Dialog>
    );
}
