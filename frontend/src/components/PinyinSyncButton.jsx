import { useCallback, useState } from 'react'
import { LoadingButton } from './LoadingButton.jsx'
import { useLocale } from '../store/localeStore.js'
import { useAppActions, useAppStore, useWordCount } from '../store/appStore.js'
import { formatPinyin, previewPinyinSync } from '../lib/pinyinSync.js'
import { hanPopularityClass } from '../lib/wordPopularity.js'
import { cn } from '../lib/cn.js'
import { btnClass } from './ui/buttonStyles.js'
import { uiModalCloseButtonClass } from './ui/controlStyles.js'

export function PinyinSyncButton() {
  const { t, fmt } = useLocale()
  const wordCount = useWordCount()
  const { ensureAllWordsLoaded, syncPinyinAll } = useAppActions()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [preview, setPreview] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const resetModal = () => {
    setOpen(false)
    setPreview(null)
    setResult(null)
    setError('')
    setRunning(false)
  }

  const close = () => {
    if (running) return
    resetModal()
  }

  const loadPreview = useCallback(async () => {
    setLoading(true)
    setError('')
    setResult(null)
    try {
      await ensureAllWordsLoaded()
      const words = useAppStore.getState().words
      setPreview(previewPinyinSync(words))
      setOpen(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setOpen(true)
    } finally {
      setLoading(false)
    }
  }, [ensureAllWordsLoaded])

  const runSync = useCallback(async () => {
    if (!preview?.updates?.length) return
    setRunning(true)
    setError('')
    try {
      const applied = await syncPinyinAll()
      setResult(applied)
      setPreview(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
    }
  }, [preview, syncPinyinAll])

  const disabled = wordCount === 0

  return (
    <>
      <LoadingButton
        type="button"
        className={btnClass('ghost')}
        disabled={disabled}
        loading={loading}
        loadingText={t.pinyinSync.loadingPreview}
        onClick={loadPreview}
      >
        {t.pinyinSync.btn}
      </LoadingButton>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={close} role="presentation">
          <div
            className="w-full max-w-md rounded-2xl bg-surface shadow-[0_20px_40px_rgba(0,0,0,0.15)] dark:shadow-[0_20px_40px_rgba(0,0,0,0.45)]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
          >
            <div className="flex items-center justify-between border-b border-border px-6 py-5">
              <h2>{t.pinyinSync.title}</h2>
              <button
                type="button"
                className={uiModalCloseButtonClass}
                onClick={close}
                aria-label={t.common.close}
              >
                ×
              </button>
            </div>
            <div className="flex flex-col gap-4 px-6 py-6">
              <p className="text-sm text-text-muted">{t.pinyinSync.description}</p>

              {error && (
                <p className="rounded-lg border border-error-border bg-error-bg px-4 py-3 text-sm text-error-text" role="alert">
                  {error}
                </p>
              )}

              {result && (
                <p className="m-0 text-sm font-semibold text-success-text" role="status">
                  {fmt(t.pinyinSync.done, { count: result.updated })}
                </p>
              )}

              {preview && (
                <>
                  <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[0.9375rem]">
                    <li>{fmt(t.pinyinSync.wordsToUpdate, { count: preview.updates.length })}</li>
                  </ul>
                  {preview.updates.length > 0 && (
                    <div className="mt-3">
                      <p className="m-0 mb-2 text-[0.8125rem] font-semibold uppercase tracking-wide text-text-muted">
                        {running ? t.pinyinSync.syncingListTitle : t.pinyinSync.previewListTitle}
                      </p>
                      <ul className="m-0 flex max-h-48 list-none flex-col gap-1.5 overflow-y-auto rounded-lg border border-border bg-bg p-2">
                        {preview.updates.map((update) => (
                          <li
                            key={update.id}
                            className={cn(
                              'flex flex-col gap-1 rounded-md px-2 py-1.5 text-sm',
                              running && 'opacity-55',
                            )}
                          >
                            <span className={cn('font-semibold text-han', hanPopularityClass(update.popularity))}>
                              {update.hanTraditional}
                              {update.hanSimplified && update.hanSimplified !== update.hanTraditional && (
                                <span className="ml-2 text-[0.8125rem] font-medium text-text-muted">
                                  {update.hanSimplified}
                                </span>
                              )}
                            </span>
                            <span className="text-[0.8125rem] text-text-muted tabular-nums">
                              {formatPinyin(update.prevPinyin)}
                              <span className="mx-1 opacity-60" aria-hidden="true">
                                →
                              </span>
                              {formatPinyin(update.nextPinyin)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}

              {preview && preview.updates.length === 0 && (
                <p className="text-sm text-text-muted">{t.pinyinSync.noChanges}</p>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border px-6 py-4">
              {!result && (
                <button type="button" className={btnClass('ghost')} onClick={close} disabled={running}>
                  {preview?.updates?.length > 0 ? t.common.cancel : t.common.close}
                </button>
              )}
              {preview && preview.updates.length > 0 && !result && (
                <LoadingButton
                  type="button"
                  className={btnClass('primary')}
                  loading={running}
                  loadingText={t.pinyinSync.running}
                  onClick={runSync}
                  disabled={running}
                >
                  {t.pinyinSync.runBtn}
                </LoadingButton>
              )}
              {result && (
                <button type="button" className={btnClass('primary')} onClick={close}>
                  {t.common.close}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
