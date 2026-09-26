import { useEffect, useState } from "react";
import { useLocale } from "../store/localeStore.js";
import { useAppStore } from "../store/appStore.js";
import {
    FLASHCARD_SESSION_SIZES,
    FLASHCARD_SOURCES,
    loadFlashcardPrefs,
    saveFlashcardPrefs,
} from "../lib/flashcardPrefs.js";
import { api } from "../lib/api.js";
import { cn } from "../lib/cn.js";
import { Button } from "./shadcn/button.jsx";
import { Card, CardContent, CardHeader, CardTitle } from "./shadcn/card.jsx";
import { Checkbox } from "./shadcn/checkbox.jsx";
import { Label } from "./shadcn/label.jsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./shadcn/select.jsx";

const selectFieldClass = "w-full!";

export function FlashcardSessionSetup({ onStart, loading, disabled }) {
    const { t, fmt } = useLocale();
    const language = useAppStore((s) => s.language);
    const setActiveLanguage = useAppStore((s) => s.setActiveLanguage);
    const [prefs, setPrefs] = useState(() => loadFlashcardPrefs());

    const updatePref = (patch) => {
        const next = saveFlashcardPrefs(patch);
        setPrefs(next);
    };

    const sourceLabels = {
        random: t.flashcard.sourceRandom,
        user: t.flashcard.sourceUser,
        deck: t.flashcard.sourceDeck,
    };

    const [decks, setDecks] = useState([]);
    const [decksLoading, setDecksLoading] = useState(false);

    // Load decks khi nguồn là 'deck'
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

    const toggleDeck = (id) => {
        const cur = prefs.deckIds ?? [];
        updatePref({ deckIds: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
    };

    const handleStart = () => {
        onStart?.({
            ...prefs,
            lang: language,
        });
    };

    const langActiveClass = "border-primary bg-primary/10 text-primary shadow-sm";
    const langIdleClass =
        "border-border bg-background text-muted-foreground hover:bg-primary/10/40 hover:border-primary/25/60";

    // ⚠️ 2026-09-02: user yêu cầu label này là text title — text-lg + trắng.
    const microLabelClass = "mb-1.5 text-lg font-semibold text-foreground";

    return (
        <div className="flex flex-col gap-5">
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg text-foreground">{t.flashcard.setupLanguage}</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-3">
                    <Button
                        type="button"
                        variant="outline"
                        className={cn("min-h-14", language === "cantonese" ? langActiveClass : langIdleClass)}
                        onClick={() => setActiveLanguage("cantonese")}
                        disabled={disabled || loading}
                    >
                        {t.nav.cantoneseGroup}
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        className={cn("min-h-14", language === "mandarin" ? langActiveClass : langIdleClass)}
                        onClick={() => setActiveLanguage("mandarin")}
                        disabled={disabled || loading}
                    >
                        {t.nav.mandarinGroup}
                    </Button>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg text-foreground">{t.flashcard.setupSourceSize}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                    {/* Top: số lượng thẻ 20/50/100 — mặc định ngẫu nhiên toàn bộ kho */}
                    <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-1">
                        {FLASHCARD_SESSION_SIZES.map((size) => (
                            <Button
                                key={size}
                                type="button"
                                variant="outline"
                                className={cn(
                                    "min-h-22 flex-col",
                                    prefs.sessionSize === size ? langActiveClass : langIdleClass,
                                )}
                                disabled={disabled || loading}
                                onClick={() => updatePref({ sessionSize: size })}
                            >
                                <span className="text-[1.5rem] font-bold leading-none">{size}</span>
                                <span className="text-xs text-muted-foreground">
                                    {fmt(t.flashcard.randomCards, { count: size })}
                                </span>
                            </Button>
                        ))}
                    </div>

                    {/* Dưới: chọn nguồn từ vựng — 3 lựa chọn click */}
                    <div className="flex flex-col gap-2">
                        <Label className={microLabelClass}>{t.flashcard.sourceLabel}</Label>
                        <div className="flex flex-col gap-2">
                            {FLASHCARD_SOURCES.map((value) => (
                                <Button
                                    key={value}
                                    type="button"
                                    variant="outline"
                                    className={cn(
                                        "w-full justify-start text-left",
                                        prefs.source === value ? langActiveClass : langIdleClass,
                                    )}
                                    onClick={() => updatePref({ source: value })}
                                    disabled={disabled || loading}
                                >
                                    {sourceLabels[value]}
                                </Button>
                            ))}
                        </div>
                        {prefs.source === "deck" && (
                            <div className="mt-2 flex flex-col gap-2">
                                {decksLoading ? (
                                    <p className="m-0 text-xs text-muted-foreground">{t.common.loading}</p>
                                ) : decks.length === 0 ? (
                                    <p className="m-0 text-xs text-muted-foreground">{t.flashcard.noDecks}</p>
                                ) : (
                                    <div className="flex flex-col gap-2">
                                        {decks.map((deck) => (
                                            <label
                                                key={deck.id}
                                                className="flex cursor-pointer items-center gap-2 text-sm text-foreground"
                                            >
                                                <Checkbox
                                                    checked={(prefs.deckIds ?? []).includes(deck.id)}
                                                    onCheckedChange={() => toggleDeck(deck.id)}
                                                />
                                                {deck.name} ({deck.vocabularyCount ?? 0})
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                        {prefs.source === "user" && (
                            <p className="text-xs text-muted-foreground">{t.flashcard.userLangHint}</p>
                        )}
                        {prefs.source === "random" && (
                            <p className="text-xs text-muted-foreground">{t.flashcard.randomLangHint}</p>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* ⚠️ 2026-09-19: BỎ card "Chọn chế độ lật Flashcard" — thẻ giờ chỉ có 1 kiểu:
                hero hán tự + bấm để mở nghĩa & ví dụ (user yêu cầu). */}
            <Button type="button" className="w-full text-lg" disabled={disabled || loading} onClick={handleStart}>
                {loading ? t.common.loading : t.flashcard.startSession}
            </Button>
        </div>
    );
}
