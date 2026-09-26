import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { FlashcardDeck } from "../components/FlashcardDeck.jsx";
import { FlashcardSessionSetup } from "../components/FlashcardSessionSetup.jsx";
import { FlashcardDeckManager } from "../components/FlashcardDeckManager.jsx";
import { useVocabularyCount, useVocabulariesRevision } from "../store/appStore.js";
import { useIsAdmin, useIsSignedIn } from "../store/authStore.js";
import { useLocale } from "../store/localeStore.js";
import { fetchFlashcardVocabularies } from "../lib/flashcardWords.js";
import { Button } from "../components/shadcn/button.jsx";
import { toast } from "../components/shadcn/toast.jsx";
import { SkeletonStats, SkeletonBlock } from "../components/ui/Skeleton.jsx";
import { EmptyState } from "../components/ui/EmptyState.jsx";
import { IconFlashcard } from "../components/NavIcons.jsx";
import { cn } from "../lib/cn.js";

export function FlashcardPage() {
    const wordCount = useVocabularyCount();
    const wordsRevision = useVocabulariesRevision();
    const { t } = useLocale();
    const isAdmin = useIsAdmin();
    const isSignedIn = useIsSignedIn();
    const [sessionConfig, setSessionConfig] = useState(null);
    const [sessionWords, setSessionWords] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showDeckManager, setShowDeckManager] = useState(false);

    const startSession = useCallback(
        async (config) => {
            setLoading(true);
            try {
                const words = await fetchFlashcardVocabularies(config.sessionSize, {
                    source: config.source,
                    deckIds: config.deckIds,
                    lang: config.lang,
                    revision: wordsRevision,
                    vocabularyTotal: wordCount,
                });
                if (words.length === 0) {
                    // ⚠️ 2026-09-01: lỗi báo bằng TOAST (không dùng inline alert)
                    toast.add({
                        type: "error",
                        title: config.source === "deck" ? t.flashcard.noDeckCards : t.flashcard.noCardsLeft,
                    });
                    return;
                }
                setSessionConfig(config);
                setSessionWords(words);
            } catch (err) {
                toast.add({
                    type: "error",
                    title: t.common?.error ?? "Lỗi",
                    description: err instanceof Error ? err.message : String(err),
                });
            } finally {
                setLoading(false);
            }
        },
        [wordsRevision, wordCount, t.flashcard.noDeckCards, t.flashcard.noCardsLeft, t.common?.error],
    );

    const resetSession = useCallback(() => {
        setSessionConfig(null);
        setSessionWords([]);
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
        // ⚠️ 2026-09-19: đang trong PHIÊN → main cao ĐÚNG 100svh - navbar (62px) + `overflow-hidden`
        // ⇒ KHÔNG cuộn được TRANG (trước đây cuộn trang làm thẻ trôi khỏi view); chỉ vùng nội dung
        // trong thẻ cuộn. Setup/quản lý bộ thẻ vẫn giữ `flex-1` (nội dung dài thì cuộn trang bình thường).
        <main
            className={cn(
                "flex w-full flex-col px-5 py-8 pb-12",
                sessionConfig && !showDeckManager ? "h-[calc(100svh-62px)] min-h-0 overflow-y-auto" : "min-h-0 flex-1",
            )}
        >
            {/* ⚠️ 2026-09-02: header trang chỉ hiển thị ở màn SETUP (h1 + "Quản lý bộ thẻ").
                Khi đang trong phiên (sessionConfig) → BỎ header hoàn toàn; nút "Phiên mới" đã
                chuyển xuống cạnh nút "Chi tiết" trong FlashcardDeck. */}
            {!showDeckManager && !sessionConfig && (
                <div className="flex items-center justify-between gap-4 mb-6 max-sm:flex-col">
                    <div>
                        <h1>{t.flashcard.title}</h1>
                    </div>
                    <Button type="button" variant="default" onClick={() => setShowDeckManager(true)}>
                        {t.flashcard.manageDecks}
                    </Button>
                </div>
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
                        <FlashcardSessionSetup onStart={startSession} loading={loading} disabled={false} />
                    </div>
                )
            ) : (
                <FlashcardDeck
                    vocabularies={sessionWords}
                    loading={loading}
                    onNewSession={resetSession}
                    onPlayAgain={playAgain}
                />
            )}
        </main>
    );
}
