import { useMemo } from "react";
import { useLocale } from "../store/localeStore.js";
import { WordFieldText } from "./WordFieldText.jsx";
import { cn } from "../lib/cn.js";
import { btnClass } from "./ui/buttonStyles.js";
import { FlashcardStatsPanel } from "./FlashcardStatsPanel.jsx";

const outcomeClass = {
    mastered: "text-primary bg-primary border-primary",
    again: "text-destructive bg-destructive/10 border-destructive/30",
    passed: "text-muted-foreground bg-background border-border",
};

export function FlashcardSessionSummary({ entries, onPlayAgain, onNewSession, loading = false }) {
    const { t, fmt } = useLocale();

    const total = entries.length;
    const mastered = entries.filter((e) => e.outcome === "mastered").length;
    const again = entries.filter((e) => e.outcome === "again").length;
    const masteryPct = total > 0 ? Math.round((mastered / total) * 100) : 0;
    const statsKey = useMemo(() => entries.map((e) => `${e.id}:${e.outcome}`).join(","), [entries]);

    return (
        <div className="flex flex-col gap-5">
            <div className="text-center py-6 px-5 bg-card border border-border rounded-2xl shadow-md">
                <h2 className="m-0 text-xl font-bold text-foreground">{t.flashcard.sessionComplete}</h2>
                <p className="mt-2 mb-5 text-sm text-muted-foreground">
                    {fmt(t.flashcard.summarySubtitle, { count: total })}
                </p>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-xl border border-border bg-background px-3 py-4">
                        <p className="m-0 text-2xl font-bold tabular-nums text-foreground">{total}</p>
                        <p className="mt-1 m-0 text-xs text-muted-foreground">{t.flashcard.summaryTotal}</p>
                    </div>
                    <div className="rounded-xl border border-primary bg-primary/50 px-3 py-4">
                        <p className="m-0 text-2xl font-bold tabular-nums text-primary">{mastered}</p>
                        <p className="mt-1 m-0 text-xs text-primary">{t.flashcard.summaryMastered}</p>
                    </div>
                    <div className="rounded-xl border border-destructive/30 bg-destructive/10/50 px-3 py-4">
                        <p className="m-0 text-2xl font-bold tabular-nums text-destructive">{again}</p>
                        <p className="mt-1 m-0 text-xs text-destructive">{t.flashcard.summaryAgain}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-background px-3 py-4">
                        <p className="m-0 text-2xl font-bold tabular-nums text-primary">{masteryPct}%</p>
                        <p className="mt-1 m-0 text-xs text-muted-foreground">{t.flashcard.summaryMasteryRate}</p>
                    </div>
                </div>
            </div>

            <FlashcardStatsPanel key={statsKey} compact />

            <section className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-border">
                    <h3 className="m-0 text-sm font-semibold text-foreground">{t.flashcard.summaryTableTitle}</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                        <thead>
                            <tr className="border-b border-border bg-background">
                                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    {t.flashcard.hanTraditional}
                                </th>
                                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    {t.wordBank.colVietnamese}
                                </th>
                                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    {t.wordBank.colEnglish}
                                </th>
                                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    {t.flashcard.summaryResult}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {entries.map((entry) => (
                                <tr key={entry.id} className="border-b border-border last:border-b-0">
                                    <td className="px-4 py-2.5 align-middle">
                                        <span className="font-semibold text-han-trad">
                                            {entry.hanSimplified || entry.hanHongKong || entry.hanTraditional || "—"}
                                        </span>
                                        <WordFieldText
                                            word={entry}
                                            field="sinoVietnamese"
                                            updatingLabel={t.wordBank.fieldUpdating}
                                            className="ml-2 text-xs text-muted-foreground"
                                        />
                                    </td>
                                    <td className="px-4 py-2.5 align-middle text-viet">
                                        <WordFieldText
                                            word={entry}
                                            field="vietMeanings"
                                            updatingLabel={t.wordBank.fieldUpdating}
                                        />
                                    </td>
                                    <td className="px-4 py-2.5 align-middle text-muted-foreground">
                                        <WordFieldText
                                            word={entry}
                                            field="engMeanings"
                                            updatingLabel={t.wordBank.fieldUpdating}
                                        />
                                    </td>
                                    <td className="px-4 py-2.5 align-middle">
                                        <span
                                            className={cn(
                                                "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
                                                outcomeClass[entry.outcome],
                                            )}
                                        >
                                            {entry.outcome === "mastered"
                                                ? t.flashcard.summaryOutcomeMastered
                                                : entry.outcome === "again"
                                                  ? entry.againTimes > 1
                                                      ? fmt(t.flashcard.summaryOutcomeAgainTimes, {
                                                            count: entry.againTimes,
                                                        })
                                                      : t.flashcard.summaryOutcomeAgain
                                                  : t.flashcard.summaryOutcomePassed}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            <div className="flex flex-wrap justify-center gap-3">
                <button type="button" className={btnClass("primary")} onClick={onPlayAgain} disabled={loading}>
                    {loading ? t.flashcard.restartLoading : t.flashcard.restart}
                </button>
                <button type="button" className={btnClass("outline")} onClick={onNewSession} disabled={loading}>
                    {t.flashcard.newSession}
                </button>
            </div>
        </div>
    );
}
