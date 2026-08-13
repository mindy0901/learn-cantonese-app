import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { FlashcardDeck } from "../components/FlashcardDeck.jsx";
import { FlashcardStatsPanel } from "../components/FlashcardStatsPanel.jsx";
import { FlashcardSessionSetup } from "../components/FlashcardSessionSetup.jsx";
import { FlashcardDeckManager } from "../components/FlashcardDeckManager.jsx";
import { useVocabularyCount, useVocabulariesRevision, useAppActions } from "../store/appStore.js";
import { useIsAdmin, useIsSignedIn } from "../store/authStore.js";
import { useLocale } from "../store/localeStore.js";
import { fetchFlashcardVocabularies } from "../lib/flashcardWords.js";
import { Button } from "../components/shadcn/button.jsx";
import { SkeletonStats, SkeletonBlock } from "../components/ui/Skeleton.jsx";
import { EmptyState } from "../components/ui/EmptyState.jsx";
import { IconFlashcard } from "../components/NavIcons.jsx";

export function FlashcardPage() {
    const wordCount = useVocabularyCount();
    const wordsRevision = useVocabulariesRevision();
    const { mergeVocabularies } = useAppActions();
    const { t, fmt } = useLocale();
    const isAdmin = useIsAdmin();
    const isSignedIn = useIsSignedIn();
    const [sessionConfig, setSessionConfig] = useState(null);
    const [sessionWords, setSessionWords] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState(null);
    const [showDeckManager, setShowDeckManager] = useState(false);

    const startSession = useCallback(
        async (config) => {
            setLoading(true);
            setLoadError(null);
            try {
                const words = await fetchFlashcardVocabularies(config.sessionSize, {
                    source: config.source,
                    scope: config.scope,
                    deckId: config.deckId,
                    mergeVocabularies,
                    revision: wordsRevision,
                    vocabularyTotal: wordCount,
                });
                if (words.length === 0) {
                    if (config.source === "deck") {
                        setLoadError(t.flashcard.noDeckCards);
                    } else if (config.source === "due") {
                        setLoadError(t.flashcard.noDueCards);
                    } else {
                        setLoadError(t.flashcard.noCardsLeft);
                    }
                    return;
                }
                setSessionConfig(config);
                setSessionWords(words);
            } catch (err) {
                setLoadError(err instanceof Error ? err.message : String(err));
            } finally {
                setLoading(false);
            }
        },
        [
            mergeVocabularies,
            wordsRevision,
            wordCount,
            t.flashcard.noDueCards,
            t.flashcard.noCardsLeft,
            t.flashcard.noDeckCards,
        ],
    );

    const resetSession = useCallback(() => {
        setSessionConfig(null);
        setSessionWords([]);
        setLoadError(null);
    }, []);

    const playAgain = useCallback(() => {
        if (!sessionConfig) return Promise.resolve();
        return startSession(sessionConfig);
    }, [sessionConfig, startSession]);

    if (!isSignedIn) {
        return (
            <main className="flex-1 w-full px-5 py-8 pb-12">
                <EmptyState
                    icon={<IconFlashcard size={28} />}
                    title={t.data.signInTitle}
                    description={t.data.signInBody}
                />
            </main>
        );
    }

    if (wordCount === 0) {
        return (
            <main className="flex-1 w-full px-5 py-8 pb-12">
                <EmptyState
                    icon={<IconFlashcard size={28} />}
                    title={t.flashcard.empty}
                    description={isAdmin ? t.flashcard.emptyAdminHint : undefined}
                    action={
                        <Button nativeButton={false} render={<Link to="/" />}>
                            {t.flashcard.goHome}
                        </Button>
                    }
                />
            </main>
        );
    }

    return (
        <main className="flex-1 w-full px-5 py-8 pb-12">
            <div className="flex items-start justify-between gap-4 mb-6 max-sm:flex-col">
                <div>
                    <h1>{t.flashcard.title}</h1>
                    <p className="mt-1 text-muted-foreground text-sm">
                        {sessionConfig
                            ? fmt(t.flashcard.sessionSubtitle, { count: sessionWords.length })
                            : t.flashcard.chooseSize}
                    </p>
                </div>
                {sessionConfig && (
                    <Button type="button" variant="ghost" size="sm" onClick={resetSession}>
                        {t.flashcard.newSession}
                    </Button>
                )}
                {!sessionConfig && !showDeckManager && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setShowDeckManager(true)}>
                        {t.flashcard.manageDecks}
                    </Button>
                )}
                {showDeckManager && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setShowDeckManager(false)}>
                        {t.common.close}
                    </Button>
                )}
            </div>

            {loadError && (
                <p
                    className="px-4 py-3 rounded-lg text-sm bg-destructive/10 text-destructive border border-destructive/30 mb-4"
                    role="alert"
                >
                    {loadError}
                </p>
            )}

            {showDeckManager ? (
                <FlashcardDeckManager onClose={() => setShowDeckManager(false)} />
            ) : !sessionConfig ? (
                loading ? (
                    <div className="flex flex-col gap-5">
                        <SkeletonStats stats={6} />
                        <SkeletonBlock height="12rem" className="rounded-xl" />
                    </div>
                ) : (
                    <div className="flex flex-col gap-5">
                        <FlashcardStatsPanel />
                        <FlashcardSessionSetup onStart={startSession} loading={loading} disabled={false} />
                    </div>
                )
            ) : (
                <FlashcardDeck
                    words={sessionWords}
                    cardMode={sessionConfig.cardMode}
                    hideJyutping={sessionConfig.hideJyutping}
                    loading={loading}
                    onNewSession={resetSession}
                    onPlayAgain={playAgain}
                />
            )}
        </main>
    );
}
