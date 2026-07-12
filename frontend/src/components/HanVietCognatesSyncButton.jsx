import { useCallback, useRef, useState } from 'react'
import { LoadingButton } from './LoadingButton.jsx'
import { useLocale } from '../store/localeStore.js'
import { useAppActions, useAppStore, useWordCount } from '../store/appStore.js'
import { previewHanVietCognatesSync } from '../lib/hanVietCognatesSync.js'
import { displayHanViet } from '../lib/hanVietSync.js'
import { hanPopularityClass } from '../lib/wordPopularity.js'
import { cn } from '../lib/cn.js'
import { btnClass } from './ui/buttonStyles.js'
import { uiModalCloseButtonClass } from './ui/controlStyles.js'

export function HanVietCognatesSyncButton() {
  const { t, fmt } = useLocale()
  const wordCount = useWordCount()
  const { ensureAllWordsLoaded, syncHanVietAll } = useAppActions()
  const abortRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [preview, setPreview] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState(null)

  const resetModal = () => {
    setOpen(false)
    setPreview(null)
    setResult(null)
    setError('')
    setProgress(null)
    setRunning(false)
    abortRef.current = null
  }

  const cancelSync = () => {
    abortRef.current?.abort()
    resetModal()
  }

  const close = () => {
    if (running) {
      cancelSync()
      return
    }
    resetModal()
  }

  const loadPreview = useCallback(async () => {
    setLoading(true)
    setError('')
    setResult(null)
    try {
      await ensureAllWordsLoaded()
      const words = useAppStore.getState().words
      setPreview(await previewHanVietCognatesSync(words))
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
    const controller = new AbortController()
    abortRef.current = controller
    setRunning(true)
    setError('')
    setProgress({ done: 0, total: preview.updates.length })
    try {
      const applied = await syncHanVietAll(
        preview.updates.map(({ id, hanTraditional, hanViet, prevHanViet }) => ({
          id,
          hanTraditional,
          hanViet,
          prevHanViet,
        })),
        {
          signal: controller.signal,
          onProgress: setProgress,
        },
      )
      if (controller.signal.aborted) return
      setResult(applied)
      setPreview(null)
      setProgress(null)
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null
      }
      setRunning(false)
    }
  }, [preview, syncHanVietAll])

  const disabled = wordCount === 0
  const progressPct =
    progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  const formatHanVietChange = (value) => {
    const text = String(value ?? '').trim()
    return text ? displayHanViet(text) : '—'
  }

  return (
    <>
      <LoadingButton
        type="button"
        className={btnClass('ghost')}
        disabled={disabled}
        loading={loading}
        loadingText={t.hanVietCognatesSync.loadingPreview}
        onClick={loadPreview}
      >
        {t.hanVietCognatesSync.btn}
      </LoadingButton>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
          onClick={close}
          role="presentation"
        >
          <div
            className="w-full max-w-md rounded-2xl bg-surface shadow-[0_20px_40px_rgba(0,0,0,0.15)] dark:shadow-[0_20px_40px_rgba(0,0,0,0.45)]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
          >
            <div className="flex items-center justify-between border-b border-border px-6 py-5">
              <h2>{t.hanVietCognatesSync.title}</h2>
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
              <p className="text-sm text-text-muted">{t.hanVietCognatesSync.description}</p>
              <p className="text-sm text-text-muted">{t.hanVietCognatesSync.sourceNote}</p>

              {error && (
                <p
                  className="rounded-lg border border-error-border bg-error-bg px-4 py-3 text-sm text-error-text"
                  role="alert"
                >
                  {error}
                </p>
              )}

              {result && (
                <p className="m-0 text-sm font-semibold text-success-text" role="status">
                  {fmt(t.hanVietCognatesSync.done, { count: result.updated })}
                </p>
              )}

              {preview && (
                <>
                  <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[0.9375rem]">
                    <li>{fmt(t.hanVietCognatesSync.datasetEntries, { count: preview.entryCount })}</li>
                    <li>{fmt(t.hanVietCognatesSync.mappedChars, { count: preview.mappedCharCount })}</li>
                    <li>{fmt(t.hanVietCognatesSync.wordsToUpdate, { count: preview.updates.length })}</li>
                  </ul>
                  {preview.updates.length > 0 && (
                    <div className="mt-3">
                      <p className="m-0 mb-2 text-[0.8125rem] font-semibold uppercase tracking-wide text-text-muted">
                        {running
                          ? t.hanVietCognatesSync.syncingListTitle
                          : t.hanVietCognatesSync.previewListTitle}
                      </p>
                      <ul
                        className="m-0 flex max-h-48 list-none flex-col gap-1.5 overflow-y-auto rounded-lg border border-border bg-bg p-2"
                        aria-live={running ? 'polite' : undefined}
                      >
                        {preview.updates.map((update, index) => {
                          const isCurrent = running && progress?.current?.id === update.id
                          const isDone = running && progress && index < progress.done
                          return (
                            <li
                              key={update.id}
                              className={cn(
                                'flex flex-wrap items-baseline gap-x-3 gap-y-1.5 rounded-md px-2 py-1.5 text-sm transition-colors duration-150',
                                isCurrent && 'bg-accent-bg outline outline-1 outline-accent-border',
                                isDone && 'opacity-55',
                              )}
                            >
                              <span
                                className={cn(
                                  'min-w-10 font-semibold text-han',
                                  hanPopularityClass(update.popularity),
                                )}
                              >
                                {update.hanTraditional}
                              </span>
                              <span className="text-[0.8125rem] text-text-muted">
                                {formatHanVietChange(update.prevHanViet)}
                                <span className="mx-1 opacity-60" aria-hidden="true">
                                  →
                                </span>
                                {formatHanVietChange(update.hanViet)}
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )}
                </>
              )}

              {preview && preview.updates.length === 0 && (
                <p className="text-sm text-text-muted">{t.hanVietCognatesSync.noChanges}</p>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-4">
              {running && progress && (
                <div className="flex min-w-0 flex-1 flex-col gap-1.5" aria-live="polite">
                  <div
                    className="h-1.5 overflow-hidden rounded-full bg-border"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={progress.total}
                    aria-valuenow={progress.done}
                    aria-label={t.hanVietCognatesSync.running}
                  >
                    <div
                      className="h-full rounded-full bg-accent transition-[width] duration-200 ease-out"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <span className="text-[0.8125rem] text-text-muted">
                    {progress.current
                      ? `${fmt(t.hanVietCognatesSync.syncingWord, { hanTraditional: progress.current.hanTraditional })} · ${fmt(t.hanVietCognatesSync.progress, { done: progress.done, total: progress.total })}`
                      : fmt(t.hanVietCognatesSync.progress, {
                          done: progress.done,
                          total: progress.total,
                        })}
                  </span>
                </div>
              )}
              <span className="ml-auto inline-flex shrink-0 items-center gap-2">
                {!result && (
                  <button type="button" className={btnClass('ghost')} onClick={close}>
                    {running
                      ? t.hanVietCognatesSync.cancelSync
                      : preview?.updates?.length > 0
                        ? t.common.cancel
                        : t.common.close}
                  </button>
                )}
                {preview && preview.updates.length > 0 && !result && (
                  <LoadingButton
                    type="button"
                    className={btnClass('primary')}
                    loading={running}
                    loadingText={t.hanVietCognatesSync.running}
                    onClick={runSync}
                    disabled={running}
                  >
                    {t.hanVietCognatesSync.runBtn}
                  </LoadingButton>
                )}
                {result && (
                  <button type="button" className={btnClass('primary')} onClick={close}>
                    {t.common.close}
                  </button>
                )}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
