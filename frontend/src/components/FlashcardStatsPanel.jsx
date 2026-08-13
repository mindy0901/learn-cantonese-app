import { useLocale } from "../store/localeStore.js";
import { getFlashcardStatsView, loadFlashcardStats } from "../lib/flashcardStats.js";
import { cn } from "@/lib/utils.js";
import { Card, CardContent, CardHeader, CardTitle } from "./shadcn/card.jsx";

function StatCard({ value, label, tone = "default" }) {
    const valueClass = cn(
        "m-0 text-xl font-bold tabular-nums leading-tight",
        tone === "success" && "text-primary",
        tone === "accent" && "text-primary",
        tone === "default" && "text-card-foreground",
    );

    return (
        <Card size="sm" className="text-center">
            <CardContent className="flex flex-col gap-1 px-2 py-3">
                <p className={valueClass}>{value}</p>
                <p className="m-0 text-[0.6875rem] leading-snug text-muted-foreground">{label}</p>
            </CardContent>
        </Card>
    );
}

export function FlashcardStatsPanel({ compact = false }) {
    const { t, fmt } = useLocale();
    const view = getFlashcardStatsView(loadFlashcardStats());

    const offlineLabel =
        view.offlineDays === null
            ? "—"
            : view.offlineDays === 0
              ? t.flashcard.statsOnlineToday
              : fmt(t.flashcard.statsOfflineDays, { count: view.offlineDays });

    if (view.totalSessions === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="text-sm">{t.flashcard.statsTitle}</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground">{t.flashcard.statsEmpty}</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-sm">{t.flashcard.statsTitle}</CardTitle>
            </CardHeader>
            <CardContent>
                <div
                    className={cn(
                        "grid gap-2.5",
                        compact ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6",
                    )}
                >
                    <StatCard value={view.activeDays} label={t.flashcard.statsActiveDays} tone="accent" />
                    <StatCard value={offlineLabel} label={t.flashcard.statsOffline} />
                    <StatCard value={view.streak} label={t.flashcard.statsStreak} tone="success" />
                    <StatCard value={view.totalSessions} label={t.flashcard.statsSessions} />
                    <StatCard value={view.totalCardsReviewed} label={t.flashcard.statsCardsPlayed} />
                    <StatCard value={view.totalMastered} label={t.flashcard.statsCardsMastered} tone="success" />
                </div>
            </CardContent>
        </Card>
    );
}
