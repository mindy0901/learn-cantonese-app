import { cn } from '../lib/cn.js'
import { uiInputClass } from './ui/controlStyles.js'
import { useLocale } from '../store/localeStore.js'
import { wordFieldSummary } from '../lib/wordDisplay.js'
import { emptyWord } from '../types/word.js'

const textareaClass =
  'min-h-[4.5rem] w-full resize-none overflow-hidden rounded-lg border border-border bg-surface px-3.5 py-2.5 font-inherit text-[0.9375rem] text-text-h outline-none focus:border-accent-border [field-sizing:content]'

export function buildWordDraft(word) {
  if (!word?.id) return emptyWord()
  return {
    ...word,
    english: (word.english ?? '').trim() || wordFieldSummary(word, 'english'),
    vietnamese: (word.vietnamese ?? '').trim() || wordFieldSummary(word, 'vietnamese'),
  }
}

export function wordDraftPayload(draft) {
  return {
    english: draft.english.trim(),
    hanTraditional: draft.hanTraditional.trim(),
    hanSimplified: draft.hanSimplified?.trim() || undefined,
    vietnamese: draft.vietnamese.trim(),
    hanViet: draft.hanViet?.trim() || undefined,
    jyutping: draft.jyutping.trim(),
    pinyin: draft.pinyin?.trim() || undefined,
    vietnameseDetail: draft.vietnameseDetail?.trim() || undefined,
    important: Boolean(draft.important),
  }
}

export function WordEditFields({ draft, onChange, validationError, showDetail = true }) {
  const { t } = useLocale()

  const set = (field, value) => {
    onChange({ ...draft, [field]: value })
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-4 text-left">
      <label className="flex flex-col gap-1.5 text-sm font-medium text-text-h">
        {t.wordBank.colHanViet}
        <input
          className={uiInputClass}
          value={draft.hanViet ?? ''}
          onChange={(e) => set('hanViet', e.target.value)}
          placeholder={t.wordBank.hanVietAltHint}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-text-h">
        {t.wordBank.colHanTraditional} *
        <input
          className={cn(uiInputClass, 'text-red-600 dark:text-red-400')}
          value={draft.hanTraditional}
          onChange={(e) => set('hanTraditional', e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-text-h">
        {t.wordBank.colJyutping} *
        <input
          className={cn(uiInputClass, 'font-semibold text-jyutping')}
          value={draft.jyutping ?? ''}
          onChange={(e) => set('jyutping', e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-text-h">
        {t.wordBank.colVietnamese}
        <input
          className={cn(uiInputClass, 'text-viet')}
          value={draft.vietnamese}
          onChange={(e) => set('vietnamese', e.target.value)}
        />
      </label>
      {showDetail && (
        <label className="flex flex-col gap-1.5 text-sm font-medium text-text-h">
          {t.addWord.vietnameseDetail}
          <textarea
            className={textareaClass}
            rows={3}
            value={draft.vietnameseDetail ?? ''}
            onChange={(e) => set('vietnameseDetail', e.target.value)}
            placeholder={t.addWord.vietnameseDetailPlaceholder}
          />
        </label>
      )}
      <label className="flex flex-col gap-1.5 text-sm font-medium text-text-h">
        {t.wordBank.colEnglish}
        <input className={uiInputClass} value={draft.english} onChange={(e) => set('english', e.target.value)} />
      </label>
      <div className="flex items-center gap-3.5 pt-1">
        <button
          type="button"
          className={cn(
            'inline-flex size-12 shrink-0 items-center justify-center rounded-[10px] border-2 border-border bg-surface text-[1.625rem] leading-none text-text-muted transition-[border-color,color,background,box-shadow] duration-150',
            'hover:border-yellow-500 hover:text-yellow-600 hover:shadow-[0_0_0_3px_rgba(234,179,8,0.12)]',
            draft.important &&
              'border-yellow-500 bg-yellow-500/14 text-yellow-500 shadow-[0_0_0_3px_rgba(234,179,8,0.16)]',
          )}
          onClick={() => set('important', !draft.important)}
          aria-pressed={Boolean(draft.important)}
          aria-label={draft.important ? t.wordBank.unmarkImportant : t.wordBank.markImportant}
          title={draft.important ? t.wordBank.unmarkImportant : t.wordBank.markImportant}
        >
          ★
        </button>
        <span className="text-[0.9375rem] font-medium text-text-h">{t.addWord.markImportant}</span>
      </div>
      {validationError && (
        <p className="m-0 rounded-lg border border-error-border bg-error-bg px-4 py-3 text-sm text-error-text" role="alert">
          {validationError}
        </p>
      )}
    </div>
  )
}
