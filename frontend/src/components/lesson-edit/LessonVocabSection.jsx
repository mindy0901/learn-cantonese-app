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

const chipClass =
  'inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-8 border border-border rounded-full bg-surface text-text-h text-[0.8125rem] font-medium leading-5 shadow-theme-sm cursor-pointer transition-[background,border-color,color] duration-150 hover:border-error-border hover:bg-error-bg [&:hover>:not([class*=han-popularity])]:text-error-text'

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
      />
      <div className="mt-3">
        <button type="button" className={btnClass('outline', 'sm')} onClick={() => setAddOpen(true)}>
          + {t.lessonEdit.addCustomWord}
        </button>
      </div>
      <div className="mt-3">
        {hasChips && (
          <>
            <p className="mb-1.5 text-text-muted text-sm">{t.lessonEdit.tapChipToRemove}</p>
            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-0.5">
              {selectedWords.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  className={chipClass}
                  onClick={() => toggleSelected(w.id)}
                  title={t.lessonEdit.tapChipToRemove}
                >
                  <span className={hanTextClassName(w.popularity)}>{w.hanTraditional}</span>
                  <span className="text-text-muted">·</span>
                  <span>{w.english}</span>
                  <span className="ml-0.5 text-base leading-none opacity-55 hover:opacity-100" aria-hidden="true">×</span>
                </button>
              ))}
              {wordExtras.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  className={cn(chipClass, 'border-dashed')}
                  onClick={() => removeWordExtra(w.id)}
                  title={t.lessonEdit.tapChipToRemove}
                >
                  <span className="text-[0.6875rem] font-semibold uppercase tracking-wide text-accent bg-accent-bg border border-accent-border rounded px-1.5 leading-snug">
                    {t.lessonEdit.customBadge}
                  </span>
                  <span className={hanTextClassName(w.popularity)}>{w.hanTraditional}</span>
                  <span className="text-text-muted">·</span>
                  <span>{w.english || w.vietnamese}</span>
                  <span className="ml-0.5 text-base leading-none opacity-55 hover:opacity-100" aria-hidden="true">×</span>
                </button>
              ))}
            </div>
          </>
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
          onClose={() => setAddOpen(false)}
        />
      )}
    </section>
  )
})
