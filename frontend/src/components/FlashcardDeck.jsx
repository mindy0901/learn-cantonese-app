import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FlashcardSessionSummary } from "./FlashcardSessionSummary.jsx";
import { useAppActions } from "../store/appStore.js";
import { useIsSignedIn } from "../store/authStore.js";
import { useLocale } from "../store/localeStore.js";
import { log } from "../lib/actionLog.js";
import { recordFlashcardSession } from "../lib/flashcardStats.js";
import { clampStudyProgress, nextStudyProgress } from "../lib/flashcardProgress.js";
import { vocabularyFieldDisplayText, isVocabularyFieldPending } from "../lib/wordDisplay.js";
import { wordFieldPendingClass } from "./WordFieldText.jsx";
import { hanPopularityClass } from "../lib/wordPopularity.js";
import { vocabularyDetailPath } from "../lib/wordRoutes.js";
import { cn } from "../lib/cn.js";
import { btnClass } from "./ui/buttonStyles.js";

import { controlButtonClass } from "./ui/controlStyles.js";

const rateBase = cn(
    controlButtonClass,
    "px-1.5 rounded-xl text-sm font-semibold leading-normal cursor-pointer shadow-sm",
    "transition-[background,border-color,color,box-shadow,transform] duration-150 active:scale-[0.98] disabled:cursor-not-allowed",
);

const SLIDE_OUT_MS = 260;
const SLIDE_IN_MS = 320;

function flashcardField(vocab, field, updatingLabel) {
    return {
        text: vocabularyFieldDisplayText(vocab, field, updatingLabel),
        pending: isVocabularyFieldPending(vocab, field),
    };
}

function FlashcardCardFaces({ vocab, cardMode, hideJyutping, updatingLabel }) {
    const pendingClass = wordFieldPendingClass;
    const sinoVietnamese = flashcardField(vocab, "sinoVietnamese", updatingLabel);
    const vietMeanings = flashcardField(vocab, "vietMeanings", updatingLabel);
    const engMeanings = flashcardField(vocab, "engMeanings", updatingLabel);
    const han = vocab.hanTraditional || "—";
    const jyutping = vocab.jyutping || "—";
    const hanClass = cn("flashcard-han");

    if (cardMode === "meaningToHan") {
        return {
            front: (
                <div className="flex flex-col items-center justify-center gap-3 w-full flex-1">
                    <p className={cn("flashcard-viet", vietnamese.pending && pendingClass)}>{vietnamese.text}</p>
                    {!english.pending && <p className="flashcard-english">{english.text}</p>}
                    {english.pending && <p className={cn("flashcard-english", pendingClass)}>{english.text}</p>}
                </div>
            ),
            back: (
                <div className="flex flex-col items-center justify-center gap-3 w-full flex-1">
                    {sinoVietnamese.pending ? (
                        <p className={cn("flashcard-sino-vietnamese", pendingClass)}>{sinoVietnamese.text}</p>
                    ) : (
                        sinoVietnamese.text && <p className="flashcard-sino-vietnamese">{sinoVietnamese.text}</p>
                    )}
                    <p className={hanClass}>{han}</p>
                    <p className="flashcard-jyutping">{jyutping}</p>
                </div>
            ),
        };
    }

    if (cardMode === "jyutpingToHan") {
        return {
            front: (
                <div className="flex flex-col items-center justify-center gap-3 w-full flex-1">
                    <p className="flashcard-jyutping text-[clamp(1.5rem,4vw,2rem)]">{jyutping}</p>
                </div>
            ),
            back: (
                <div className="flex flex-col items-center justify-center gap-3 w-full flex-1">
                    {sinoVietnamese.pending ? (
                        <p className={cn("flashcard-sino-vietnamese", pendingClass)}>{sinoVietnamese.text}</p>
                    ) : (
                        sinoVietnamese.text && <p className="flashcard-sino-vietnamese">{sinoVietnamese.text}</p>
                    )}
                    <p className={hanClass}>{han}</p>
                    <p className={cn("flashcard-viet", vietnamese.pending && pendingClass)}>{vietnamese.text}</p>
                    {!english.pending && <p className="flashcard-english">{english.text}</p>}
                    {english.pending && <p className={cn("flashcard-english", pendingClass)}>{english.text}</p>}
                </div>
            ),
        };
    }

    const showJyutpingOnFront = !hideJyutping;
    return {
        front: (
            <div className="flex flex-col items-center justify-center gap-3 w-full flex-1">
                {sinoVietnamese.pending ? (
                    <p className={cn("flashcard-sino-vietnamese", pendingClass)}>{sinoVietnamese.text}</p>
                ) : (
                    sinoVietnamese.text && <p className="flashcard-sino-vietnamese">{sinoVietnamese.text}</p>
                )}
                <p className={hanClass}>{han}</p>
                {showJyutpingOnFront && <p className="flashcard-jyutping">{jyutping}</p>}
            </div>
        ),
        back: (
            <div className="flex flex-col items-center justify-center gap-4 w-full flex-1">
                {!showJyutpingOnFront && <p className="flashcard-jyutping">{jyutping}</p>}
                <p className={cn("flashcard-viet", vietnamese.pending && pendingClass)}>{vietnamese.text}</p>
                <p className={cn("flashcard-english", english.pending && pendingClass)}>{english.text}</p>
            </div>
        ),
    };
}

