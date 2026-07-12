import { useLocale } from '../store/localeStore.js'
import { FLASHCARD_SESSION_SIZES } from '../lib/flashcardWords.js'
import { cn } from '../lib/cn.js'

export function FlashcardSizePicker({ onSelect, loading, disabled }) {
  const { t, fmt } = useLocale()

  return (
    <div className="flex flex-col items-center gap-4 px-4 pt-6 pb-8">
      <p className="text-center max-w-md text-text-muted text-sm">{t.flashcard.chooseSizeHint}</p>
      <div className="grid grid-cols-3 max-sm:grid-cols-1 gap-3 w-full max-w-xl max-sm:max-w-64">
        {FLASHCARD_SESSION_SIZES.map((size) => (
          <button
            key={size}
            type="button"
            className={cn(
              'flex flex-col items-center justify-center gap-1.5 min-h-[6.5rem] px-3 py-4 border border-border rounded-xl bg-surface text-text cursor-pointer transition-[background,border-color,transform] duration-150',
              'hover:bg-accent-bg hover:border-accent-border hover:-translate-y-px',
              'disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:bg-surface disabled:hover:border-border',
            )}
            disabled={disabled || loading}
            onClick={() => onSelect(size)}
          >
            <span className="text-[1.75rem] font-bold text-text-h leading-none">{size}</span>
            <span className="text-[0.8125rem] text-text-muted text-center">
              {fmt(t.flashcard.randomCards, { count: size })}
            </span>
          </button>
        ))}
      </div>
      {loading && <p className="text-text-muted text-sm">{t.common.loading}</p>}
    </div>
  )
}
