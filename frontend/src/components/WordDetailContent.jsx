import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '../lib/cn.js'
import { Button, IconButton } from './ui/Button.jsx'
import { uiInputClass, uiTextareaClass } from './ui/controlStyles.js'
import { useLocale } from '../store/localeStore.js'
import { wordLookupDisplay } from '../lib/hanLookup.js'
import { WordPopularityPicker } from './WordPopularityPicker.jsx'
import { WordSentenceSuggestions } from './WordSentenceSuggestions.jsx'
import { WordRelatedLessons } from './WordRelatedLessons.jsx'
import { WordFieldText } from './WordFieldText.jsx'
import { buildWordDraft, wordDraftPayload } from './WordEditFields.jsx'
import { TagInput } from './TagInput.jsx'
import { normalizePopularity } from '../lib/wordPopularity.js'
import { normalizeWordFields, wordContentEqual } from '../lib/wordNormalize.js'
import { useHanCharacters } from '../store/appStore.js'
import { hanCharacterDetailPath } from '../lib/hanCharacterRoutes.js'
import { hanziiWordUrl } from '../lib/hanzii.js'

const detailTextClass = 'wd-text m-0 max-w-full leading-normal break-normal'

const fieldStackClass = 'word-detail-content flex w-full min-w-0 flex-col gap-6'

const valueShellClass = 'w-full min-w-0'

const subLabelClass = 'wd-sub m-0 font-semibold uppercase tracking-wide text-text-muted'

const hanShellClass =
  'w-full rounded-xl border border-border/80 bg-surface/80 px-6 py-6 sm:px-7 sm:py-7'

const hanGridClass = 'grid grid-cols-1 items-stretch sm:grid-cols-2 sm:gap-0'

const hanCellClass = 'flex h-full min-h-0 flex-col gap-3 items-center'

const hanCellBodyClass = 'wd-han-cell-body flex flex-1 flex-col justify-center items-center gap-2.5'

const hanGlyphClass = 'wd-han block'

const romanLineClass = cn(
  detailTextClass,
  'wd-roman font-semibold not-italic tracking-wide text-jyutping',
)

const wordDetailInputClass = cn(uiInputClass, 'wd-input')

const actionBarClass = 'grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2 min-h-10'

const masteredBtnClass = (mastered) =>
  cn(
    'transition-[color,background-color,border-color,box-shadow,transform] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
    'active:enabled:scale-[0.98]',
    mastered
      ? 'shadow-[0_1px_4px_color-mix(in_srgb,var(--success-text)_18%,transparent)] ring-1 ring-success-border/50'
      : 'text-text-muted hover:enabled:border-text-muted/40 hover:enabled:text-text-h',
  )

function DetailField({ valueMinHeight, children }) {
  return (
    <div className={cn(valueShellClass, valueMinHeight, 'flex flex-col justify-center')}>{children}</div>
  )
}

function HanSubField({ label, children, bordered }) {
  return (
    <div className={cn(hanCellClass, bordered && 'sm:border-r sm:border-border/60 sm:pr-6')}>
      <p className={subLabelClass}>{label}</p>
      <div className={hanCellBodyClass}>{children}</div>
    </div>
  )
}

