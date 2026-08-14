import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../store/localeStore.js";
import { useAppActions, useVocabularies } from "../store/appStore.js";
import { useIsSignedIn } from "../store/authStore.js";
import { WordDetailContent } from "./WordDetailContent.jsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./shadcn/dialog.jsx";
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
    const [headerEl, setHeaderEl] = useState(null);

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
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent
                showCloseButton
                className="max-w-360 gap-0 overflow-hidden p-0 h-[min(calc(100dvh-100vw+1440px),calc(100dvh-2rem))] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-360"
            >
                <DialogHeader className="sr-only">
                    <DialogTitle>{t.common.edit}</DialogTitle>
                </DialogHeader>

                {/* Header row — cụm meta chips (portaled) nằm cùng hàng với nút X */}
                <div
                    ref={setHeaderEl}
                    className="col-start-1 row-start-1 flex min-h-10 w-full min-w-0 items-center px-6 py-2 pr-12"
                />

                {/* Body */}
                <div className="col-start-1 row-start-2 flex min-h-0 flex-col overflow-y-auto overscroll-contain">
                    {resolving && !liveVocabulary ? (
                        <div className="px-6 py-12">
                            <p className="text-muted-foreground text-sm text-center">{t.common.loading}</p>
                        </div>
                    ) : !liveVocabulary ? (
                        <div className="text-center py-12 px-6 text-muted-foreground flex flex-col items-center gap-4">
                            <p>{t.wordDetail.notFound}</p>
                        </div>
                    ) : (
                        <section className="flex min-h-0 flex-col rounded-xl bg-card px-4 py-6 sm:px-8">
                            <WordDetailContent
                                key={liveVocabulary.id}
                                vocabulary={vocabularies.find((v) => v.id === liveVocabulary.id) ?? liveVocabulary}
                                canEdit
                                initialEditing
                                onSave={handleSave}
                                footerRef={footerRef}
                                headerRef={{ current: headerEl }}
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
                <div ref={footerRef} className="col-start-1 row-start-3 mt-2 shrink-0 px-6 pb-4" />
            </DialogContent>
        </Dialog>
    );
}
