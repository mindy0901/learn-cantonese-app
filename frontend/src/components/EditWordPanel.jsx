import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "../lib/cn.js";
import { useLocale } from "../store/localeStore.js";
import { useAppActions, useLessons, useVocabularies } from "../store/appStore.js";
import { useIsSignedIn } from "../store/authStore.js";
import { WordDetailContent } from "./WordDetailContent.jsx";
import { IconClose } from "./NavIcons.jsx";
import { log, logWarn } from "../lib/actionLog.js";

/**
 * Fullscreen overlay popup embedding the edit page experience.
 * Centered card layout — identical mechanism to WordDetailPage.
 */
export function EditWordPanel({ word, onClose }) {
    const { t } = useLocale();
    const words = useVocabularies();
    const lessons = useLessons();
    const { ensureVocabulariesByIds, toggleImportant, toggleMastered, editVocabulary } = useAppActions();
    const canMark = useIsSignedIn();
    const [resolving, setResolving] = useState(true);

    const [currentWordId, setCurrentWordId] = useState(word.id);
    useEffect(() => setCurrentWordId(word.id), [word.id]);

    const liveWord = useMemo(() => words.find((w) => w.id === currentWordId) ?? word, [words, currentWordId, word]);
    const relatedLessons = useMemo(
        () => lessons.filter((l) => l.vocabularyIds?.includes(currentWordId)),
        [lessons, currentWordId],
    );

    const handleNextRandom = useCallback(() => {
        const pool = words.filter((w) => w.id !== currentWordId);
        if (pool.length === 0) return;
        const next = pool[Math.floor(Math.random() * pool.length)];
        setCurrentWordId(next.id);
        ensureVocabulariesByIds([next.id]).catch(() => {});
    }, [words, currentWordId, ensureVocabulariesByIds]);

    const handleSave = useCallback(
        async (w, patch) => {
            await editVocabulary(w, patch);
            onClose();
        },
        [editVocabulary, onClose],
    );

    useEffect(() => {
        let cancelled = false;
        setResolving(true);
        log("Get word detail (popup)", currentWordId);
        ensureVocabulariesByIds([currentWordId])
            .catch((err) => logWarn("Get word detail failed", err instanceof Error ? err.message : err))
            .finally(() => {
                if (!cancelled) setResolving(false);
            });
        return () => {
            cancelled = true;
        };
    }, [currentWordId, ensureVocabulariesByIds]);

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
                aria-label={t.common.edit}
            >
                {/* Header: close button only */}
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

                {/* Body */}
                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
                    {resolving && !liveWord ? (
                        <div className="px-6 py-12">
                            <p className="text-text-muted text-sm text-center">{t.common.loading}</p>
                        </div>
                    ) : !liveWord ? (
                        <div className="text-center py-12 px-6 text-text-muted flex flex-col items-center gap-4">
                            <p>{t.wordDetail.notFound}</p>
                        </div>
                    ) : (
                        <section className="flex min-h-0 flex-col rounded-xl bg-surface px-5 py-7 sm:px-8 sm:py-8">
                            <WordDetailContent
                                key={liveWord.id}
                                word={words.find((w) => w.id === liveWord.id) ?? liveWord}
                                relatedLessons={relatedLessons}
                                canEdit
                                initialEditing
                                onSave={handleSave}
                                onNextRandom={words.length > 1 ? handleNextRandom : undefined}
                                {...(canMark && {
                                    onToggleImportant: toggleImportant,
                                    onToggleMastered: toggleMastered,
                                })}
                            />
                        </section>
                    )}
                </div>
            </div>
        </div>
    );
}
