import { useLocale } from '../store/localeStore.js'
import { normalizePopularity, POPULARITY_LEVELS } from '../lib/wordPopularity.js'
import { cn } from '../lib/cn.js'

const dotColors = {
  0: 'bg-[var(--han-popularity-0)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--han-popularity-0)_28%,transparent)]',
  1: 'bg-[var(--han-popularity-1)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--han-popularity-1)_28%,transparent)]',
  2: 'bg-[var(--han-popularity-2)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--han-popularity-2)_28%,transparent)]',
  3: 'bg-[var(--han-popularity-3)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--han-popularity-3)_28%,transparent)]',
  4: 'bg-[var(--han-popularity-4)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--han-popularity-4)_28%,transparent)]',
}

const dotRing = {
  0: 'ring-[var(--han-popularity-0)]',
  1: 'ring-[var(--han-popularity-1)]',
  2: 'ring-[var(--han-popularity-2)]',
  3: 'ring-[var(--han-popularity-3)]',
  4: 'ring-[var(--han-popularity-4)]',
}

export function WordPopularityPicker({ value, onChange, disabled, compact = false, footer = false }) {
  const { t } = useLocale()
  const level = normalizePopularity(value)
  const showTitle = !compact || footer

  const dotSize = footer ? 'size-9' : compact ? 'size-7' : 'size-8'
  const trackClass = cn(
    'inline-flex items-center justify-center',
    footer
      ? 'gap-2.5 rounded-full bg-bg/90 px-3 py-2 ring-1 ring-border/70 shadow-sm dark:bg-white/5'
      : 'gap-2 rounded-2xl bg-bg/90 px-3 py-2.5 ring-1 ring-border/70 dark:bg-white/5',
  )

  return (
    <div
      className={cn(
        compact
          ? cn('m-0 border-0 p-0', footer ? 'flex items-center gap-3' : 'w-full max-w-[13rem]')
          : 'mt-4 border-t border-border/50 pt-4 dark:border-white/10',
      )}
    >
      {showTitle && (
        <p
          className={cn(
            'm-0 shrink-0 font-medium text-text-muted',
            footer ? 'text-sm whitespace-nowrap' : 'mb-2.5 text-xs font-semibold uppercase tracking-wide',
          )}
        >
          {t.wordPopularity.title}
        </p>
      )}
      <div className={trackClass} role="radiogroup" aria-label={t.wordPopularity.title}>
        {POPULARITY_LEVELS.map((n) => {
          const filled = level !== null && level >= n
          const active = level === n
          const label = t.wordPopularity.levels[n]
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={label}
              disabled={disabled}
              title={label}
              className={cn(
                'rounded-full border-0 p-0 transition-all duration-200 ease-out',
                'cursor-pointer disabled:cursor-default disabled:opacity-50',
                'enabled:hover:scale-105 active:scale-95',
                dotSize,
                filled ? dotColors[n] : 'bg-border/55 enabled:hover:bg-border dark:bg-white/10',
                active && cn('scale-110 ring-2 ring-offset-2 ring-offset-surface', dotRing[n]),
              )}
              data-level={n + 1}
              onClick={() => onChange(active ? null : n)}
            />
          )
        })}
      </div>
    </div>
  )
}
