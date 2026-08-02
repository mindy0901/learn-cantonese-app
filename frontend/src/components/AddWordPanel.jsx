import { useCallback, useMemo } from "react";
import { useLocale } from "../store/localeStore.js";
import { useAppActions } from "../store/appStore.js";
import { WordDetailContent } from "./WordDetailContent.jsx";
import { IconClose } from "./NavIcons.jsx";
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
        <div
            className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto overscroll-contain bg-black/40 px-4 py-[max(1.25rem,env(safe-area-inset-top,0px))] pb-[max(1.25rem,env(safe-area-inset-bottom,0px))]"
            onClick={onClose}
            role="presentation"
        >
            <div
                className="m-auto flex w-full max-w-[640px] shrink-0 flex-col overflow-hidden rounded-2xl bg-surface shadow-[0_20px_40px_rgba(0,0,0,0.15)] max-h-[min(calc(100vh-2.5rem),calc(100dvh-2.5rem))]"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-label={t.addWord.title}
            >
                <div className="flex items-center justify-end shrink-0 border-b border-border px-6 py-3">
                    <button
                        type="button"
                        className="inline-flex items-center justify-center size-9 rounded-xl text-text-muted hover:bg-bg hover:text-text-h transition-colors"
                        onClick={onClose}
                        aria-label={t.common.close}
                    >
                        <IconClose size={20} />
                    </button>
                </div>

                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
                    <section className="flex min-h-0 flex-col rounded-xl bg-surface px-5 py-7 sm:px-8 sm:py-8">
                        <WordDetailContent vocabulary={stubWord} canEdit initialEditing onSave={handleSave} />
                    </section>
                </div>
            </div>
        </div>
    );
}
