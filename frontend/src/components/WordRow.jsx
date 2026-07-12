import { memo, useState } from 'react'
import { useLocale } from '../store/localeStore.js'
import { wordFieldSummary } from '../lib/wordDisplay.js'
import { orderedHanVariants, displayRomanization } from '../lib/hanScriptDisplay.js'
import { wordLookupDisplay } from '../lib/hanLookup.js'
import { HanziiHanCellLink } from './HanziiHanCellLink.jsx'
import { WordFieldText } from './WordFieldText.jsx'
import { hanTextClassName } from '../lib/wordPopularity.js'
import { normalizeWordFields, wordContentEqual } from '../lib/wordNormalize.js'
import { cn } from '../lib/cn.js'
import { uiCompactIconButtonClass } from './ui/controlStyles.js'

const tdClass =
  'px-3.5 py-2.5 text-left align-middle break-words min-w-0'

const rowClass = 'border-b border-border'

const cellInputClass =
  'w-full min-w-20 px-2 py-1.5 border border-accent-border rounded-md bg-surface text-sm outline-none focus:border-accent'

export const WordRow = memo(function WordRow({
  word,
  index,
  canEdit,
  canMark,
  pickerMode,
  selected,
  onToggleSelect,
  onSave,
  onDelete,
  onToggleImportant,
  onToggleMastered,
  onView,
}) {
  const { t } = useLocale()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(word)

  const startEdit = (e) => {
    e.stopPropagation()
    setDraft({
      ...word,
      english: (word.english ?? '').trim() || wordFieldSummary(word, 'english'),
      vietnamese: (word.vietnamese ?? '').trim() || wordFieldSummary(word, 'vietnamese'),
    })
    setEditing(true)
  }

  const cancelEdit = (e) => {
    e.stopPropagation()
    setDraft(word)
    setEditing(false)
  }

  const saveEdit = (e) => {
    e.stopPropagation()
    if (!draft.hanTraditional.trim() || !(draft.jyutping ?? '').trim()) return
    const patch = {
      english: draft.english.trim(),
      hanTraditional: draft.hanTraditional.trim(),
      vietnamese: draft.vietnamese.trim(),
      hanViet: draft.hanViet?.trim() || undefined,
      jyutping: draft.jyutping.trim(),
      cantonese: draft.cantonese?.trim() || undefined,
    }
    if (wordContentEqual(word, normalizeWordFields({ ...word, ...patch }))) {
      setEditing(false)
      return
    }
    onSave(word, patch)
    setEditing(false)
  }

  const set = (field, value) => {
    setDraft((d) => ({ ...d, [field]: value }))
  }

  const stop = (e) => e.stopPropagation()

  const handleEditKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      cancelEdit(e)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      saveEdit(e)
    }
  }

  const numClass = cn(
    'text-text-muted text-[0.8125rem] whitespace-nowrap text-center px-1.5',
    !pickerMode && 'pr-0.5',
  )

  const flagColClass = 'px-0.5 py-1.5 text-center align-middle [&:nth-child(2)]:pl-0 [&:nth-child(2)]:pr-1'
  const actionsColClass = 'px-0.5 py-1.5 text-center align-middle whitespace-nowrap'

  if (editing && canEdit) {
    return (
      <tr className="bg-accent-bg border-b border-border" onClick={stop} onKeyDown={handleEditKeyDown}>
        <td className={numClass}>{index + 1}</td>
        {canMark && <td className={flagColClass} />}
        <td className={tdClass}>
          <input
            className={cellInputClass}
            value={draft.hanViet ?? ''}
            onChange={(e) => set('hanViet', e.target.value)}
            placeholder={t.wordBank.hanVietAltHint}
            title={t.wordBank.hanVietAltHint}
          />
        </td>
        <td className={tdClass}>
          <input className={cn(cellInputClass, 'text-red-600')} value={draft.hanTraditional} onChange={(e) => set('hanTraditional', e.target.value)} />
        </td>
        <td className={tdClass}>
          <input className={cn(cellInputClass, 'text-jyutping font-semibold')} value={draft.jyutping ?? ''} onChange={(e) => set('jyutping', e.target.value)} />
        </td>
        <td className={tdClass}>
          <input className={cn(cellInputClass, 'text-green-600')} value={draft.vietnamese} onChange={(e) => set('vietnamese', e.target.value)} />
        </td>
        <td className={tdClass}>
          <input className={cellInputClass} value={draft.english} onChange={(e) => set('english', e.target.value)} />
        </td>
        {canMark && <td className={flagColClass} />}
        {canEdit && (
          <td className={actionsColClass}>
            <span className="inline-flex items-center justify-center gap-1.5 align-middle">
              <button type="button" className={cn(uiCompactIconButtonClass, 'min-w-6 min-h-6 px-1.5 py-1 text-[0.9375rem] text-green-600 rounded hover:bg-bg')} onClick={saveEdit} title={t.common.save}>✓</button>
              <button type="button" className={cn(uiCompactIconButtonClass, 'min-w-6 min-h-6 px-1.5 py-1 text-[0.9375rem] text-text-muted rounded hover:bg-bg')} onClick={cancelEdit} title={t.common.cancel}>×</button>
            </span>
          </td>
        )}
      </tr>
    )
  }

  const handleRowClick = () => {
    if (pickerMode) onToggleSelect?.(String(word.id))
    else onView?.(word)
  }

  const hanDisplay = wordLookupDisplay(word)
  const hanOrdered = orderedHanVariants({
    traditional: hanDisplay.traditional,
    simplified: hanDisplay.simplified,
  })
  const hanLookup = hanDisplay.traditional || hanDisplay.simplified
  const romanization = displayRomanization(word)
  const romanClass =
    'text-jyutping font-semibold not-italic text-[calc(0.9375rem*var(--jyutping-scale))] leading-snug tracking-wide whitespace-pre-line'

  return (
    <tr
      data-word-id={String(word.id)}
      className={cn(
        rowClass,
        pickerMode ? 'cursor-pointer hover:bg-bg' : 'cursor-pointer hover:bg-accent-bg',
        pickerMode && selected && 'bg-accent-bg hover:bg-accent-bg',
        word.important && 'bg-orange-600/[0.04]',
        word.mastered && 'opacity-75',
      )}
      onClick={handleRowClick}
      title={pickerMode ? undefined : t.wordBank.clickToView}
    >
      {pickerMode ? (
        <td className="text-center align-middle">
          <input
            type="checkbox"
            className="m-0 cursor-pointer"
            checked={!!selected}
            readOnly
            tabIndex={-1}
            aria-hidden="true"
          />
        </td>
      ) : (
        <td className={numClass}>{index + 1}</td>
      )}
      {canMark && (
        <td className={flagColClass} onClick={stop}>
          <button
            type="button"
            className={cn(
              uiCompactIconButtonClass,
              'size-6 text-lg',
              word.important ? 'text-yellow-500' : 'text-border',
            )}
            onClick={(e) => {
              e.stopPropagation()
              onToggleImportant(word)
            }}
            title={word.important ? t.wordBank.unmarkImportant : t.wordBank.markImportant}
            aria-label={word.important ? t.wordBank.unmarkImportant : t.wordBank.markImportant}
          >
            ★
          </button>
        </td>
      )}
      <td className={tdClass}>
        <WordFieldText word={word} field="hanViet" updatingLabel={t.wordBank.fieldUpdating} />
      </td>
      <td className={cn(tdClass, hanTextClassName(word.popularity))} onClick={pickerMode ? undefined : stop}>
        {pickerMode ? (
          hanOrdered.primary || '—'
        ) : (
          <HanziiHanCellLink
            hanTraditional={hanLookup}
            displayText={hanOrdered.primary}
            popularity={word.popularity}
            emphasis="primary"
          />
        )}
      </td>
      <td className={cn(tdClass, romanClass)}>
        {romanization || '—'}
      </td>
      <td className={cn(tdClass, 'text-viet')}>
        <WordFieldText word={word} field="vietnamese" updatingLabel={t.wordBank.fieldUpdating} />
      </td>
      <td className={cn(tdClass, 'leading-snug break-words')}>
        <WordFieldText word={word} field="english" updatingLabel={t.wordBank.fieldUpdating} />
      </td>
      {canMark && (
        <td className={flagColClass} onClick={stop}>
          <button
            type="button"
            className={cn(
              uiCompactIconButtonClass,
              'min-w-5 min-h-5 border border-border rounded-md text-xs px-0.5',
              word.mastered
                ? 'text-success-text border-success-border bg-success-bg'
                : 'text-text-muted',
            )}
            onClick={(e) => {
              e.stopPropagation()
              onToggleMastered(word)
            }}
            title={word.mastered ? t.wordDetail.unmarkMastered : t.wordDetail.markMastered}
            aria-label={word.mastered ? t.wordDetail.unmarkMastered : t.wordDetail.markMastered}
          >
            ✓
          </button>
        </td>
      )}
      {canEdit && (
        <td className={actionsColClass} onClick={stop}>
          <span className="inline-flex items-center justify-center gap-1.5 align-middle">
            <button type="button" className={cn(uiCompactIconButtonClass, 'min-w-6 min-h-6 px-1.5 py-1 text-sm text-text-muted rounded hover:bg-bg hover:text-text-h')} onClick={startEdit} title={t.common.edit}>✎</button>
            <button type="button" className={cn(uiCompactIconButtonClass, 'min-w-6 min-h-6 px-1.5 py-1 text-sm text-text-muted rounded hover:bg-bg hover:text-red-600')} onClick={() => onDelete(word)} title={t.common.delete}>🗑</button>
          </span>
        </td>
      )}
    </tr>
  )
})