function vocabSnapshot(vocab) {
    return {
        id: vocab.id,
        hanTraditional: vocab.hanTraditional ?? "",
        sinoVietnamese: vocab.sinoVietnamese,
        jyutping: vocab.jyutping ?? "",
        vietnamese: vocab.vietnamese ?? "",
        english: vocab.english ?? "",
        popularity: vocab.popularity,
    };
}

function upsertSessionEntry(log, vocab, outcome) {
    const snap = vocabSnapshot(vocab);
    const idx = log.findIndex((e) => e.id === snap.id);
    if (outcome === "again") {
        if (idx >= 0) {
            return log.map((e, i) => (i === idx ? { ...e, outcome: "again", againTimes: (e.againTimes ?? 0) + 1 } : e));
        }
        return [...log, { ...snap, outcome: "again", againTimes: 1 }];
    }
    if (outcome === "passed") {
        if (idx >= 0) {
            if (log[idx].outcome === "again" || log[idx].outcome === "mastered") return log;
            return log.map((e, i) => (i === idx ? { ...e, outcome: "passed" } : e));
        }
        return [...log, { ...snap, outcome: "passed", againTimes: 0 }];
    }
    if (idx >= 0) {
        if (log[idx].outcome === "mastered") return log;
        return log.map((e, i) => (i === idx ? { ...e, outcome } : e));
    }
    return [...log, { ...snap, outcome, againTimes: 0 }];
}

function buildSessionSummary(initialVocabularies, sessionLog) {
    const logById = new Map(sessionLog.map((e) => [e.id, e]));
    return initialVocabularies.map((vocab) => {
        const logged = logById.get(vocab.id);
        if (logged) return logged;
        return { ...vocabSnapshot(vocab), outcome: "passed", againTimes: 0 };
    });
}

