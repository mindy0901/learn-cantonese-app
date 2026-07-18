import { useEffect, useState } from 'react'
import { cn } from '../lib/cn.js'
import { btnClass } from './ui/buttonStyles.js'
import { uiModalCloseButtonClass } from './ui/controlStyles.js'
import { useLocale } from '../store/localeStore.js'
import { emptyWord } from '../types/word.js'
import { buildWordDraft, wordDraftPayload, WordEditFields } from './WordEditFields.jsx'

const backdropClass =
  'fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto overscroll-contain bg-black/40 px-4 py-[max(1.25rem,env(safe-area-inset-top,0px))] pb-[max(1.25rem,env(safe-area-inset-bottom,0px))]'

const modalClass =
  'm-auto flex w-full max-w-[520px] shrink-0 flex-col overflow-hidden rounded-2xl bg-surface shadow-[0_20px_40px_rgba(0,0,0,0.15)] max-h-[min(calc(100vh-2.5rem),calc(100dvh-2.5rem))]'

export function AddWordModal({ onSave, onClose, word: editWord, initialHanTraditional }) {
  const { t } = useLocale()
  const isEdit = Boolean(editWord?.id)
  const [draft, setDraft] = useState(() => {
    if (editWord) return buildWordDraft(editWord)
    return emptyWord({ hanTraditional: initialHanTraditional ?? '' })
  })
  const [validationError, setValidationError] = useState('')

  useEffect(() => {
    if (editWord?.id) setDraft(buildWordDraft(editWord))
  }, [editWord])

  const handleSave = () => {
    if (!draft.hanTraditional.trim() || !(draft.jyutping ?? '').trim()) {
      setValidationError(t.addWord.requiredFields)
      return
    }
    const payload = wordDraftPayload(draft)
    if (isEdit) {
      onSave(editWord, payload)
    } else {
      onSave({
        ...draft,
        ...payload,
      })
    }
    onClose()
  }

  return (
    <div className={backdropClass} onClick={onClose} role="presentation">
      <div className={modalClass} onClick={(e) => e.stopPropagation()} role="dialog">
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <h2>{isEdit ? t.common.edit : t.addWord.title}</h2>
          <button
            type="button"
            className={uiModalCloseButtonClass}
            onClick={onClose}
            aria-label={t.common.close}
          >
            ×
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
          <WordEditFields
            draft={draft}
            onChange={(next) => {
              setDraft(next)
              if (validationError) setValidationError('')
            }}
            validationError={validationError}
            showDetail={isEdit}
          />
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 px-6 py-4">
          <button type="button" className={btnClass('ghost')} onClick={onClose}>
            {t.common.cancel}
          </button>
          <button type="button" className={btnClass('primary')} onClick={handleSave}>
            {isEdit ? t.common.save : t.addWord.submit}
          </button>
        </div>
      </div>
    </div>
  )
}