function WordHanRomanBlock({ editing, draft, display, onDraftChange, locale, hanTraditional }) {
  const { t } = useLocale()
  const navigate = useNavigate()
  const hanCharacters = useHanCharacters()

  // Build a lookup map: character → hanCharacter id (prefer simplified match, fallback to traditional)
  const charIdMap = new Map()
  for (const hc of hanCharacters) {
    const simp = (hc.hanSimplified ?? '').trim()
    const trad = (hc.hanTraditional ?? '').trim()
    if (simp && !charIdMap.has(simp)) charIdMap.set(simp, hc.id)
    if (trad && trad !== simp && !charIdMap.has(trad)) charIdMap.set(trad, hc.id)
  }

  /** Render text as clickable han characters where possible */
  function renderHanText(text) {
    if (!text) return null
    return [...text].map((ch, i) => {
      const hanId = charIdMap.get(ch)
      const isHan = /\p{Script=Han}/u.test(ch)
      if (hanId && isHan) {
        return (
          <button
            key={i}
            type="button"
            className="inline cursor-pointer border-0 bg-transparent p-0 font-inherit text-inherit leading-tight rounded transition-colors duration-150 hover:text-accent hover:bg-accent/10 focus:outline-2 focus:outline-accent focus:outline-offset-2"
            onClick={(e) => { e.stopPropagation(); navigate(hanCharacterDetailPath(hanId)) }}
            title={`${ch} — ${t.hanCharacters?.viewDetail ?? 'Xem chi tiết'}`}
          >
            {ch}
          </button>
        )
      }
      return <span key={i}>{ch}</span>
    })
  }

  // When trad === simp, collapse to single column (common for characters like 人, 大, etc.)
  const same = display.traditional === (display.simplified || display.traditional)
  const gridClass = same ? 'grid-cols-1' : 'sm:grid-cols-2'
  const shellClass = same ? 'py-6' : hanShellClass

  if (editing) {
    if (same) {
      return (
        <div className={shellClass}>
          <div className="flex flex-col gap-3">
            <input
              className={cn(wordDetailInputClass, 'text-red-600 dark:text-red-400')}
              value={draft.hanTraditional}
              onChange={(e) => onDraftChange('hanTraditional', e.target.value)}
            />
            <TagInput
              value={draft.jyutping ?? ''}
              onChange={(v) => onDraftChange('jyutping', v)}
              className="font-semibold text-jyutping"
              placeholder={t.wordBank.colJyutping}
            />
            <TagInput
              value={draft.pinyin ?? ''}
              onChange={(v) => onDraftChange('pinyin', v)}
              className="font-semibold text-jyutping"
              placeholder={t.wordBank.colPinyin}
            />
          </div>
        </div>
      )
    }
    return (
      <div className={shellClass}>
        <div className={cn(hanGridClass, gridClass)}>
          <HanSubField label={t.wordBank.colHanSimplified} bordered>
            <input
              className={cn(wordDetailInputClass, 'font-semibold text-han')}
              value={draft.hanSimplified ?? ''}
              onChange={(e) => onDraftChange('hanSimplified', e.target.value)}
            />
            <TagInput
              value={draft.pinyin ?? ''}
              onChange={(v) => onDraftChange('pinyin', v)}
              className="font-semibold text-jyutping"
              placeholder={t.wordBank.colPinyin}
            />
          </HanSubField>
          <HanSubField label={t.hanLookup.traditionalHk}>
            <input
              className={cn(wordDetailInputClass, 'text-red-600 dark:text-red-400')}
              value={draft.hanTraditional}
              onChange={(e) => onDraftChange('hanTraditional', e.target.value)}
            />
            <TagInput
              value={draft.jyutping ?? ''}
              onChange={(v) => onDraftChange('jyutping', v)}
              className="font-semibold text-jyutping"
              placeholder={t.wordBank.colJyutping}
            />
          </HanSubField>
        </div>
      </div>
    )
  }

  if (same) {
    const hasJyutping = display.jyutping && display.jyutping !== '—'
    const hasPinyin = display.pinyin && display.pinyin !== '—'
    return (
      <div className={shellClass}>
        <div className="flex flex-col items-center gap-2.5">
          <div className="relative inline-flex">
            <span className={cn(hanGlyphClass, 'font-semibold text-han')}>
              {renderHanText(display.traditional)}
            </span>
            <a
              href={hanziiWordUrl(hanTraditional, locale) ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute -top-1.5 -right-10 inline-flex items-center justify-center size-8 rounded text-sm font-bold text-accent no-underline leading-none hover:text-accent-hover hover:bg-accent/10"
              title={t.wordDetail.openHanzii?.replace('{hanTraditional}', hanTraditional) ?? 'Tra Hanzii'}
              aria-label={t.wordDetail.openHanzii?.replace('{hanTraditional}', hanTraditional) ?? 'Tra Hanzii'}
              onClick={(e) => e.stopPropagation()}
            >
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            </a>
          </div>
          {hasJyutping && hasPinyin ? (
            <div className="flex items-center gap-3">
              <span className={romanLineClass}>{display.pinyin}</span>
              <span className="text-text-muted select-none">|</span>
              <span className={romanLineClass}>{display.jyutping}</span>
            </div>
          ) : (
            <>
              <p className={romanLineClass}>{display.jyutping || '—'}</p>
              {display.pinyin && <p className={romanLineClass}>{display.pinyin}</p>}
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={shellClass}>
      <div className={cn(hanGridClass, gridClass)}>
        <div>
          <HanSubField label={t.wordBank.colHanSimplified} bordered>
            <div className="relative inline-flex">
              <span className={cn(hanGlyphClass, 'font-semibold text-han')}>
                {renderHanText(display.simplified || display.traditional)}
              </span>
              <a
                href={hanziiWordUrl(display.simplified || display.traditional, locale) ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute -top-0.5 -right-8 inline-flex items-center justify-center size-7 rounded text-xs font-bold text-accent no-underline leading-none hover:text-accent-hover hover:bg-accent/10"
                title={t.wordDetail.openHanzii?.replace('{hanTraditional}', display.simplified || display.traditional) ?? 'Tra Hanzii'}
                aria-label={t.wordDetail.openHanzii?.replace('{hanTraditional}', display.simplified || display.traditional) ?? 'Tra Hanzii'}
                onClick={(e) => e.stopPropagation()}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
              </a>
            </div>
            <p className={romanLineClass}>{display.pinyin || '—'}</p>
          </HanSubField>
        </div>
        <div className="sm:pl-6">
          <HanSubField label={t.hanLookup.traditionalHk}>
            <div className="relative inline-flex">
              <span className={cn(hanGlyphClass, 'font-semibold text-han')}>
                {renderHanText(display.traditional)}
              </span>
              <a
                href={hanziiWordUrl(display.traditional, locale) ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute -top-0.5 -right-8 inline-flex items-center justify-center size-7 rounded text-xs font-bold text-accent no-underline leading-none hover:text-accent-hover hover:bg-accent/10"
                title={t.wordDetail.openHanzii?.replace('{hanTraditional}', display.traditional) ?? 'Tra Hanzii'}
                aria-label={t.wordDetail.openHanzii?.replace('{hanTraditional}', display.traditional) ?? 'Tra Hanzii'}
                onClick={(e) => e.stopPropagation()}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
              </a>
            </div>
            <p className={romanLineClass}>{display.jyutping || '—'}</p>
          </HanSubField>
        </div>
      </div>
    </div>
  )
}

export function WordDetailContent({
  word,
  onToggleImportant,
  onToggleMastered,
  onSetPopularity,
  canEdit,
  onSave,
  onNextRandom,
  relatedLessons = [],
}) {
  const { t, locale } = useLocale()
  const display = wordLookupDisplay(word)

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(() => buildWordDraft(word))
  const [validationError, setValidationError] = useState('')
  const [localPopularity, setLocalPopularity] = useState(() => normalizePopularity(word.popularity))
  const showPopularity = onSetPopularity || localPopularity !== null
  const detailText = word.vietnameseDetail?.trim()
  const showDetailField = editing || Boolean(detailText)

  useEffect(() => {
    setLocalPopularity(normalizePopularity(word.popularity))
    if (!editing) setDraft(buildWordDraft(word))
  }, [word, editing])

  const setDraftField = (field, value) => {
    setDraft((d) => ({ ...d, [field]: value }))
    if (validationError) setValidationError('')
  }

  const handlePopularityChange = (level) => {
    const next = normalizePopularity(level)
    const prev = localPopularity
    setLocalPopularity(next)
    const result = onSetPopularity?.(word, next)
    if (result?.then) {
      result.catch(() => setLocalPopularity(prev))
    }
  }

  const startEdit = () => {
    setDraft(buildWordDraft(word))
    setValidationError('')
    setEditing(true)
  }

  const cancelEdit = () => {
    setDraft(buildWordDraft(word))
    setValidationError('')
    setEditing(false)
  }

  const saveEdit = () => {
    if (!draft.hanTraditional.trim() || !(draft.jyutping ?? '').trim()) {
      setValidationError(t.addWord.requiredFields)
      return
    }
    const payload = wordDraftPayload(draft)
    if (wordContentEqual(word, normalizeWordFields({ ...word, ...payload }))) {
      setEditing(false)
      return
    }
    onSave?.(word, payload)
    setEditing(false)
  }

  const handleFormKeyDown = (e) => {
    if (!editing) return
    if (e.key === 'Escape') {
      e.preventDefault()
      cancelEdit()
    } else if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault()
      saveEdit()
    }
  }

  const important = word.important

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-7" onKeyDown={handleFormKeyDown}>
      <div className={cn(actionBarClass, 'shrink-0')}>
        <div className="flex justify-start">
          {onToggleImportant && !editing ? (
            <IconButton
              className={important ? 'text-yellow-500' : 'text-text-muted'}
              onClick={() => onToggleImportant(word)}
              aria-label={important ? t.wordBank.unmarkImportant : t.wordBank.markImportant}
              title={important ? t.wordBank.unmarkImportant : t.wordBank.markImportant}
              aria-pressed={important}
            >
              ★
            </IconButton>
          ) : null}
        </div>
        <div aria-hidden="true" />
        <div className="flex justify-end">
          {onToggleMastered && !editing ? (
            <Button
              variant={word.mastered ? 'success' : 'ghost'}
              className={masteredBtnClass(word.mastered)}
              onClick={() => onToggleMastered(word)}
              aria-label={word.mastered ? t.wordDetail.unmarkMastered : t.wordDetail.mastered}
              title={word.mastered ? t.wordDetail.unmarkMastered : t.wordDetail.mastered}
              aria-pressed={word.mastered}
            >
              <span className="inline-flex items-center gap-1.5">
                <span
                  className={cn(
                    'inline-flex shrink-0 overflow-hidden transition-[width,opacity,transform] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
                    word.mastered ? 'w-[1em] translate-x-0 opacity-100' : 'w-0 -translate-x-1 opacity-0',
                  )}
                  aria-hidden
                >
                  ✓
                </span>
                {t.wordDetail.mastered}
              </span>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-7">
        <div className={cn('mx-auto flex w-full min-w-0 flex-1 flex-col justify-center items-center', fieldStackClass)}>
        <DetailField>
          {editing ? (
            <input
              className={wordDetailInputClass}
              value={draft.hanViet ?? ''}
              onChange={(e) => setDraftField('hanViet', e.target.value)}
              aria-label={t.wordBank.colHanViet}
              placeholder={t.wordBank.hanVietAltHint}
            />
          ) : (
            <WordFieldText
              word={word}
              field="hanViet"
              updatingLabel={t.wordBank.fieldUpdating}
              className={cn(detailTextClass, 'text-text-h font-medium text-center')}
            />
          )}
        </DetailField>

        <WordHanRomanBlock
          editing={editing}
          draft={draft}
          display={display}
          onDraftChange={setDraftField}
          locale={locale}
          hanTraditional={word.hanTraditional}
        />

        <DetailField>
          {editing ? (
            <input
              className={cn(wordDetailInputClass, 'text-viet')}
              value={draft.vietnamese}
              onChange={(e) => setDraftField('vietnamese', e.target.value)}
              aria-label={t.wordBank.colVietnamese}
              placeholder={t.wordBank.colVietnamese}
            />
          ) : (
            <WordFieldText
              word={word}
              field="vietnamese"
              updatingLabel={t.wordBank.fieldUpdating}
              className={cn(detailTextClass, 'font-semibold text-viet text-center')}
            />
          )}
        </DetailField>

        {showDetailField && (
          <DetailField valueMinHeight="wd-detail-block">
            {editing ? (
              <textarea
                className={cn(uiTextareaClass, 'wd-input wd-detail-block resize-none [field-sizing:content]')}
                rows={3}
                value={draft.vietnameseDetail ?? ''}
                onChange={(e) => setDraftField('vietnameseDetail', e.target.value)}
                placeholder={t.addWord.vietnameseDetailPlaceholder}
                aria-label={t.addWord.vietnameseDetail}
              />
            ) : (
              <p className={cn(detailTextClass, 'wd-detail-block whitespace-pre-wrap text-text-h text-center')}>{detailText}</p>
            )}
          </DetailField>
        )}

        <DetailField>
          {editing ? (
            <input
              className={wordDetailInputClass}
              value={draft.english}
              onChange={(e) => setDraftField('english', e.target.value)}
              aria-label={t.wordBank.colEnglish}
              placeholder={t.wordBank.colEnglish}
            />
          ) : (
            <WordFieldText
              word={word}
              field="english"
              updatingLabel={t.wordBank.fieldUpdating}
              className={cn(detailTextClass, 'font-medium text-text-h text-center')}
            />
          )}
        </DetailField>

        {validationError && (
          <p className="m-0 rounded-lg border border-error-border bg-error-bg px-4 py-3 text-sm text-error-text" role="alert">
            {validationError}
          </p>
        )}
        </div>

        <div className="mx-auto flex w-full min-w-0 flex-col gap-6">
          <WordSentenceSuggestions word={word} />
          <WordRelatedLessons lessons={relatedLessons} />
        </div>
      </div>

      <div className={cn(actionBarClass, 'mt-auto shrink-0')}>
        <div className="flex justify-start">
          {canEdit && onSave && !editing && (
            <Button variant="ghost" onClick={startEdit}>
              {t.common.edit}
            </Button>
          )}
          {canEdit && onSave && editing && (
            <Button variant="ghost" onClick={cancelEdit}>
              {t.common.cancel}
            </Button>
          )}
        </div>

        <div className="flex justify-center">
          {showPopularity && !editing && (
            <WordPopularityPicker
              value={localPopularity}
              disabled={!onSetPopularity}
              onChange={handlePopularityChange}
              compact
            />
          )}
        </div>

        <div className="flex justify-end">
          {canEdit && onSave && editing && (
            <Button variant="primary" onClick={saveEdit}>
              {t.common.save}
            </Button>
          )}
          {onNextRandom && !editing && (
            <Button variant="ghost" onClick={onNextRandom}>
              {t.wordDetail.nextWord} →
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