export function FlashcardDeck({
    vocabularies,
    cardMode = "hanToMeaning",
    hideJyutping = false,
    onNewSession,
    onPlayAgain,
    loading = false,
}) {
    const { t, fmt } = useLocale();
    const navigate = useNavigate();
    const { setVocabularyStudyProgress } = useAppActions();
    const canMark = useIsSignedIn();

    const [deck, setDeck] = useState([]);
    const [index, setIndex] = useState(0);
    const [flipped, setFlipped] = useState(false);
    const [slidePhase, setSlidePhase] = useState(null);
    const [sessionComplete, setSessionComplete] = useState(false);
    const [sessionLog, setSessionLog] = useState([]);
    const [initialVocabularies, setInitialVocabularies] = useState([]);
    const [stats, setStats] = useState({ again: 0, mastered: 0 });
    const slideTimers = useRef([]);

    const clearSlideTimers = useCallback(() => {
        slideTimers.current.forEach(clearTimeout);
        slideTimers.current = [];
    }, []);

    const queueSlideTimer = useCallback((fn, ms) => {
        const id = window.setTimeout(fn, ms);
        slideTimers.current.push(id);
        return id;
    }, []);

    useEffect(() => () => clearSlideTimers(), [clearSlideTimers]);

    const runCardTransition = useCallback(
        (direction, onSwap) => {
            if (slidePhase) return false;
            setSlidePhase(`out-${direction}`);
            queueSlideTimer(() => {
                onSwap();
                setSlidePhase(`in-${direction}`);
                queueSlideTimer(() => setSlidePhase(null), SLIDE_IN_MS);
            }, SLIDE_OUT_MS);
            return true;
        },
        [queueSlideTimer, slidePhase],
    );

    useEffect(() => {
        clearSlideTimers();
        setSlidePhase(null);
        const initial = vocabularies.filter((w) => !w.mastered);
        setInitialVocabularies(initial);
        setSessionLog([]);
        setSessionComplete(false);
        setDeck(initial);
        setIndex(0);
        setFlipped(false);
        setStats({ again: 0, mastered: 0 });
    }, [vocabularies, clearSlideTimers]);

    const recordOutcome = useCallback((vocab, outcome) => {
        if (!vocab) return;
        setSessionLog((log) => upsertSessionEntry(log, vocab, outcome));
    }, []);

    const finishSession = useCallback(
        (vocab) => {
            const log = vocab ? upsertSessionEntry(sessionLog, vocab, "passed") : sessionLog;
            if (vocab) setSessionLog(log);
            const entries = buildSessionSummary(initialVocabularies, log);
            recordFlashcardSession(entries);
            log("Flashcard session done", initialVocabularies.length);
            setSessionComplete(true);
        },
        [initialVocabularies, sessionLog],
    );

    const deckCard = deck[index];
    const current = deckCard;
    const total = deck.length;
    const isAnimating = Boolean(slidePhase);
    const sessionProgressPct = total > 0 ? Math.round(((index + (flipped ? 0.5 : 0)) / total) * 100) : 100;
    const vocabProgress = clampStudyProgress(current?.studyProgress ?? 0);
    const cardFaces = current
        ? FlashcardCardFaces({
              vocab: current,
              cardMode,
              hideJyutping: cardMode === "jyutpingToHan" ? false : hideJyutping,
              updatingLabel: t.wordBank.fieldUpdating,
          })
        : null;

    const patchDeckVocab = useCallback((vocabId, patch) => {
        setDeck((d) => d.map((w) => (w.id === vocabId ? { ...w, ...patch } : w)));
    }, []);

    const persistVocabularyProgress = useCallback(
        (vocab, progress, { mastered } = {}) => {
            const clamped = clampStudyProgress(progress);
            const nextMastered = mastered ?? clamped >= 100;
            const studiedAt = new Date().toISOString();
            patchDeckVocab(vocab.id, {
                studyProgress: clamped,
                mastered: nextMastered,
                studyProgressAt: studiedAt,
            });
            if (canMark) {
                setVocabularyStudyProgress(vocab.id, clamped, { mastered: nextMastered });
            }
            return { studyProgress: clamped, mastered: nextMastered, studyProgressAt: studiedAt };
        },
        [canMark, patchDeckVocab, setVocabularyStudyProgress],
    );

    const canGoPrev = index > 0;
    const canGoNext = index < deck.length - 1;

    const isLastCard = index >= deck.length - 1;

    const goNext = useCallback(() => {
        if (isAnimating) return;
        if (!flipped) {
            log("Flashcard flip", current);
            setFlipped(true);
            return;
        }
        if (isLastCard) {
            log("Flashcard finish", current);
            const complete = () => finishSession(current);
            if (!runCardTransition("next", complete)) complete();
            return;
        }
        log("Flashcard next", current);
        runCardTransition("next", () => {
            recordOutcome(current, "passed");
            setFlipped(false);
            setIndex((i) => Math.min(i + 1, deck.length - 1));
        });
    }, [
        current,
        deck.length,
        finishSession,
        flipped,
        index,
        isAnimating,
        isLastCard,
        recordOutcome,
        runCardTransition,
    ]);

    const goPrev = useCallback(() => {
        if (isAnimating || index <= 0) return;
        log("Flashcard prev", current);
        runCardTransition("prev", () => {
            setFlipped(false);
            setIndex((i) => Math.max(i - 1, 0));
        });
    }, [current, index, isAnimating, runCardTransition]);

    const openDetail = useCallback(() => {
        if (!current) return;
        log("Open vocabulary detail", current);
        navigate(vocabularyDetailPath(current.id));
    }, [current, navigate]);

    const removeMasteredCard = useCallback(
        (vocab) => {
            const removeCurrent = () => {
                setDeck((d) => {
                    const next = d.filter((w) => w.id !== vocab.id);
                    if (index >= next.length) setIndex(Math.max(0, next.length - 1));
                    return next;
                });
                setFlipped(false);
                if (deck.length <= 1) finishSession();
            };
            if (!runCardTransition("next", removeCurrent)) removeCurrent();
        },
        [deck.length, finishSession, index, runCardTransition],
    );

    const advanceAfterRating = useCallback(() => {
        if (isLastCard) {
            const complete = () => finishSession(current);
            if (!runCardTransition("next", complete)) complete();
            return;
        }
        runCardTransition("next", () => {
            recordOutcome(current, "passed");
            setFlipped(false);
            setIndex((i) => Math.min(i + 1, deck.length - 1));
        });
    }, [current, deck.length, finishSession, isLastCard, recordOutcome, runCardTransition]);

    const handleRate = useCallback(
        (rating) => {
            if (!current) return;
            log(`Flashcard rate ${rating}`, current);
            setStats((s) => ({ ...s, [rating]: (s[rating] ?? 0) + 1 }));

            if (rating === "mastered") {
                persistVocabularyProgress(current, 100, { mastered: true });
                recordOutcome(current, "mastered");
                removeMasteredCard(current);
                return;
            }

            if (rating === "again") {
                persistVocabularyProgress(current, 0, { mastered: false });
                recordOutcome(current, "again");
                setFlipped(false);
                setDeck((d) => {
                    if (d.length <= 1) return d;
                    const copy = [...d];
                    const [card] = copy.splice(index, 1);
                    copy.push(card);
                    return copy;
                });
                return;
            }

            const nextProgress = nextStudyProgress(current.studyProgress ?? 0, rating, {
                lastStudiedAt: current.studyProgressAt,
            });
            const reachedMastered = nextProgress >= 100;
            persistVocabularyProgress(current, nextProgress, { mastered: reachedMastered });
            recordOutcome(current, reachedMastered ? "mastered" : rating);

            if (reachedMastered) {
                removeMasteredCard(current);
                return;
            }

            advanceAfterRating();
        },
        [advanceAfterRating, current, index, persistVocabularyProgress, recordOutcome, removeMasteredCard],
    );

    useEffect(() => {
        const onKey = (e) => {
            if (isAnimating || e.target.closest("input, textarea, select")) return;
            if (e.key === "ArrowLeft" && index > 0) goPrev();
            else if (e.key === "ArrowRight") goNext();
            else if (flipped) {
                if (e.key === "1") handleRate("again");
                else if (e.key === "2") handleRate("hard");
                else if (e.key === "3") handleRate("medium");
                else if (e.key === "4") handleRate("easy");
                else if (e.key === "5") handleRate("mastered");
                else if (e.key === "d" || e.key === "D") openDetail();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [flipped, goNext, goPrev, handleRate, openDetail, index, isAnimating]);

    if (words.length === 0) return null;

    if (sessionComplete) {
        const entries = buildSessionSummary(initialWords, sessionLog);
        return (
            <FlashcardSessionSummary
                entries={entries}
                loading={loading}
                onPlayAgain={() => onPlayAgain?.()}
                onNewSession={() => onNewSession?.()}
            />
        );
    }

    if (!current) {
        return (
            <div className="text-center py-12 px-6 bg-surface border border-border rounded-2xl shadow-theme">
                <h2>{t.flashcard.sessionComplete}</h2>
                <p className="mt-2">{fmt(t.flashcard.cardsStudied, { count: stats.again + stats.mastered })}</p>
                <div className="flex flex-wrap justify-center gap-4 my-4 text-sm text-text-muted">
                    <span>
                        {t.flashcard.again}: {stats.again}
                    </span>
                    <span>
                        {t.flashcard.master}: {stats.mastered}
                    </span>
                </div>
                <button type="button" className={btnClass("primary")} onClick={() => onNewSession?.()}>
                    {t.flashcard.newSession}
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="h-1.5 bg-border rounded-full overflow-hidden">
                <div
                    className="h-full bg-accent rounded-full transition-[width] duration-250 ease-out"
                    style={{ width: `${sessionProgressPct}%` }}
                />
            </div>
            <p className="text-sm text-text-muted text-center">
                {fmt(t.flashcard.progress, { current: index + 1, total })}
            </p>

            <div className="flex items-center gap-3">
                <span className="shrink-0 text-xs font-semibold tabular-nums text-text-muted">
                    {fmt(t.flashcard.wordProgress, { percent: wordProgress })}
                </span>
                <div
                    className="h-2 flex-1 overflow-hidden rounded-full bg-border"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={wordProgress}
                    aria-label={t.flashcard.wordProgressLabel}
                >
                    <div
                        className="h-full rounded-full bg-gradient-to-r from-accent to-indigo-400 transition-[width] duration-300 ease-out"
                        style={{ width: `${wordProgress}%` }}
                    />
                </div>
            </div>

            <div className="flashcard-nav-row">
                <button
                    type="button"
                    className={cn(
                        rateBase,
                        "flashcard-nav-btn",
                        "border-border bg-bg text-text-muted hover:border-text-muted hover:bg-surface hover:text-text-h hover:shadow-theme-sm disabled:opacity-40 disabled:bg-bg",
                    )}
                    onClick={goPrev}
                    disabled={!canGoPrev || isAnimating}
                >
                    {t.flashcard.previous}
                </button>

                <div className="flashcard-stage flex-1 min-w-0">
                    <div
                        className={cn(
                            "flashcard-3d",
                            flipped && "flashcard-3d--flipped",
                            slidePhase === "out-next" && "flashcard-3d--slide-out-next",
                            slidePhase === "in-next" && "flashcard-3d--slide-in-next",
                            slidePhase === "out-prev" && "flashcard-3d--slide-out-prev",
                            slidePhase === "in-prev" && "flashcard-3d--slide-in-prev",
                            isAnimating && "flashcard-3d--no-flip",
                        )}
                        onClick={() => {
                            if (isAnimating) return;
                            log("Flashcard flip", current);
                            setFlipped((f) => !f);
                        }}
                        role="button"
                        tabIndex={0}
                        aria-label={flipped ? t.flashcard.backLabel : t.flashcard.frontLabel}
                        aria-busy={isAnimating}
                    >
                        <div className="flashcard-3d__inner">
                            <div className="flashcard-face flashcard-face--front">{cardFaces?.front}</div>

                            <div className="flashcard-face flashcard-face--back">{cardFaces?.back}</div>
                        </div>
                    </div>
                </div>

                <button
                    type="button"
                    className={cn(
                        rateBase,
                        "flashcard-nav-btn",
                        "border-border bg-bg text-text-muted hover:border-text-muted hover:bg-surface hover:text-text-h hover:shadow-theme-sm disabled:opacity-40 disabled:bg-bg",
                    )}
                    onClick={goNext}
                    disabled={isAnimating || (!isLastCard && !canGoNext && flipped)}
                >
                    {isLastCard && flipped ? t.flashcard.finish : t.flashcard.next}
                </button>
            </div>

            <div className="flex flex-col gap-2.5 p-3.5 border border-border rounded-[0.875rem] bg-surface shadow-theme-sm">
                <div className="grid grid-cols-5 gap-1.5 max-sm:grid-cols-2">
                    <button
                        type="button"
                        className={cn(
                            rateBase,
                            "border-error-border bg-gradient-to-b from-error-bg to-red-100/65 text-error-text hover:border-red-400 hover:bg-rose-100 hover:shadow-[0_2px_8px_rgba(244,63,94,0.12)] dark:from-red-950/55 dark:to-red-950/85 dark:hover:border-rose-400 dark:hover:bg-red-950/75 dark:hover:shadow-[0_2px_10px_rgba(251,113,133,0.15)]",
                        )}
                        onClick={() => handleRate("again")}
                        disabled={isAnimating}
                    >
                        {t.flashcard.again}
                    </button>
                    <button
                        type="button"
                        className={cn(
                            rateBase,
                            "border-amber-400/45 bg-gradient-to-b from-amber-50 to-amber-100 text-amber-800 hover:border-amber-400 hover:bg-amber-200 hover:shadow-[0_2px_8px_rgba(245,158,11,0.15)] dark:from-amber-950/55 dark:to-amber-900/35 dark:text-amber-300 dark:hover:border-amber-300 dark:hover:bg-amber-900/45",
                        )}
                        onClick={() => handleRate("hard")}
                        disabled={isAnimating}
                    >
                        {t.flashcard.hard}
                    </button>
                    <button
                        type="button"
                        className={cn(
                            rateBase,
                            "border-sky-400/45 bg-gradient-to-b from-sky-50 to-sky-100 text-sky-800 hover:border-sky-400 hover:bg-sky-200 hover:shadow-[0_2px_8px_rgba(14,165,233,0.15)] dark:from-sky-950/55 dark:to-sky-900/35 dark:text-sky-300 dark:hover:border-sky-300 dark:hover:bg-sky-900/45",
                        )}
                        onClick={() => handleRate("medium")}
                        disabled={isAnimating}
                    >
                        {t.flashcard.medium}
                    </button>
                    <button
                        type="button"
                        className={cn(
                            rateBase,
                            "border-emerald-400/45 bg-gradient-to-b from-emerald-50 to-emerald-100 text-emerald-800 hover:border-emerald-400 hover:bg-emerald-200 hover:shadow-[0_2px_8px_rgba(16,185,129,0.15)] dark:from-emerald-950/55 dark:to-emerald-900/35 dark:text-emerald-300 dark:hover:border-emerald-300 dark:hover:bg-emerald-900/45",
                        )}
                        onClick={() => handleRate("easy")}
                        disabled={isAnimating}
                    >
                        {t.flashcard.easy}
                    </button>
                    <button
                        type="button"
                        className={cn(
                            rateBase,
                            "border-success-border bg-gradient-to-b from-success-bg to-emerald-200/45 text-success-text hover:border-accent-border hover:bg-accent-bg hover:text-accent hover:shadow-[0_2px_8px_rgba(15,118,110,0.15)] dark:from-emerald-950/75 dark:to-emerald-900/35 dark:hover:border-accent-border dark:hover:bg-accent-bg dark:hover:text-accent dark:hover:shadow-[0_2px_10px_rgba(45,212,191,0.18)]",
                        )}
                        onClick={() => handleRate("mastered")}
                        disabled={isAnimating}
                    >
                        {t.flashcard.master}
                    </button>
                </div>
                <div className="flex justify-center">
                    <button
                        type="button"
                        className={cn(
                            rateBase,
                            "min-w-[7rem] border-blue-400/45 bg-gradient-to-b from-blue-50 to-blue-100 text-blue-700 hover:border-blue-400 hover:bg-blue-200 hover:text-blue-900 hover:shadow-[0_2px_8px_rgba(59,130,246,0.15)] dark:border-blue-400/45 dark:from-blue-950/55 dark:to-blue-900/35 dark:text-blue-300 dark:hover:border-blue-300 dark:hover:bg-blue-900/45 dark:hover:text-blue-100",
                        )}
                        onClick={openDetail}
                        disabled={isAnimating}
                    >
                        {t.flashcard.viewDetail}
                    </button>
                </div>
            </div>
        </div>
    );
}
