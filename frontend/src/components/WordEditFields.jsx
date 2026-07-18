import { useCallback, useEffect, useRef } from 'react'
import { cn } from '../lib/cn.js'
import { uiInputClass } from './ui/controlStyles.js'
import { useLocale } from '../store/localeStore.js'
import { wordFieldSummary } from '../lib/wordDisplay.js'
import { emptyWord } from '../types/word.js'
import { useHanCharacters } from '../store/appStore.js'
import { TagInput } from './TagInput.jsx'

const textareaClass =
  'min-h-[4.5rem] w-full resize-none overflow-hidden rounded-lg border border-border bg-surface px-3.5 py-2.5 font-inherit text-[0.9375rem] text-text-h outline-none focus:border-accent-border [field-sizing:content]'

/** Build a lookup map: character → hanCharacters entries (indexed by both simplified and traditional) */
function buildCharLookupMap(hanCharacters) {
  const map = new Map()
  for (const hc of hanCharacters) {
    const simp = (hc.hanSimplified ?? '').trim()
    const trad = (hc.hanTraditional ?? '').trim()
    if (simp) {
      if (!map.has(simp)) map.set(simp, [])
      map.get(simp).push(hc)
    }
    if (trad && trad !== simp) {
      if (!map.has(trad)) map.set(trad, [])
      map.get(trad).push(hc)
    }
  }
  return map
}

/**
 * Given a hanTraditional string and the lookup map, return per-character readings.
 * Returns an array of { char, jyutpingOptions: string[], pinyinOptions: string[] }
 * where each option represents one possible reading for that character.
 */
function resolveCharReadings(hanText, lookupMap) {
  if (!hanText) return []
  const chars = [...hanText]
  return chars.map((ch) => {
    // Skip non-CJK characters (spaces, punctuation, etc.)
    if (!/\p{Script=Han}/u.test(ch)) {
      return { char: ch, jyutpingOptions: [], pinyinOptions: [], isHan: false }
    }
    const entries = lookupMap.get(ch)
    if (!entries || entries.length === 0) {
      return { char: ch, jyutpingOptions: [], pinyinOptions: [], isHan: true }
    }
    // Collect unique jyutping, pinyin, and hanViet readings
    const jpSet = new Set()
    const pySet = new Set()
    const hvSet = new Set()
    for (const e of entries) {
      const jpArr = Array.isArray(e.jyutping) ? e.jyutping : (e.jyutping ? [e.jyutping] : [])
      const pyArr = Array.isArray(e.pinyin) ? e.pinyin : (e.pinyin ? [e.pinyin] : [])
      const hvArr = Array.isArray(e.hanViet) ? e.hanViet : (e.hanViet ? [e.hanViet] : [])
      for (const j of jpArr) { if (j) jpSet.add(String(j).trim()) }
      for (const p of pyArr) { if (p) pySet.add(String(p).trim()) }
      for (const h of hvArr) { if (h) hvSet.add(String(h).trim()) }
    }
    return {
      char: ch,
      jyutpingOptions: [...jpSet],
      pinyinOptions: [...pySet],
      hanVietOptions: [...hvSet],
      isHan: true,
    }
  })
}

export function buildWordDraft(word) {
  if (!word?.id) return emptyWord()
  return {
    ...word,
    english: (word.english ?? '').trim() || wordFieldSummary(word, 'english'),
    vietnamese: (word.vietnamese ?? '').trim() || wordFieldSummary(word, 'vietnamese'),
    jyutping: (word.jyutping ?? '').trim().replace(/\s+/g, ', '),
    pinyin: (word.pinyin ?? '').trim().replace(/\s+/g, ', '),
  }
}

/** Convert space-separated text to CamelCase (each word capitalized, no spaces). */
function toCamelCase(value) {
  const trimmed = (value ?? '').trim()
  if (!trimmed) return trimmed
  return trimmed
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('')
}

/** Convert comma/separator-delimited tag values to space-separated string for DB storage. */
function tagsToSpace(value) {
  const trimmed = (value ?? '').trim()
  if (!trimmed) return trimmed
  return trimmed.split(/[,，/、]+/).map((s) => s.trim()).filter(Boolean).join(' ')
}

export function wordDraftPayload(draft) {
  return {
    english: draft.english.trim(),
    hanTraditional: draft.hanTraditional.trim(),
    hanSimplified: draft.hanSimplified?.trim() || undefined,
    vietnamese: draft.vietnamese.trim(),
    hanViet: toCamelCase(draft.hanViet) || undefined,
    jyutping: tagsToSpace(draft.jyutping),
    pinyin: tagsToSpace(draft.pinyin) || undefined,
    vietnameseDetail: draft.vietnameseDetail?.trim() || undefined,
    important: Boolean(draft.important),
  }
}

