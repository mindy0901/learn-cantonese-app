import { useEffect, useState } from 'react'
import { btnClass } from './ui/buttonStyles.js'
import { uiInputClass, uiModalCloseButtonClass } from './ui/controlStyles.js'
import { useLocale } from '../store/localeStore.js'
import { emptyGrammarBankItem } from '../types/word.js'

const backdropClass =
  'fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto overscroll-contain bg-black/40 px-4 py-[max(1.25rem,env(safe-area-inset-top,0px))] pb-[max(1.25rem,env(safe-area-inset-bottom,0px))]'

const modalClass =
  'm-auto flex w-full max-w-[520px] shrink-0 flex-col overflow-hidden rounded-2xl bg-surface shadow-[0_20px_40px_rgba(0,0,0,0.15)] max-h-[min(calc(100vh-2.5rem),calc(100dvh-2.5rem))]'


function buildDraft(item) {
  if (!item?.id) return { title: '', content: '' }
  return {
    title: item.title ?? '',
    content: item.content ?? '',
  }
}

export function AddGrammarModal({ onSave, onClose, item: editItem, existingItems }) {
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
    const title = draft.title.trim()
    const content = draft.content.trim()
    if (!title || !content) {
      setValidationError(t.grammarBank.requiredFields)
      return
    }
    // Check for duplicate title (exclude current item when editing)
    if (existingItems) {
      const duplicate = existingItems.find(
        (g) => g.title?.trim().toLowerCase() === title.toLowerCase() && g.id !== editItem?.id
      )
      if (duplicate) {
        setValidationError(t.grammarBank.duplicateTitle)
        return
      }
    }
    const payload = { title, content }
    if (isEdit) {
      onSave(editItem.id, payload)
    } else {
      onSave(emptyGrammarBankItem(payload))
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
          <h2>{isEdit ? t.common.edit : t.grammarBank.addTitle}</h2>
          <button
            type="button"
            className={uiModalCloseButtonClass}
            onClick={onClose}
            aria-label={t.common.close}
          >
            ×
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6" onKeyDown={handleFormKeyDown}>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-text-h">
            {t.grammarBank.colTitle} *
            <input className={uiInputClass} value={draft.title} onChange={(e) => set('title', e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-text-h">
            {t.grammarBank.colContent} *
            <textarea
              className="min-h-[4.5rem] w-full resize-none overflow-hidden rounded-lg border border-border bg-surface px-3.5 py-2.5 font-inherit text-[0.9375rem] text-text-h outline-none focus:border-accent-border [field-sizing:content]"
              rows={5}
              value={draft.content}
              onChange={(e) => set('content', e.target.value)}
            />
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
            {isEdit ? t.common.save : t.grammarBank.addBtn}
          </button>
        </div>
      </div>
    </div>
  )
}
