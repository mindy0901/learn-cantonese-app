import { useCallback, useState } from 'react'
import { LoadingButton } from './LoadingButton.jsx'
import { useLocale } from '../store/localeStore.js'
import { useWords, useGrammarBank, useLessons, useAppStore } from '../store/appStore.js'
import { previewSheetMerge, pullAndMergeFromSheet, resolveSheetError } from '../lib/sheetUpdate.js'
import { getSheetUrlForType, saveSheetUrls } from '../lib/syncConfig.js'
import { btnClass } from './ui/buttonStyles.js'
import { uiInputClass, uiModalCloseButtonClass } from './ui/controlStyles.js'

const URL_KEYS = {
  words: 'wordsSheetUrl',
  grammar: 'grammarSheetUrl',
  lessons: 'lessonsSheetUrl',
}

function ErrorBox({ message, title }) {
  return (
    <div className="mt-4 px-3.5 py-3.5 border border-red-600 rounded-lg bg-red-600/8" role="alert">
      <p className="m-0 mb-1.5 font-semibold text-red-400 text-sm">{title}</p>
      <p className="m-0 text-text text-sm leading-snug">{message}</p>
    </div>
  )
}

function hasSheetChanges(preview) {
  return preview.added > 0 || preview.updated > 0
}

function PreviewSummary({ preview, t, fmt, typeCopy }) {
  return (
    <div className="mt-4 px-3.5 py-3.5 border border-success-border rounded-lg bg-success-bg" role="status">
      <p className="m-0 mb-2 font-semibold text-success-text text-sm">{t.sheetUpdate.checkValid}</p>
      <ul className="list-none m-0 p-0 flex flex-col gap-2 text-[0.9375rem]">
        <li>{fmt(t.sheetUpdate.totalRows, { count: preview.totalRows })}</li>
        <li>{fmt(t.sheetUpdate.validRows, { count: preview.validRows })}</li>
        {preview.emptyRows > 0 && (
          <li className="text-text-muted">{fmt(t.sheetUpdate.emptyRows, { count: preview.emptyRows })}</li>
        )}
        {preview.invalidRows > 0 && (
          <li className="text-text-muted">{fmt(typeCopy.invalidRows, { count: preview.invalidRows })}</li>
        )}
        {preview.sheetDuplicates > 0 && (
          <li className="text-text-muted">
            {fmt(t.sheetUpdate.sheetDuplicates, { count: preview.sheetDuplicates })}
          </li>
        )}
        <li>{fmt(t.sheetUpdate.added, { count: preview.added })}</li>
        <li>{fmt(t.sheetUpdate.existingUnchanged, { count: preview.skipped })}</li>
        {preview.updated > 0 && (
          <li>{fmt(t.sheetUpdate.existingUpdated, { count: preview.updated })}</li>
        )}
        <li>
          {fmt(t.sheetUpdate.totalChange, {
            before: preview.totalBefore,
            after: preview.totalAfter,
          })}
        </li>
      </ul>
    </div>
  )
}

