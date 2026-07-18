import { useMemo, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useHanCharacters, useWords, useAppActions } from '../store/appStore.js'
import { useIsAdmin } from '../store/authStore.js'
import { useLocale } from '../store/localeStore.js'
import { wordDetailPath } from '../lib/wordRoutes.js'
import { HanziiHanCellLink } from '../components/HanziiHanCellLink.jsx'
import { TagInput } from '../components/TagInput.jsx'
import { uiInputClass } from '../components/ui/controlStyles.js'

function buildHanDraft(item) {
  return {
    hanSimplified: item.hanSimplified ?? '',
    hanTraditional: item.hanTraditional ?? '',
    hanViet: Array.isArray(item.hanViet) ? item.hanViet.join(', ') : (item.hanViet ?? ''),
    jyutping: Array.isArray(item.jyutping) ? item.jyutping.join(', ') : (item.jyutping ?? ''),
    pinyin: Array.isArray(item.pinyin) ? item.pinyin.join(', ') : (item.pinyin ?? ''),
    popularity: item.popularity ?? 0,
  }
}

function parseArrayField(val) {
  if (Array.isArray(val)) return val
  if (!val || !String(val).trim()) return []
  return String(val).split(/[,，/、]+/).map((s) => s.trim()).filter(Boolean)
}

function hanDraftPayload(draft) {
  return {
    hanSimplified: draft.hanSimplified?.trim() || undefined,
    hanTraditional: draft.hanTraditional?.trim() || undefined,
    hanViet: parseArrayField(draft.hanViet),
    jyutping: parseArrayField(draft.jyutping),
    pinyin: parseArrayField(draft.pinyin),
    popularity: Number(draft.popularity) || 0,
  }
}

