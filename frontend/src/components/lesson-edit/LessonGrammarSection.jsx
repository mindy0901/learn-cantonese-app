import { memo, useMemo, useState } from 'react'
import { useLocale } from '../../store/localeStore.js'
import { useGrammarBank } from '../../store/appStore.js'
import { useLessonDraftStore } from '../../store/lessonDraftStore.js'
import { GrammarPicker } from '../GrammarPicker.jsx'
import { AddGrammarModal } from '../AddGrammarModal.jsx'
import { btnClass } from '../ui/buttonStyles.js'
import { cn } from '../../lib/cn.js'

const chipClass =
  'inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-8 border border-border rounded-full bg-surface text-text-h text-[0.8125rem] font-medium leading-5 shadow-theme-sm cursor-pointer transition-[background,border-color,color] duration-150 hover:border-error-border hover:bg-error-bg [&:hover>:not(.grammar-chip__title)]:text-error-text'

export const LessonGrammarSection = memo(function LessonGrammarSection() {
  const { t, fmt } = useLocale()
  const grammarBank = useGrammarBank()
  const grammarSelectedOrder = useLessonDraftStore((s) => s.grammarSelectedOrder)
  const grammarExtras = useLessonDraftStore((s) => s.grammarExtras)
  const toggleGrammarSelected = useLessonDraftStore((s) => s.toggleGrammarSelected)
  const clearGrammarSelected = useLessonDraftStore((s) => s.clearGrammarSelected)
  const addGrammarExtra = useLessonDraftStore((s) => s.addGrammarExtra)
  const removeGrammarExtra = useLessonDraftStore((s) => s.removeGrammarExtra)
  const [addOpen, setAddOpen] = useState(false)

  const selectedSet = useMemo(() => new Set(grammarSelectedOrder), [grammarSelectedOrder])

  const selectedItems = useMemo(() => {
    const map = new Map(grammarBank.map((g) => [g.id, g]))
    return grammarSelectedOrder.map((id) => map.get(id)).filter(Boolean)
  }, [grammarBank, grammarSelectedOrder])

  const totalCount = selectedItems.length + grammarExtras.length
  const hasChips = totalCount > 0

  const handleAddCustom = (item) => {
    addGrammarExtra({ title: item.title, content: item.content })
  }

  return (
    <section className="bg-surface border border-border rounded-xl px-5 sm:px-6 py-5 mb-5 shadow-theme-sm [&_h2]:mb-3">
      <h2>{fmt(t.lessonEdit.grammarTitle, { count: totalCount })}</h2>
      <p className="text-sm text-text-muted mb-3">{t.lessonEdit.grammarHint}</p>
      <GrammarPicker
        selected={selectedSet}
        onToggle={toggleGrammarSelected}
        onClear={clearGrammarSelected}
      />
      <div className="mt-3">
        <button type="button" className={btnClass('outline', 'sm')} onClick={() => setAddOpen(true)}>
          + {t.lessonEdit.addCustomGrammar}
        </button>
      </div>
      {hasChips && (
        <div className="mt-3">
          <p className="mb-1.5 text-text-muted text-sm">{t.lessonEdit.tapChipToRemove}</p>
          <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-0.5">
            {selectedItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={chipClass}
                onClick={() => toggleGrammarSelected(item.id)}
                title={t.lessonEdit.tapChipToRemove}
              >
                <span className="font-semibold">{item.title}</span>
                {item.content && (
                  <>
                    <span className="text-text-muted">·</span>
                    <span className="text-text-muted max-w-56 overflow-hidden text-ellipsis whitespace-nowrap">{item.content}</span>
                  </>
                )}
                <span className="ml-0.5 text-base leading-none opacity-55 hover:opacity-100" aria-hidden="true">×</span>
              </button>
            ))}
            {grammarExtras.map((item) => (
              <button
                key={item.id}
                type="button"
                className={cn(chipClass, 'border-dashed')}
                onClick={() => removeGrammarExtra(item.id)}
                title={t.lessonEdit.tapChipToRemove}
              >
                <span className="text-[0.6875rem] font-semibold uppercase tracking-wide text-accent bg-accent-bg border border-accent-border rounded px-1.5 leading-snug">
                  {t.lessonEdit.customBadge}
                </span>
                <span className="font-semibold">{item.title}</span>
                {item.content && (
                  <>
                    <span className="text-text-muted">·</span>
                    <span className="text-text-muted max-w-56 overflow-hidden text-ellipsis whitespace-nowrap">{item.content}</span>
                  </>
                )}
                <span className="ml-0.5 text-base leading-none opacity-55 hover:opacity-100" aria-hidden="true">×</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {addOpen && (
        <AddGrammarModal
          onSave={handleAddCustom}
          onClose={() => setAddOpen(false)}
          existingItems={grammarBank}
        />
      )}
    </section>
  )
})
