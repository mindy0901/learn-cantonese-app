import { useLocale } from '../store/localeStore.js'
import { getFlashcardStatsView, loadFlashcardStats } from '../lib/flashcardStats.js'

function StatCard({ value, label, tone = 'default' }) {
  const toneClass =
    tone === 'success'
      ? 'border-success-border bg-success-bg/40 text-success-text'
      : tone === 'accent'
        ? 'border-accent-border bg-accent-bg/40 text-accent'
        : 'border-border bg-bg text-text-h'

  return (
    <div className={`rounded-xl border px-3 py-3.5 text-center ${toneClass}`}>
      <p className="m-0 text-xl font-bold tabular-nums leading-tight">{value}</p>
      <p className="mt-1 mb-0 text-[0.6875rem] leading-snug text-text-muted">{label}</p>
    </div>
  )
}

export function FlashcardStatsPanel({ compact = false }) {
  const { t, fmt } = useLocale()
  const view = getFlashcardStatsView(loadFlashcardStats())

  const offlineLabel =
    view.offlineDays === null
      ? '—'
      : view.offlineDays === 0
        ? t.flashcard.statsOnlineToday
        : fmt(t.flashcard.statsOfflineDays, { count: view.offlineDays })

  if (view.totalSessions === 0) {
    return (
      <section className="rounded-xl border border-border bg-surface px-4 py-4 shadow-theme-sm">
        <h3 className="m-0 text-sm font-semibold text-text-h">{t.flashcard.statsTitle}</h3>
        <p className="mt-2 mb-0 text-sm text-text-muted">{t.flashcard.statsEmpty}</p>
      </section>
    )
  }

  return (
    <section className="rounded-xl border border-border bg-surface px-4 py-4 shadow-theme-sm">
      <h3 className="m-0 text-sm font-semibold text-text-h">{t.flashcard.statsTitle}</h3>
      <div className={`mt-3 grid gap-2.5 ${compact ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6'}`}>
        <StatCard value={view.activeDays} label={t.flashcard.statsActiveDays} tone="accent" />
        <StatCard value={offlineLabel} label={t.flashcard.statsOffline} />
        <StatCard value={view.streak} label={t.flashcard.statsStreak} tone="success" />
        <StatCard value={view.totalSessions} label={t.flashcard.statsSessions} />
        <StatCard value={view.totalCardsReviewed} label={t.flashcard.statsCardsPlayed} />
        <StatCard value={view.totalMastered} label={t.flashcard.statsCardsMastered} tone="success" />
      </div>
    </section>
  )
}