export function HanCharacterDetailPage() {
  const { id } = useParams()
  const { t } = useLocale()
  const isAdmin = useIsAdmin()
  const { editHanCharacter } = useAppActions()
  const hanCharacters = useHanCharacters()
  const words = useWords()

  const item = useMemo(() => hanCharacters.find((h) => h.id === id), [hanCharacters, id])

  // Edit mode state
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(() => item ? buildHanDraft(item) : null)
  const [saving, setSaving] = useState(false)

  const resetDraft = useCallback(() => {
    if (item) setDraft(buildHanDraft(item))
  }, [item])

  const startEdit = useCallback(() => {
    resetDraft()
    setEditing(true)
  }, [resetDraft])

  const cancelEdit = useCallback(() => {
    resetDraft()
    setEditing(false)
  }, [resetDraft])

  const saveEdit = useCallback(async () => {
    if (!draft || !item) return
    const payload = hanDraftPayload(draft)
    // Check if anything changed
    const currentHanViet = Array.isArray(item.hanViet) ? item.hanViet.join(', ') : (item.hanViet ?? '')
    const currentJyutping = Array.isArray(item.jyutping) ? item.jyutping.join(', ') : (item.jyutping ?? '')
    const currentPinyin = Array.isArray(item.pinyin) ? item.pinyin.join(', ') : (item.pinyin ?? '')
    const noChange =
      (payload.hanSimplified || '') === (item.hanSimplified ?? '') &&
      (payload.hanTraditional || '') === (item.hanTraditional ?? '') &&
      payload.hanViet.join(', ') === currentHanViet &&
      payload.jyutping.join(', ') === currentJyutping &&
      payload.pinyin.join(', ') === currentPinyin &&
      payload.popularity === (item.popularity ?? 0)
    if (noChange) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      editHanCharacter(item.id, payload)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }, [draft, item, editHanCharacter])

  const handleKeyDown = useCallback((e) => {
    if (!editing) return
    if (e.key === 'Escape') { e.preventDefault(); cancelEdit() }
    else if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); saveEdit() }
  }, [editing, cancelEdit, saveEdit])

  // Sync draft when item changes externally
  useMemo(() => {
    if (item && !editing) setDraft(buildHanDraft(item))
  }, [item, editing])

  // Find words containing this character
  const charWords = useMemo(() => {
    if (!item) return []
    const ch = (item.hanSimplified ?? item.character ?? '').trim()
    const tradCh = (item.hanTraditional ?? '').trim()
    if (!ch && !tradCh) return []
    return words.filter((w) => {
      const ht = w.hanTraditional ?? ''
      const hs = w.hanSimplified ?? ''
      return (ch && ht.includes(ch)) || (ch && hs.includes(ch)) || (tradCh && ht.includes(tradCh)) || (tradCh && hs.includes(tradCh))
    })
  }, [words, item])

  if (!item) {
    return (
      <main className="flex-1 max-w-[1800px] w-full mx-auto px-5 py-8 pb-12">
        <div className="text-center py-12 px-6 text-text-muted flex flex-col items-center gap-4">
          <p>{t.hanCharacters?.notFound ?? 'Không tìm thấy hán tự.'}</p>
          <Link to="/han-characters" className="text-accent underline">
            {t.hanCharacters?.backToList ?? 'Quay lại kho hán tự'}
          </Link>
        </div>
      </main>
    )
  }

  const char = item.hanSimplified ?? item.character ?? ''
  const trad = item.hanTraditional
  const showTrad = trad && trad !== char

  /** Render han text with the target character(s) highlighted */
  const highlightChar = (text) => {
    if (!text) return '—'
    const targets = new Set([char, trad].filter(Boolean))
    return [...text].map((c, i) => {
      if (targets.has(c)) {
        return (
          <span key={i} className="text-red-600 dark:text-red-400 font-bold">
            {c}
          </span>
        )
      }
      return <span key={i}>{c}</span>
    })
  }
  const jyutping = Array.isArray(item.jyutping) ? item.jyutping : (item.jyutping ? [item.jyutping] : [])
  const pinyin = Array.isArray(item.pinyin) ? item.pinyin : (item.pinyin ? [item.pinyin] : [])
  const hanViet = Array.isArray(item.hanViet) ? item.hanViet : (item.hanViet ? [item.hanViet] : [])

  const labelClass = 'text-xs font-semibold uppercase tracking-wide text-text-muted'
  const inputClass = `${uiInputClass} w-full`

  return (
    <main className="han-detail-page flex-1 max-w-[1800px] w-full mx-auto px-5 py-8 pb-12" onKeyDown={handleKeyDown}>
      <div className="flex flex-col items-stretch gap-8">
        {/* Character display */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-4">
            <HanziiHanCellLink
              hanTraditional={trad || char}
              displayText={char}
              popularity={item.popularity}
              emphasis="primary"
              className="text-6xl sm:text-7xl"
            />
            {showTrad && (
              <>
                <span className="text-2xl text-text-muted">/</span>
                <HanziiHanCellLink
                  hanTraditional={trad}
                  displayText={trad}
                  popularity={item.popularity}
                  emphasis="primary"
                  className="text-6xl sm:text-7xl"
                />
              </>
            )}
          </div>
        </div>

        {/* Readings table */}
        <div className="relative w-full rounded-xl border border-border/80 bg-surface/80 p-6">
          {isAdmin && (
            <div className="absolute top-3 right-3 flex items-center gap-2">
              {editing ? (
                <>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="px-3 py-1.5 rounded-md border border-border text-sm font-medium text-text-h bg-surface hover:bg-bg transition-colors"
                  >
                    {t.common?.cancel ?? 'Huỷ'}
                  </button>
                  <button
                    type="button"
                    onClick={saveEdit}
                    disabled={saving}
                    className="px-3 py-1.5 rounded-md text-sm font-medium text-white bg-accent hover:bg-accent-hover disabled:opacity-50 transition-colors"
                  >
                    {saving ? (t.common?.saving ?? 'Đang lưu...') : (t.common?.save ?? 'Lưu')}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={startEdit}
                  className="px-3 py-1.5 rounded-md border border-border text-sm font-medium text-text-h bg-surface hover:bg-bg transition-colors"
                >
                  {t.common?.edit ?? 'Sửa'}
                </button>
              )}
            </div>
          )}
          {editing ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label className={labelClass}>{t.wordBank.colHanSimplified ?? 'Giản thể'}</label>
                <input className={`${inputClass} font-semibold text-han text-lg`} value={draft?.hanSimplified ?? ''} onChange={(e) => setDraft((d) => ({ ...d, hanSimplified: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>{t.hanLookup?.traditionalHk ?? 'Phồn thể HK'}</label>
                <input className={`${inputClass} text-red-600 dark:text-red-400 text-lg`} value={draft?.hanTraditional ?? ''} onChange={(e) => setDraft((d) => ({ ...d, hanTraditional: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>{t.wordBank.colHanViet}</label>
                <TagInput value={draft?.hanViet ?? ''} onChange={(v) => setDraft((d) => ({ ...d, hanViet: v }))} placeholder="âm1, âm2" />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>{t.wordBank.colJyutping}</label>
                <TagInput value={draft?.jyutping ?? ''} onChange={(v) => setDraft((d) => ({ ...d, jyutping: v }))} className="text-jyutping" placeholder="reading1, reading2" />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>{t.wordBank.colPinyin}</label>
                <TagInput value={draft?.pinyin ?? ''} onChange={(v) => setDraft((d) => ({ ...d, pinyin: v }))} className="text-jyutping" placeholder="reading1, reading2" />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>{t.wordBank.colPopularity ?? 'Phổ biến'}</label>
                <input className={`${inputClass} text-lg`} type="number" min="0" max="3" value={draft?.popularity ?? 0} onChange={(e) => setDraft((d) => ({ ...d, popularity: Number(e.target.value) }))} />
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {hanViet.length > 0 && (
                <div className="flex flex-col gap-1">
                  <p className={labelClass}>{t.wordBank.colHanViet}</p>
                  <p className="text-lg font-medium text-text-h">{hanViet.join(' / ')}</p>
                </div>
              )}
              {jyutping.length > 0 && (
                <div className="flex flex-col gap-1">
                  <p className={labelClass}>{t.wordBank.colJyutping}</p>
                  <p className="text-lg font-semibold text-jyutping">{jyutping.join(' / ')}</p>
                </div>
              )}
              {pinyin.length > 0 && (
                <div className="flex flex-col gap-1">
                  <p className={labelClass}>{t.wordBank.colPinyin}</p>
                  <p className="text-lg font-semibold text-jyutping">{pinyin.join(' / ')}</p>
                </div>
              )}
              {item.popularity != null && item.popularity > 0 && (
                <div className="flex flex-col gap-1">
                  <p className={labelClass}>{t.wordBank.colPopularity ?? 'Popularity'}</p>
                  <p className="text-lg text-text-h">{item.popularity}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Words containing this character */}
        {charWords.length > 0 && (
          <div className="w-full rounded-xl border border-border/80 bg-surface/80 p-6">
            <div className="flex flex-col divide-y divide-border/60">
              {/* Column headers */}
              <div className="grid grid-cols-[1fr_1.5fr_1.5fr_1fr] items-center gap-3 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                <span>{t.wordBank.colHanTraditional}</span>
                <span>{t.wordBank.colJyutping}</span>
                <span>{t.wordBank.colVietnamese}</span>
                <span>{t.wordBank.colEnglish}</span>
              </div>
              {charWords.map((w) => (
                <Link
                  key={w.id}
                  to={wordDetailPath(w.id)}
                  className="grid grid-cols-[1fr_1.5fr_1.5fr_1fr] items-center gap-3 px-3 py-3 text-sm no-underline rounded hover:bg-bg/60"
                >
                  <span className="font-semibold text-han text-2xl truncate">{highlightChar(w.hanTraditional || w.hanSimplified)}</span>
                  <span className="text-jyutping font-medium text-sm truncate">{w.jyutping || ''}</span>
                  <span className="text-text-h text-sm truncate">{w.vietnamese || '—'}</span>
                  <span className="text-text-h text-sm truncate">{w.english || '—'}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Back link */}
        <div className="flex items-center">
          <Link
            to="/han-characters"
            className="text-sm text-text-muted hover:text-accent transition-colors"
          >
            ← {t.hanCharacters?.backToList ?? 'Quay lại kho hán tự'}
          </Link>
        </div>
      </div>
    </main>
  )
}