export function SheetUpdateButton({ type }) {
  const { t, fmt } = useLocale()
  const typeCopy = t.sheetUpdate.types[type]
  const words = useWords()
  const grammarBank = useGrammarBank()
  const lessons = useLessons()
  const hydrateFromCloud = useAppStore((s) => s.hydrateFromCloud)

  const [updating, setUpdating] = useState(false)
  const [checking, setChecking] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const [resultOpen, setResultOpen] = useState(false)
  const [sheetUrl, setSheetUrl] = useState(() => getSheetUrlForType(type))
  const [error, setError] = useState(null)
  const [preview, setPreview] = useState(null)
  const [previewItems, setPreviewItems] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [result, setResult] = useState(null)
  const [urlSaved, setUrlSaved] = useState(false)

  const busy = updating || checking

  const openConfig = useCallback((url) => {
    setSheetUrl(url ?? getSheetUrlForType(type))
    setError(null)
    setPreview(null)
    setPreviewItems(null)
    setPreviewUrl('')
    setUrlSaved(false)
    setConfigOpen(true)
  }, [type])

  const formatError = useCallback(
    (err) => resolveSheetError(err, t),
    [t],
  )

  const runCheck = useCallback(async () => {
    const trimmed = sheetUrl.trim()
    if (!trimmed) {
      setError(t.sheetUpdate.urlRequired)
      setPreview(null)
      return
    }
    setChecking(true)
    setError(null)
    setPreview(null)
    try {
      const previewResult = await previewSheetMerge(type, {
        sheetUrl: trimmed,
        existingWords: words,
        existingGrammar: grammarBank,
        existingLessons: lessons,
      })
      setPreview(previewResult)
      setPreviewItems(previewResult.items ?? null)
      setPreviewUrl(trimmed)
    } catch (err) {
      setPreview(null)
      setPreviewItems(null)
      setPreviewUrl('')
      setError(formatError(err))
    } finally {
      setChecking(false)
    }
  }, [sheetUrl, type, words, grammarBank, lessons, t.sheetUpdate.urlRequired, formatError])

  const runUpdate = useCallback(
    async (url) => {
      setUpdating(true)
      setError(null)
      try {
        const trimmed = url.trim()
        const reuseItems = previewItems && previewUrl === trimmed ? previewItems : undefined
        const mergeResult = await pullAndMergeFromSheet(type, {
          sheetUrl: trimmed,
          existingWords: words,
          items: reuseItems,
        })
        saveSheetUrls({ [URL_KEYS[type]]: trimmed })
        await hydrateFromCloud()
        setResult(mergeResult)
        setConfigOpen(false)
        setPreview(null)
        setPreviewItems(null)
        setPreviewUrl('')
        setResultOpen(true)
      } catch (err) {
        if (err?.code === 'NO_SHEET_URL') {
          openConfig('')
        } else {
          setError(formatError(err))
        }
      } finally {
        setUpdating(false)
      }
    },
    [type, words, previewItems, previewUrl, hydrateFromCloud, openConfig, formatError],
  )

  const handleClick = () => {
    openConfig(getSheetUrlForType(type))
  }

  const handleSaveUrl = () => {
    const trimmed = sheetUrl.trim()
    if (!trimmed) {
      setError(t.sheetUpdate.urlRequired)
      setUrlSaved(false)
      return
    }
    saveSheetUrls({ [URL_KEYS[type]]: trimmed })
    setError(null)
    setUrlSaved(true)
  }

  const handleSaveAndRun = () => {
    const trimmed = sheetUrl.trim()
    if (!trimmed) {
      setError(t.sheetUpdate.urlRequired)
      return
    }
    if (preview?.valid && previewUrl === trimmed && !hasSheetChanges(preview)) return
    runUpdate(trimmed)
  }

  const handleUrlChange = (value) => {
    setSheetUrl(value)
    setPreview(null)
    setPreviewItems(null)
    setPreviewUrl('')
    setError(null)
    setUrlSaved(false)
  }

  return (
    <>
      <LoadingButton
        className={btnClass('outline')}
        loading={updating}
        loadingText={t.sheetUpdate.updating}
        onClick={handleClick}
        title={typeCopy.hint}
      >
        {typeCopy.btn}
      </LoadingButton>

      {configOpen && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-[100]"
          onClick={busy ? undefined : () => setConfigOpen(false)}
          role="presentation"
        >
          <div
            className="bg-surface rounded-2xl w-full max-w-[480px] shadow-[0_20px_40px_rgba(0,0,0,0.15)]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between px-6 py-5 border-b border-border">
              <h2>{typeCopy.configTitle}</h2>
              <button
                type="button"
                className={uiModalCloseButtonClass}
                onClick={() => setConfigOpen(false)}
                disabled={busy}
                aria-label={t.common.close}
              >
                ×
              </button>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <p className="text-sm text-text-muted">{typeCopy.configHint}</p>
              <label className="flex flex-col gap-1.5 mb-3.5">
                <span className="text-[0.8125rem] font-medium text-text-h">{t.sheetUpdate.urlLabel}</span>
                <input
                  className={uiInputClass}
                  type="url"
                  value={sheetUrl}
                  onChange={(e) => handleUrlChange(e.target.value)}
                  placeholder={t.sheetUpdate.urlPlaceholder}
                  disabled={busy}
                />
              </label>

              {preview?.valid && hasSheetChanges(preview) && (
                <PreviewSummary preview={preview} t={t} fmt={fmt} typeCopy={typeCopy} />
              )}

              {preview?.valid && !hasSheetChanges(preview) && (
                <div className="mt-4 px-3.5 py-3.5 border border-success-border rounded-lg bg-success-bg" role="status">
                  <p>{typeCopy.nothingNew}</p>
                </div>
              )}

              {urlSaved && (
                <p className="mt-4 px-3.5 py-3.5 border border-success-border rounded-lg bg-success-bg font-semibold text-success-text text-sm" role="status">
                  {typeCopy.urlSaved}
                </p>
              )}

              {error && <ErrorBox title={t.sheetUpdate.errorTitle} message={error} />}
            </div>
            {preview?.valid && !hasSheetChanges(preview) ? (
              <div className="px-6 py-4 border-t border-border flex justify-end gap-2 shrink-0">
                <button
                  type="button"
                  className={btnClass('outline')}
                  onClick={handleSaveUrl}
                  disabled={busy}
                >
                  {t.sheetUpdate.saveUrlBtn}
                </button>
                <button
                  type="button"
                  className={btnClass('primary')}
                  onClick={() => setConfigOpen(false)}
                >
                  {t.common.close}
                </button>
              </div>
            ) : (
              <div className="px-6 py-4 border-t border-border flex justify-end gap-2 shrink-0 flex-wrap">
                <button
                  type="button"
                  className={btnClass('ghost')}
                  onClick={() => setConfigOpen(false)}
                  disabled={busy}
                >
                  {t.common.cancel}
                </button>
                <button
                  type="button"
                  className={btnClass('outline')}
                  onClick={handleSaveUrl}
                  disabled={busy}
                >
                  {t.sheetUpdate.saveUrlBtn}
                </button>
                <LoadingButton
                  className={btnClass('outline')}
                  loading={checking}
                  loadingText={t.sheetUpdate.checking}
                  onClick={runCheck}
                  disabled={updating}
                  title={t.sheetUpdate.checkHint}
                >
                  {t.sheetUpdate.checkBtn}
                </LoadingButton>
                <LoadingButton
                  className={btnClass('primary')}
                  loading={updating}
                  loadingText={t.sheetUpdate.updating}
                  onClick={handleSaveAndRun}
                  disabled={checking}
                >
                  {t.sheetUpdate.runBtn}
                </LoadingButton>
              </div>
            )}
          </div>
        </div>
      )}

      {resultOpen && result && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-[100]"
          onClick={() => setResultOpen(false)}
          role="presentation"
        >
          <div
            className="bg-surface rounded-2xl w-full max-w-md shadow-[0_20px_40px_rgba(0,0,0,0.15)]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between px-6 py-5 border-b border-border">
              <h2>{typeCopy.resultTitle}</h2>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <ul className="list-none m-0 p-0 flex flex-col gap-2 text-[0.9375rem]">
                <li>{fmt(t.sheetUpdate.added, { count: result.added })}</li>
                <li>{fmt(t.sheetUpdate.existingUnchanged, { count: result.skipped })}</li>
                {result.updated > 0 && (
                  <li>{fmt(t.sheetUpdate.existingUpdated, { count: result.updated })}</li>
                )}
                <li>
                  {fmt(t.sheetUpdate.totalChange, {
                    before: result.totalBefore,
                    after: result.totalAfter,
                  })}
                </li>
              </ul>
            </div>
            <div className="px-6 py-4 border-t border-border flex justify-end shrink-0">
              <button type="button" className={btnClass('primary')} onClick={() => setResultOpen(false)}>
                {t.common.done}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
