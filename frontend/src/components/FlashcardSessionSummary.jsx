import { useMemo } from 'react'
import { useLocale } from '../store/localeStore.js'
import { WordFieldText } from './WordFieldText.jsx'
import { hanPopularityClass } from '../lib/wordPopularity.js'
import { cn } from '../lib/cn.js'
import { btnClass } from './ui/buttonStyles.js'
import { FlashcardStatsPanel } from './FlashcardStatsPanel.jsx'

const outcomeClass = {
  mastered: 'text-success-text bg-success-bg border-success-border',
  again: 'text-error-text bg-error-bg border-error-border',
  passed: 'text-text-muted bg-bg border-border',
}

export function FlashcardSessionSummary({ entries, onPlayAgain, onNewSession, loading = false }) {
  const { t, fmt } = useLocale()

  const total = entries.length
  const mastered = entries.filter((e) => e.outcome === 'mastered').length
  const again = entries.filter((e) => e.outcome === 'again').length
  const masteryPct = total > 0 ? Math.round((mastered / total) * 100) : 0
  const statsKey = useMemo(() => entries.map((e) => `${e.id}:${e.outcome}`).join(','), [entries])

  return (
    <div className="flex flex-col gap-5">
      <div className="text-center py-6 px-5 bg-surface border border-border rounded-2xl shadow-theme">
        <h2 className="m-0 text-xl font-bold text-text-h">{t.flashcard.sessionComplete}</h2>
        <p className="mt-2 mb-5 text-sm text-text-muted">{fmt(t.flashcard.summarySubtitle, { count: total })}</p>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-border bg-bg px-3 py-4">
            <p className="m-0 text-2xl font-bold tabular-nums text-text-h">{total}</p>
            <p className="mt-1 m-0 text-xs text-text-muted">{t.flashcard.summaryTotal}</p>
          </div>
          <div className="rounded-xl border border-success-border bg-success-bg/50 px-3 py-4">
            <p className="m-0 text-2xl font-bold tabular-nums text-success-text">{mastered}</p>
            <p className="mt-1 m-0 text-xs text-success-text">{t.flashcard.summaryMastered}</p>
          </div>
          <div className="rounded-xl border border-error-border bg-error-bg/50 px-3 py-4">
            <p className="m-0 text-2xl font-bold tabular-nums text-error-text">{again}</p>
            <p className="mt-1 m-0 text-xs text-error-text">{t.flashcard.summaryAgain}</p>
          </div>
          <div className="rounded-xl border border-border bg-bg px-3 py-4">
            <p className="m-0 text-2xl font-bold tabular-nums text-accent">{masteryPct}%</p>
            <p className="mt-1 m-0 text-xs text-text-muted">{t.flashcard.summaryMasteryRate}</p>
          </div>
        </div>
      </div>

      <FlashcardStatsPanel key={statsKey} compact />

      <section className="bg-surface border border-border rounded-xl overflow-hidden shadow-theme-sm">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="m-0 text-sm font-semibold text-text-h">{t.flashcard.summaryTableTitle}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-bg">
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-text-muted">{t.flashcard.hanTraditional}</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-text-muted">{t.wordBank.colVietnamese}</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-text-muted">{t.wordBank.colEnglish}</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-text-muted">{t.flashcard.summaryResult}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-2.5 align-middle">
                    <span className={cn('font-semibold', hanPopularityClass(entry.popularity))}>{entry.hanTraditional || '—'}</span>
                    <WordFieldText
                      word={entry}
                      field="hanViet"
                      updatingLabel={t.wordBank.fieldUpdating}
                      className="ml-2 text-xs text-text-muted"
                    />
                  </td>
                  <td className="px-4 py-2.5 align-middle text-viet">
                    <WordFieldText word={entry} field="vietnamese" updatingLabel={t.wordBank.fieldUpdating} />
                  </td>
                  <td className="px-4 py-2.5 align-middle text-text-muted">
                    <WordFieldText word={entry} field="english" updatingLabel={t.wordBank.fieldUpdating} />
                  </td>
                  <td className="px-4 py-2.5 align-middle">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
                        outcomeClass[entry.outcome],
                      )}
                    >
                      {entry.outcome === 'mastered'
                        ? t.flashcard.summaryOutcomeMastered
                        : entry.outcome === 'again'
                          ? entry.againTimes > 1
                            ? fmt(t.flashcard.summaryOutcomeAgainTimes, { count: entry.againTimes })
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
        <button type="button" className={btnClass('primary')} onClick={onPlayAgain} disabled={loading}>
          {loading ? t.flashcard.restartLoading : t.flashcard.restart}
        </button>
        <button type="button" className={btnClass('outline')} onClick={onNewSession} disabled={loading}>
          {t.flashcard.newSession}
        </button>
      </div>
    </div>
  )
}
