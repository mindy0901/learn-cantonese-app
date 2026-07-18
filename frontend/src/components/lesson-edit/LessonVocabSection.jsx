import { memo, useEffect, useMemo, useState } from 'react'
import { useLocale } from '../../store/localeStore.js'
import { useWords, useAppActions, useAppStore } from '../../store/appStore.js'
import { useLessonDraftStore } from '../../store/lessonDraftStore.js'
import { WordPicker } from '../WordPicker.jsx'
import { AddWordModal } from '../AddWordModal.jsx'
import { hanTextClassName } from '../../lib/wordPopularity.js'
import { btnClass } from '../ui/buttonStyles.js'
import { cn } from '../../lib/cn.js'
import { logWarn } from '../../lib/actionLog.js'

const thClass = 'px-3 py-2 text-left text-[0.8125rem] font-semibold text-text-h border-b border-border'
const tdClass = 'px-3 py-2 text-left text-[0.8125rem] text-text-h border-b border-border truncate max-w-[180px]'
const rowHoverClass = 'cursor-pointer hover:bg-error-bg/60 transition-colors'

export const LessonVocabSection = memo(function LessonVocabSection() {
  const { t, fmt } = useLocale()
  const words = useWords()
  const { ensureWordsByIds } = useAppActions()
  const selectedOrder = useLessonDraftStore((s) => s.selectedOrder)
  const wordExtras = useLessonDraftStore((s) => s.wordExtras)
  const toggleSelected = useLessonDraftStore((s) => s.toggleSelected)
  const clearSelected = useLessonDraftStore((s) => s.clearSelected)
  const addWordExtra = useLessonDraftStore((s) => s.addWordExtra)
  const removeWordExtra = useLessonDraftStore((s) => s.removeWordExtra)
  const [addOpen, setAddOpen] = useState(false)
  const [initialHan, setInitialHan] = useState('')

  const selectedSet = useMemo(
    () => new Set(selectedOrder.map((id) => String(id))),
    [selectedOrder],
  )

  useEffect(() => {
    if (selectedOrder.length === 0) return
    let cancelled = false
    ensureWordsByIds(selectedOrder)
      .then(() => {
        if (cancelled) return
        const loaded = new Set(useAppStore.getState().words.map((w) => String(w.id)))
        const pruned = selectedOrder.filter((id) => loaded.has(String(id)))
        if (pruned.length !== selectedOrder.length) {
          useLessonDraftStore.getState().setSelectedOrder(pruned)
        }
      })
      .catch((err) => {
        logWarn("Load draft words failed", err instanceof Error ? err.message : err)
      })
    return () => {
      cancelled = true
    }
  }, [selectedOrder, ensureWordsByIds])

  const selectedWords = useMemo(() => {
    const map = new Map(words.map((w) => [String(w.id), w]))
    return selectedOrder.map((id) => map.get(String(id))).filter(Boolean)
  }, [words, selectedOrder])

  const totalCount = selectedWords.length + wordExtras.length
  const hasChips = totalCount > 0

  return (
    <section className="bg-surface border border-border rounded-xl px-5 sm:px-6 py-5 mb-5 shadow-theme-sm [&_h2]:mb-3">
      <h2>{fmt(t.lessonEdit.vocabTitle, { count: totalCount })}</h2>
      <p className="text-sm text-text-muted mb-3">{t.lessonEdit.vocabHint}</p>
      <WordPicker
        selected={selectedSet}
        onToggle={toggleSelected}
        onAddNew={(q) => { setInitialHan(q); setAddOpen(true) }}
      />
      <div className="mt-3">
        {hasChips && (
          <div className="border border-border rounded-lg overflow-hidden max-h-80 overflow-y-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-bg">
                  <th className={cn(thClass, 'w-[1%] whitespace-nowrap')}>#</th>
                  <th className={thClass}>{t.wordBank.colHanViet}</th>
                  <th className={thClass}>{t.wordBank.colHanTraditional}</th>
                  <th className={thClass}>{t.wordBank.colVietnamese}</th>
                  <th className={thClass}>{t.wordBank.colEnglish}</th>
                  <th className={cn(thClass, 'w-[1%]')}></th>
                </tr>
              </thead>
              <tbody>
                {selectedWords.map((w, i) => (
                  <tr
                    key={w.id}
                    className={rowHoverClass}
                    onClick={() => toggleSelected(w.id)}
                    title={t.lessonEdit.tapChipToRemove}
                  >
                    <td className={cn(tdClass, 'text-text-muted whitespace-nowrap')}>{i + 1}</td>
                    <td className={cn(tdClass, 'text-viet font-medium')}>{w.hanViet || '—'}</td>
                    <td className={cn(tdClass, hanTextClassName(w.popularity))}>{w.hanTraditional}</td>
                    <td className={cn(tdClass, 'text-viet')}>{w.vietnamese || '—'}</td>
                    <td className={tdClass}>{w.english}</td>
                    <td className={cn(tdClass, 'text-center')}>
                      <span className="text-base text-text-muted leading-none hover:text-error-text" aria-hidden="true">×</span>
                    </td>
                  </tr>
                ))}
                {wordExtras.map((w, i) => (
                  <tr
                    key={w.id}
                    className={rowHoverClass}
                    onClick={() => removeWordExtra(w.id)}
                    title={t.lessonEdit.tapChipToRemove}
                  >
                    <td className={cn(tdClass, 'text-text-muted whitespace-nowrap')}>{selectedWords.length + i + 1}</td>
                    <td className={cn(tdClass, 'text-viet font-medium')}>{w.hanViet || '—'}</td>
                    <td className={cn(tdClass, hanTextClassName(w.popularity))}>
                      {w.hanTraditional}
                      <span className="ml-1.5 text-[0.625rem] font-semibold uppercase tracking-wide text-accent bg-accent-bg border border-accent-border rounded px-1 align-middle">
                        {t.lessonEdit.customBadge}
                      </span>
                    </td>
                    <td className={cn(tdClass, 'text-viet')}>{w.vietnamese || '—'}</td>
                    <td className={tdClass}>{w.english}</td>
                    <td className={cn(tdClass, 'text-center')}>
                      <span className="text-base text-text-muted leading-none hover:text-error-text" aria-hidden="true">×</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex justify-between items-center mt-2 text-[0.8125rem] text-text-muted">
          <span>{fmt(t.lessonEdit.selected, { count: totalCount })}</span>
          <button
            type="button"
            className={btnClass('ghost', 'sm')}
            onClick={clearSelected}
            disabled={selectedOrder.length === 0}
          >
            {t.lessonEdit.clear}
          </button>
        </div>
      </div>
      {addOpen && (
        <AddWordModal
          onSave={addWordExtra}
          onClose={() => { setAddOpen(false); setInitialHan('') }}
          initialHanTraditional={initialHan}
        />
      )}
    </section>
  )
})
