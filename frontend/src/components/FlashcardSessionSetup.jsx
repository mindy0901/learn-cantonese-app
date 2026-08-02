import { useCallback, useEffect, useState } from "react";
import { useLocale } from "../store/localeStore.js";
import { useVocabulariesRevision } from "../store/appStore.js";
import {
    FLASHCARD_CARD_MODES,
    FLASHCARD_SCOPES,
    FLASHCARD_SESSION_SIZES,
    FLASHCARD_SOURCES,
    loadFlashcardPrefs,
    saveFlashcardPrefs,
} from "../lib/flashcardPrefs.js";
import { countDueFlashcardVocabularies } from "../lib/flashcardWords.js";
import { api } from "../lib/api.js";
import { cn } from "../lib/cn.js";
import { btnClass } from "./ui/buttonStyles.js";

const fieldClass =
    "w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-h focus:outline-none focus:ring-2 focus:ring-accent/35 focus:border-accent-border";

const labelClass = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted";

export function FlashcardSessionSetup({ onStart, loading, disabled, dueCount = null }) {
    const { t, fmt } = useLocale();
    const wordsRevision = useVocabulariesRevision();
    const [prefs, setPrefs] = useState(() => loadFlashcardPrefs());
    const [dueTotal, setDueTotal] = useState(dueCount);

    useEffect(() => {
        if (dueCount != null) {
            setDueTotal(dueCount);
            return;
        }
        let cancelled = false;
        countDueFlashcardVocabularies({ revision: wordsRevision })
            .then((total) => {
                if (!cancelled) setDueTotal(total);
            })
            .catch(() => {
                if (!cancelled) setDueTotal(0);
            });
        return () => {
            cancelled = true;
        };
    }, [dueCount, wordsRevision]);

    const updatePref = (patch) => {
        const next = saveFlashcardPrefs(patch);
        setPrefs(next);
    };

    const sourceLabels = {
        due: t.flashcard.sourceDue,
        random: t.flashcard.sourceRandom,
        deck: t.flashcard.sourceDeck,
    };

    const [decks, setDecks] = useState([]);
    const [decksLoading, setDecksLoading] = useState(false);

    // Load decks when source is 'deck'
    useEffect(() => {
        if (prefs.source !== "deck") return;
        let cancelled = false;
        setDecksLoading(true);
        api.fetchFlashcardDecks()
            .then((data) => {
                if (!cancelled) setDecks(data ?? []);
            })
            .catch(() => {
                if (!cancelled) setDecks([]);
            })
            .finally(() => {
                if (!cancelled) setDecksLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [prefs.source]);

    const scopeLabels = {
        all: t.flashcard.scopeAll,
        important: t.flashcard.scopeImportant,
        lowProgress: t.flashcard.scopeLowProgress,
    };

    const cardModeLabels = {
        hanToMeaning: t.flashcard.modeHanToMeaning,
        meaningToHan: t.flashcard.modeMeaningToHan,
        jyutpingToHan: t.flashcard.modeJyutpingToHan,
    };

    const handleStart = () => {
        onStart?.({
            ...prefs,
        });
    };

    return (
        <div className="flex flex-col gap-5">
            {dueTotal != null && dueTotal > 0 && (
                <div className="rounded-xl border border-accent-border bg-accent-bg/50 px-4 py-3 text-center">
                    <p className="m-0 text-sm text-text-muted">{t.flashcard.dueToday}</p>
                    <p className="m-0 mt-1 text-2xl font-bold tabular-nums text-accent">
                        {fmt(t.flashcard.dueCount, { count: dueTotal })}
                    </p>
                </div>
            )}

            <section className="rounded-xl border border-border bg-surface p-4 shadow-theme-sm">
                <h2 className="m-0 mb-4 text-sm font-semibold text-text-h">{t.flashcard.setupSource}</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                        <label className={labelClass} htmlFor="flashcard-source">
                            {t.flashcard.sourceLabel}
                        </label>
                        <select
                            id="flashcard-source"
                            className={fieldClass}
                            value={prefs.source}
                            onChange={(e) => updatePref({ source: e.target.value })}
                        >
                            {FLASHCARD_SOURCES.map((value) => (
                                <option key={value} value={value}>
                                    {sourceLabels[value]}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className={labelClass} htmlFor="flashcard-scope">
                            {t.flashcard.scopeLabel}
                        </label>
                        {prefs.source !== "deck" ? (
                            <select
                                id="flashcard-scope"
                                className={fieldClass}
                                value={prefs.scope}
                                onChange={(e) => updatePref({ scope: e.target.value })}
                            >
                                {FLASHCARD_SCOPES.map((value) => (
                                    <option key={value} value={value}>
                                        {scopeLabels[value]}
                                    </option>
                                ))}
                            </select>
                        ) : (
                            <>
                                <select
                                    id="flashcard-deck"
                                    className={fieldClass}
                                    value={prefs.deckId ?? ""}
                                    onChange={(e) => updatePref({ deckId: e.target.value || null })}
                                >
                                    <option value="">{t.flashcard.deckPlaceholder}</option>
                                    {decks.map((deck) => (
                                        <option key={deck.id} value={deck.id}>
                                            {deck.name} ({deck.vocabularyCount ?? 0})
                                        </option>
                                    ))}
                                </select>
                                {decksLoading && <p className="m-0 mt-1 text-xs text-text-muted">{t.common.loading}</p>}
                            </>
                        )}
                    </div>
                </div>
            </section>

            <section className="rounded-xl border border-border bg-surface p-4 shadow-theme-sm">
                <h2 className="m-0 mb-4 text-sm font-semibold text-text-h">{t.flashcard.setupMode}</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                        <label className={labelClass} htmlFor="flashcard-card-mode">
                            {t.flashcard.cardModeLabel}
                        </label>
                        <select
                            id="flashcard-card-mode"
                            className={fieldClass}
                            value={prefs.cardMode}
                            onChange={(e) => updatePref({ cardMode: e.target.value })}
                        >
                            {FLASHCARD_CARD_MODES.map((value) => (
                                <option key={value} value={value}>
                                    {cardModeLabels[value]}
                                </option>
                            ))}
                        </select>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-text-h sm:col-span-2">
                        <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-border accent-accent"
                            checked={prefs.hideJyutping}
                            onChange={(e) => updatePref({ hideJyutping: e.target.checked })}
                            disabled={prefs.cardMode === "jyutpingToHan"}
                        />
                        {t.flashcard.hideJyutping}
                    </label>
                </div>
            </section>

            <section className="rounded-xl border border-border bg-surface p-4 shadow-theme-sm">
                <h2 className="m-0 mb-4 text-sm font-semibold text-text-h">{t.flashcard.setupSize}</h2>
                <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-1">
                    {FLASHCARD_SESSION_SIZES.map((size) => (
                        <button
                            key={size}
                            type="button"
                            className={cn(
                                "flex flex-col items-center justify-center gap-1.5 min-h-[5.5rem] px-3 py-3 border rounded-xl cursor-pointer transition-[background,border-color,transform] duration-150",
                                prefs.sessionSize === size
                                    ? "border-accent-border bg-accent-bg text-accent shadow-theme-sm"
                                    : "border-border bg-bg text-text hover:bg-accent-bg/40 hover:border-accent-border/60",
                                "disabled:opacity-60 disabled:cursor-not-allowed",
                            )}
                            disabled={disabled || loading}
                            onClick={() => updatePref({ sessionSize: size })}
                        >
                            <span className="text-[1.5rem] font-bold leading-none">{size}</span>
                            <span className="text-xs text-text-muted">
                                {fmt(t.flashcard.randomCards, { count: size })}
                            </span>
                        </button>
                    ))}
                </div>
            </section>

            <button
                type="button"
                className={cn(btnClass("primary"), "w-full")}
                disabled={disabled || loading}
                onClick={handleStart}
            >
                {loading ? t.common.loading : t.flashcard.startSession}
            </button>
        </div>
    );
}
