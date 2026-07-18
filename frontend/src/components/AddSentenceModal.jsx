import { useEffect, useState } from 'react'
import { btnClass } from './ui/buttonStyles.js'
import { uiInputClass, uiModalCloseButtonClass, uiTextareaClass } from './ui/controlStyles.js'
import { cn } from '../lib/cn.js'
import { useLocale } from '../store/localeStore.js'
import { emptySentencePattern } from '../types/word.js'

const backdropClass =
  'fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto overscroll-contain bg-black/40 px-4 py-[max(1.25rem,env(safe-area-inset-top,0px))] pb-[max(1.25rem,env(safe-area-inset-bottom,0px))]'

const sentenceTextareaClass = cn(
  uiTextareaClass,
  'resize-none overflow-hidden leading-normal [field-sizing:content]',
)

const hanFieldClass = cn(sentenceTextareaClass, 'text-red-600 dark:text-red-400')
const jyutpingFieldClass = cn(uiInputClass, 'font-semibold text-jyutping')
const vietFieldClass = cn(sentenceTextareaClass, 'text-viet')
const englishFieldClass = uiInputClass

const modalClass =
  'm-auto flex w-full max-w-[520px] shrink-0 flex-col overflow-hidden rounded-2xl bg-surface shadow-[0_20px_40px_rgba(0,0,0,0.15)] max-h-[min(calc(100vh-2.5rem),calc(100dvh-2.5rem))]'

function buildDraft(item) {
  if (!item?.id) {
    return {
      hanTraditional: '',
      jyutping: '',
      vietnamese: '',
      english: '',
    }
  }
  return {
    hanTraditional: item.hanTraditional ?? '',
    jyutping: item.jyutping ?? '',
    vietnamese: item.vietnamese ?? '',
    english: item.english ?? '',
  }
}

export function AddSentenceModal({ onSave, onClose, item: editItem, existingItems }) {
  const { t } = useLocale()
  const isEdit = Boolean(editItem?.id)
  const [draft, setDraft] = useState(() => buildDraft(editItem))
  const [validationError, setValidationError] = useState('')

  useEffect(() => {
    if (editItem?.id) setDraft(buildDraft(editItem))
  }, [editItem])

  const set = (field, value) => {
    setDraft((d) => ({ ...d, [field]: value }))
    if (validationError) setValidationError('')
  }

  const handleSave = () => {
    const hanTraditional = draft.hanTraditional.trim()
    const vietnamese = draft.vietnamese.trim()
    if (!hanTraditional || !vietnamese) {
      setValidationError(t.sentenceBank.requiredFields)
      return
    }
    // Check for duplicate sentence pattern (exclude current item when editing)
    if (existingItems) {
      const duplicate = existingItems.find(
        (s) => s.hanTraditional?.trim().toLowerCase() === hanTraditional.toLowerCase()
          && s.vietnamese?.trim().toLowerCase() === vietnamese.toLowerCase()
          && s.id !== editItem?.id
      )
      if (duplicate) {
        setValidationError(t.sentenceBank.duplicatePattern)
        return
      }
    }
    const payload = {
      hanTraditional,
      hanSimplified: isEdit ? (editItem.hanSimplified ?? '').trim() : '',
      jyutping: draft.jyutping.trim(),
      pinyin: isEdit ? (editItem.pinyin ?? '').trim() : '',
      vietnamese,
      english: draft.english.trim(),
    }
    if (isEdit) {
      onSave(editItem.id, payload)
    } else {
      onSave(emptySentencePattern(payload))
    }
    onClose()
  }

  const handleFormKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.target.tagName === 'TEXTAREA') {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        handleSave()
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    }
  }

  return (
    <div className={backdropClass} onClick={onClose} role="presentation">
      <div className={modalClass} onClick={(e) => e.stopPropagation()} role="dialog">
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <h2>{isEdit ? t.common.edit : t.sentenceBank.addTitle}</h2>
          <button type="button" className={uiModalCloseButtonClass} onClick={onClose} aria-label={t.common.close}>
            ×
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6" onKeyDown={handleFormKeyDown}>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-text-h">
            {t.wordDetail.hanTraditional} *
            <textarea
              className={hanFieldClass}
              rows={1}
              value={draft.hanTraditional}
              onChange={(e) => set('hanTraditional', e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-text-h">
            {t.sentenceBank.colJyutping}
            <input className={jyutpingFieldClass} value={draft.jyutping} onChange={(e) => set('jyutping', e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-text-h">
            {t.sentenceBank.colVietnamese} *
            <textarea
              className={vietFieldClass}
              rows={1}
              value={draft.vietnamese}
              onChange={(e) => set('vietnamese', e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-text-h">
            {t.sentenceBank.colEnglish}
            <input className={englishFieldClass} value={draft.english} onChange={(e) => set('english', e.target.value)} />
          </label>
          {validationError && (
            <p className="m-0 rounded-lg border border-error-border bg-error-bg px-4 py-3 text-sm text-error-text" role="alert">
              {validationError}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 px-6 py-4">
          <button type="button" className={btnClass('ghost')} onClick={onClose}>
            {t.common.cancel}
          </button>
          <button type="button" className={btnClass('primary')} onClick={handleSave}>
            {isEdit ? t.common.save : t.sentenceBank.addBtn}
          </button>
        </div>
      </div>
    </div>
  )
}
