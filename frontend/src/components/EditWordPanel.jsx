import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../lib/cn.js";
import { useLocale } from "../store/localeStore.js";
import { useAppActions, useVocabularies } from "../store/appStore.js";
import { useIsSignedIn } from "../store/authStore.js";
import { WordDetailContent } from "./WordDetailContent.jsx";
import { IconClose } from "./NavIcons.jsx";
import { log, logWarn } from "../lib/actionLog.js";

/**
 * Fullscreen overlay popup embedding the edit page experience.
 * Centered card layout — identical mechanism to WordDetailPage.
 */
export function EditWordPanel({ vocabulary, onClose }) {
    const { t } = useLocale();
    const vocabularies = useVocabularies();
    const { ensureVocabulariesByIds, toggleImportant, toggleMastered, editVocabulary } = useAppActions();
    const canMark = useIsSignedIn();
    const [resolving, setResolving] = useState(true);
    const footerRef = useRef(null);

    const [currentVocabularyId, setCurrentVocabularyId] = useState(vocabulary.id);
    useEffect(() => setCurrentVocabularyId(vocabulary.id), [vocabulary.id]);

    const liveVocabulary = useMemo(
        () => vocabularies.find((v) => v.id === currentVocabularyId) ?? vocabulary,
        [vocabularies, currentVocabularyId, vocabulary],
    );

    const handleNextRandom = useCallback(() => {
        const pool = vocabularies.filter((v) => v.id !== currentVocabularyId);
        if (pool.length === 0) return;
        const next = pool[Math.floor(Math.random() * pool.length)];
        setCurrentVocabularyId(next.id);
        ensureVocabulariesByIds([next.id]).catch(() => {});
    }, [vocabularies, currentVocabularyId, ensureVocabulariesByIds]);

    const handleSave = useCallback(
        async (v, patch) => {
            await editVocabulary(v, patch);
            onClose();
        },
        [editVocabulary, onClose],
    );

    useEffect(() => {
        let cancelled = false;
        setResolving(true);
        log("Get vocabulary detail (popup)", currentVocabularyId);
        ensureVocabulariesByIds([currentVocabularyId])
            .catch((err) => logWarn("Get vocabulary detail failed", err instanceof Error ? err.message : err))
            .finally(() => {
                if (!cancelled) setResolving(false);
            });
        return () => {
            cancelled = true;
        };
    }, [currentVocabularyId, ensureVocabulariesByIds]);

    return (
        <div
            className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto overscroll-contain bg-black/40 px-4 py-[max(1.25rem,env(safe-area-inset-top,0px))] pb-[max(1.25rem,env(safe-area-inset-bottom,0px))]"
            onClick={onClose}
            role="presentation"
        >
            <div
                className="m-auto flex w-full max-w-[960px] shrink-0 flex-col rounded-2xl bg-surface shadow-[0_20px_40px_rgba(0,0,0,0.15)] max-h-[min(calc(100vh-2.5rem),calc(100dvh-2.5rem))]"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-label={t.common.edit}
            >
                {/* Header: close button only */}
                <div className="flex items-center justify-end shrink-0 border-b border-border px-6 py-4 mb-2">
                    <button
                        type="button"
                        className="inline-flex items-center justify-center size-9 rounded-xl text-text-muted hover:bg-bg hover:text-text-h transition-colors"
                        onClick={onClose}
                        aria-label={t.common.close}
                    >
                        <IconClose size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
                    {resolving && !liveVocabulary ? (
                        <div className="px-6 py-12">
                            <p className="text-text-muted text-sm text-center">{t.common.loading}</p>
                        </div>
                    ) : !liveVocabulary ? (
                        <div className="text-center py-12 px-6 text-text-muted flex flex-col items-center gap-4">
                            <p>{t.wordDetail.notFound}</p>
                        </div>
                    ) : (
                        <section className="flex min-h-0 flex-col rounded-xl bg-surface px-5 py-6 sm:px-8 sm:py-8">
                            <WordDetailContent
                                key={liveVocabulary.id}
                                vocabulary={vocabularies.find((v) => v.id === liveVocabulary.id) ?? liveVocabulary}
                                canEdit
                                initialEditing
                                onSave={handleSave}
                                footerRef={footerRef}
                                onNextRandom={vocabularies.length > 1 ? handleNextRandom : undefined}
                                {...(canMark && {
                                    onToggleImportant: toggleImportant,
                                    onToggleMastered: toggleMastered,
                                })}
                            />
                        </section>
                    )}
                </div>

                {/* Fixed footer — action bar rendered here via portal */}
                <div ref={footerRef} className="shrink-0 mt-2" />
            </div>
        </div>
    );
}
