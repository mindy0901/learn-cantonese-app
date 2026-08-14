import { useCallback, useMemo, useRef, useState } from "react";
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
    const [headerEl, setHeaderEl] = useState(null);
    const footerRef = useRef(null);

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
                className="max-w-360 gap-0 overflow-hidden p-0 h-[min(calc(100dvh-100vw+1440px),calc(100dvh-2rem))] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-360"
            >
                <DialogHeader className="sr-only">
                    <DialogTitle>{t.addWord.title}</DialogTitle>
                </DialogHeader>

                {/* Header row — cụm meta chips (portaled) nằm cùng hàng với nút X */}
                <div
                    ref={setHeaderEl}
                    className="col-start-1 row-start-1 flex min-h-10 w-full min-w-0 items-center px-6 py-2 pr-12"
                />

                <div className="col-start-1 row-start-2 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
                    <section className="flex min-h-0 flex-col gap-4 rounded-xl bg-card px-4 py-6 sm:px-8">
                        <WordDetailContent
                            vocabulary={stubWord}
                            canEdit
                            initialEditing
                            addMode
                            headerRef={{ current: headerEl }}
                            footerRef={footerRef}
                            onSave={handleSave}
                        />
                    </section>
                </div>

                {/* Fixed footer — action bar (Đặt lại / Lưu) */}
                <div ref={footerRef} className="col-start-1 row-start-3 mt-2 shrink-0 px-6 pb-4" />
            </DialogContent>
        </Dialog>
    );
}
