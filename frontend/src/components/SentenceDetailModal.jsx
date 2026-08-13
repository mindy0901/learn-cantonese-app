import { cn } from '../lib/cn.js'
import { btnClass } from './ui/buttonStyles.js'
import { useLocale } from '../store/localeStore.js'
import { displayRomanization } from '../lib/hanScriptDisplay.js'
import { HanVariantsInline } from './HanVariantsInline.jsx'

const backdropClass =
  'fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto overscroll-contain bg-black/40 px-4 py-[max(1.25rem,env(safe-area-inset-top,0px))] pb-[max(1.25rem,env(safe-area-inset-bottom,0px))]'

const modalClass =
  'm-auto flex w-full max-w-[min(36rem,calc(100vw-2rem))] shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_24px_48px_rgb(0_0_0/22%),0_8px_16px_rgb(0_0_0/12%)] max-h-[min(calc(100vh-2.5rem),calc(100dvh-2.5rem))]'

const detailTextClass =
  'm-0 max-w-full text-[clamp(0.9375rem,2.5vw,1.0625rem)] leading-normal break-normal'

const editBtnClass = cn(
  btnClass('outline'),
  'bg-sky-500/12 text-sky-700 border-sky-500/45 hover:enabled:bg-sky-500/22 hover:enabled:border-sky-400 hover:enabled:text-sky-800',
  'dark:bg-sky-400/14 dark:text-sky-300 dark:border-sky-300/40 dark:hover:enabled:bg-sky-400/24 dark:hover:enabled:border-sky-300 dark:hover:enabled:text-sky-100',
)

export function SentenceDetailModal({ item, onClose, onToggleImportant, onToggleMastered, canEdit, onEdit }) {
  const { t } = useLocale()
  const romanization = displayRomanization(item)

  return (
    <div className={backdropClass} role="presentation">
      <div
        className={modalClass}
        role="dialog"
        aria-label={item.hanTraditional}
        aria-modal="true"
      >
        {(onToggleImportant || onToggleMastered) && (
          <div className="flex items-center justify-between gap-2 px-4 pt-3">
            {onToggleMastered ? (
              <button
                type="button"
                className={cn(
                  btnClass('ghost', 'sm'),
                  'inline-flex min-h-12 min-w-12 items-center justify-center p-2 text-[1.625rem] leading-none',
                  item.mastered && 'text-primary',
                )}
                onClick={() => onToggleMastered(item.id)}
                aria-label={item.mastered ? t.wordDetail.unmarkMastered : t.wordDetail.markMastered}
                title={item.mastered ? t.wordDetail.unmarkMastered : t.wordDetail.markMastered}
              >
                ✓
              </button>
            ) : (
              <span className="w-12 shrink-0" aria-hidden="true" />
            )}
            {onToggleImportant ? (
              <button
                type="button"
                className={cn(
                  btnClass('ghost', 'sm'),
                  'inline-flex min-h-12 min-w-12 items-center justify-center p-2 text-[1.625rem] leading-none',
                  item.important && 'text-yellow-500',
                )}
                onClick={() => onToggleImportant(item.id)}
                aria-label={item.important ? t.wordBank.unmarkImportant : t.wordBank.markImportant}
                title={item.important ? t.wordBank.unmarkImportant : t.wordBank.markImportant}
              >
                ★
              </button>
            ) : (
              <span className="w-12 shrink-0" aria-hidden="true" />
            )}
          </div>
        )}

        <div className="my-auto flex min-h-0 w-full min-w-0 flex-1 flex-col gap-0 overflow-y-auto px-6 py-5 text-center">
          <div className="mx-auto flex w-full min-w-0 max-w-full flex-col items-center justify-center gap-5 py-1">
            <div className="mb-1 flex w-full min-w-0 flex-col items-center gap-1.5 text-center">
              <HanVariantsInline
                traditional={item.hanTraditional}
                simplified={item.hanSimplified}
                size="lg"
                className="justify-center"
              />
              {(item.jyutping || item.pinyin || romanization) && (
                <div className="mt-1 flex flex-col items-center gap-1">
                  {item.jyutping && (
                    <p className={cn(detailTextClass, 'font-semibold not-italic tracking-wide text-jyutping')}>
                      {item.jyutping}
                    </p>
                  )}
                  {item.pinyin && item.pinyin !== item.jyutping && (
                    <p className={cn(detailTextClass, 'text-muted-foreground tabular-nums')}>{item.pinyin}</p>
                  )}
                  {!item.jyutping && !item.pinyin && romanization && (
                    <p className={cn(detailTextClass, 'font-semibold not-italic tracking-wide text-jyutping')}>
                      {romanization}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex w-full min-w-0 flex-col items-center gap-2.5 text-center">
              <p className={cn(detailTextClass, 'font-semibold text-viet')}>{item.vietnamese || '—'}</p>
              {item.english && (
                <p className={cn(detailTextClass, 'mt-1.5 font-medium text-foreground [hyphens:auto] [text-wrap:pretty]')}>
                  {item.english}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-4 px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="mr-auto flex flex-wrap items-center gap-2.5">
              {canEdit && onEdit && (
                <button type="button" className={editBtnClass} onClick={() => onEdit(item)}>
                  {t.common.edit}
                </button>
              )}
            </div>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2.5">
              <button type="button" className={btnClass('primary')} onClick={onClose}>
                {t.common.close}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