export function WordEditFields({ draft, onChange, validationError, showDetail = true }) {
  const { t } = useLocale()
  const hanCharacters = useHanCharacters()

  // Build lookup map once
  const lookupMap = buildCharLookupMap(hanCharacters)
  const charReadings = resolveCharReadings(draft.hanTraditional, lookupMap)

  // Per-tag option arrays for TagInput dropdowns (only han chars)
  const hanReadings = charReadings.filter((r) => r.isHan)
  const jyutpingTagOptions = hanReadings.map((r) => r.jyutpingOptions)
  const pinyinTagOptions = hanReadings.map((r) => r.pinyinOptions)
  const hanVietTagOptions = hanReadings.map((r) => r.hanVietOptions)

  // Sync removal across all three tag fields
  const handleRemoveTag = useCallback((idx) => {
    const removeAt = (str) => {
      const parts = (str ?? '').split(/[,，/、]+/).map((s) => s.trim()).filter(Boolean)
      parts.splice(idx, 1)
      return parts.join(', ')
    }
    onChange({
      ...draft,
      hanViet: removeAt(draft.hanViet),
      jyutping: removeAt(draft.jyutping),
      pinyin: removeAt(draft.pinyin),
    })
  }, [draft, onChange])

  const set = (field, value) => {
    onChange({ ...draft, [field]: value })
  }

  const hasHan = draft.hanTraditional.trim().length > 0

  // When hanTraditional changes, auto-fill jyutping/pinyin/hanViet
  const handleHanChange = (value) => {
    const readings = resolveCharReadings(value, lookupMap)
    const jpParts = readings.map((r) => {
      if (!r.isHan) return r.char
      return r.jyutpingOptions[0] || ''
    })
    const pyParts = readings.map((r) => {
      if (!r.isHan) return r.char
      return r.pinyinOptions[0] || ''
    })
    const hvParts = readings.map((r) => {
      if (!r.isHan) return ''
      return toCamelCase(r.hanVietOptions[0]) || ''
    })
    onChange({
      ...draft,
      hanTraditional: value,
      jyutping: jpParts.join(', '),
      pinyin: pyParts.join(', '),
      hanViet: hvParts.join(', '),
    })
  }

  // Sync on mount when hanTraditional is pre-filled (e.g. from "add new word" flow)
  const syncedRef = useRef(false)
  useEffect(() => {
    if (!syncedRef.current && hasHan && !draft.jyutping?.trim() && !draft.hanViet?.trim()) {
      syncedRef.current = true
      handleHanChange(draft.hanTraditional)
    }
  }, [hasHan, draft.hanTraditional, draft.jyutping, draft.hanViet, handleHanChange])

  return (
    <div className="flex w-full min-w-0 flex-col gap-4 text-left">
      {/* 1. Chữ Hán — moved to top */}
      <label className="flex flex-col gap-1.5 text-sm font-medium text-text-h">
        {t.wordBank.colHanTraditional} *
        <input
          className={cn(uiInputClass, 'text-red-600 dark:text-red-400')}
          value={draft.hanTraditional}
          onChange={(e) => handleHanChange(e.target.value)}
        />
      </label>

      {hasHan && (
        <>
          {/* 2. Hán-Việt */}
          <label className="flex flex-col gap-1.5 text-sm font-medium text-text-h">
            {t.wordBank.colHanViet}
            <TagInput
              value={draft.hanViet ?? ''}
              onChange={(v) => set('hanViet', toCamelCase(v))}
              tagOptions={hanVietTagOptions}
              onRemoveTag={handleRemoveTag}
              allowEmpty
            />
          </label>

          {/* 3. Jyutping */}
          <label className="flex flex-col gap-1.5 text-sm font-medium text-text-h">
            {t.wordBank.colJyutping} *
            <TagInput
              value={draft.jyutping ?? ''}
              onChange={(v) => set('jyutping', v)}
              className="font-semibold text-jyutping"
              tagOptions={jyutpingTagOptions}
              onRemoveTag={handleRemoveTag}
              allowEmpty
            />
          </label>

          {/* 4. Pinyin */}
          <label className="flex flex-col gap-1.5 text-sm font-medium text-text-h">
            {t.wordBank.colPinyin}
            <TagInput
              value={draft.pinyin ?? ''}
              onChange={(v) => set('pinyin', v)}
              className="text-pinyin"
              tagOptions={pinyinTagOptions}
              onRemoveTag={handleRemoveTag}
              allowEmpty
            />
          </label>
        </>
      )}

      {/* 5. Vietnamese */}
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
          />
        </label>
      )}

      {/* 6. English */}
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
