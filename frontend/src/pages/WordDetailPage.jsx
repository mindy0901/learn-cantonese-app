import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { WordDetailContent } from "../components/WordDetailContent.jsx";
import { useAppActions, useVocabularies } from "../store/appStore.js";
import { useLocale } from "../store/localeStore.js";
import { useIsAdmin, useIsSignedIn } from "../store/authStore.js";
import { ButtonLink } from "../components/ui/Button.jsx";
import { vocabularyDetailPath } from "../lib/wordRoutes.js";
import { log, logWarn } from "../lib/actionLog.js";

export function WordDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const vocabularies = useVocabularies();
    const { ensureVocabulariesByIds, toggleImportant, toggleMastered, editVocabulary } = useAppActions();
    const { t } = useLocale();
    const isAdmin = useIsAdmin();
    const canMark = useIsSignedIn();
    const [resolving, setResolving] = useState(true);

    useEffect(() => {
        if (!id) {
            setResolving(false);
            return;
        }
        let cancelled = false;
        setResolving(true);
        log("Get vocabulary detail", id);
        ensureVocabulariesByIds([id])
            .catch((err) => {
                logWarn("Get vocabulary detail failed", err instanceof Error ? err.message : err);
            })
            .finally(() => {
                if (!cancelled) setResolving(false);
            });
        return () => {
            cancelled = true;
        };
    }, [id, ensureVocabulariesByIds]);

    const vocabulary = useMemo(() => vocabularies.find((v) => v.id === id), [vocabularies, id]);

    const handleNextRandom = useCallback(() => {
        const pool = vocabularies.filter((v) => v.id !== id);
        if (pool.length === 0) return;
        const next = pool[Math.floor(Math.random() * pool.length)];
        navigate(vocabularyDetailPath(next.id));
    }, [vocabularies, id, navigate]);

    if (resolving && !vocabulary) {
        return (
            <main className="flex-1 w-full px-4 py-8 pb-12">
                <p className="text-text-muted text-sm">{t.common.loading}</p>
            </main>
        );
    }

    if (!vocabulary) {
        return (
            <main className="flex-1 w-full px-4 py-8 pb-12">
                <div className="text-center py-12 px-6 text-text-muted flex flex-col items-center gap-4">
                    <p>{t.wordDetail.notFound}</p>
                    <ButtonLink to="/vocabulary" variant="primary" preventScrollReset>
                        {t.wordDetail.backToWordBank}
                    </ButtonLink>
                </div>
            </main>
        );
    }

    return (
        <main className="flex-1 w-full px-4 py-8 pb-12">
            <div className="mb-8">
                <ButtonLink to="/vocabulary" variant="ghost" preventScrollReset>
                    ← {t.wordDetail.backToWordBank}
                </ButtonLink>
            </div>

            <section className="flex min-h-[var(--word-detail-card-min-height)] flex-col rounded-xl border border-border bg-surface px-4 py-6 shadow-theme-sm sm:px-8 sm:py-8">
                <WordDetailContent
                    vocabulary={vocabularies.find((v) => v.id === vocabulary.id) ?? vocabulary}
                    canEdit={isAdmin}
                    onSave={isAdmin ? editVocabulary : undefined}
                    onNextRandom={vocabularies.length > 1 ? handleNextRandom : undefined}
                    {...(canMark && {
                        onToggleImportant: toggleImportant,
                        onToggleMastered: toggleMastered,
                    })}
                />
            </section>

            {/* Other pronunciation variants of the same character */}
            {(() => {
                const han = (vocabulary.hanTraditional || "").trim();
                if (!han) return null;
                const variants = vocabularies.filter(
                    (v) => (v.hanTraditional || "").trim() === han && v.id !== vocabulary.id,
                );
                if (variants.length === 0) return null;
                return (
                    <section className="mt-4 rounded-xl border border-border bg-surface px-4 py-4 shadow-theme-sm sm:px-8">
                        <h3 className="text-sm font-semibold text-text-h mb-4">
                            Other pronunciations ({variants.length})
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {variants.map((v) => (
                                <button
                                    key={v.id}
                                    type="button"
                                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-bg/50 px-4 py-2 text-sm transition-colors hover:border-accent-border hover:bg-accent-bg cursor-pointer"
                                    onClick={() => navigate(vocabularyDetailPath(v.id))}
                                >
                                    <span className="font-semibold text-pinyin">{v.pinyin || "—"}</span>
                                    {v.jyutping && <span className="text-jyutping text-xs">· {v.jyutping}</span>}
                                    {v.hskLevel && (
                                        <span className="text-xs text-text-muted border border-border rounded-full px-2 py-1">
                                            {v.hskLevel}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </section>
                );
            })()}
        </main>
    );
}
