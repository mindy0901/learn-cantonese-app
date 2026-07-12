import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocale } from '../store/localeStore.js'
import { useAppActions, useWords, useWordsRevision } from '../store/appStore.js'
import { normalizeWordFields } from '../lib/wordNormalize.js'
import { withAdminHint } from '../lib/emptyMessage.js'
import { saveWordBankReturnState, clearWordBankReturnState, restoreWordBankScroll } from '../lib/wordBankReturn.js'
import { useConfirmDialog } from '../hooks/useConfirmDialog.jsx'
import { useIsAdmin, useIsSignedIn } from '../store/authStore.js'
import { PAGE_SIZE } from '../lib/constants.js'
import {
  fetchWordBrowsePage,
  getCachedWordBrowsePage,
  patchWordInBrowseCache,
  prefetchWordBrowsePages,
} from '../lib/wordBrowseCache.js'
import { cn } from '../lib/cn.js'
import { Pagination } from './Pagination.jsx'
import { WordRow } from './WordRow.jsx'

const thClass =
  'text-left border-b border-border align-middle break-words min-w-0 bg-bg text-text-muted font-medium text-xs uppercase tracking-wide align-middle'

const thClassBank = 'px-3.5 py-2.5'
const thClassPicker = 'px-3 py-2'
const tdPicker = '[&_td]:px-3 [&_td]:py-2'

export const WordBankBrowseTable = memo(function WordBankBrowseTable({
  variant = 'bank',
  debouncedSearch,
  filter,
  sortKey,
  sortDir,
  onView,
  onTotalChange,
  selected,
  onToggleSelect,
  emptyHint,
  emptyNoMatch,
  restoreState = null,
}) {
  const { t, fmt } = useLocale()
  const isPicker = variant === 'picker'
  const isAdmin = useIsAdmin()
  const isSignedIn = useIsSignedIn()
  const canEdit = !isPicker && isAdmin
  const canMark = !isPicker && isSignedIn
  const wordsRevision = useWordsRevision()
  const storeWords = useWords()
  const { editWord, removeWord, mergeWords, toggleImportant, toggleMastered } = useAppActions()
  const { ask, dialog } = useConfirmDialog()
  const restoredScrollRef = useRef(false)
  const skipPageResetRef = useRef(Boolean(restoreState))
  const [page, setPage] = useState(() => {
    const next = restoreState?.page
    return typeof next === 'number' && next >= 1 ? next : 1
  })
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  useEffect(() => {
    setItems((current) => {
      const byId = new Map(storeWords.map((w) => [w.id, w]))
      let changed = false
      const next = current.map((item) => {
        const fromStore = byId.get(item.id)
        if (!fromStore) return item
        const updated = {
          ...item,
          english: fromStore.english,
          hanTraditional: fromStore.hanTraditional,
          vietnamese: fromStore.vietnamese,
          hanViet: fromStore.hanViet,
          jyutping: fromStore.jyutping,
          vietnameseDetail: fromStore.vietnameseDetail,
          important: fromStore.important,
          mastered: fromStore.mastered,
          popularity: fromStore.popularity,
        }
        if (
          updated.english === item.english &&
          updated.hanTraditional === item.hanTraditional &&
          updated.vietnamese === item.vietnamese &&
          updated.hanViet === item.hanViet &&
          updated.jyutping === item.jyutping &&
          updated.vietnameseDetail === item.vietnameseDetail &&
          updated.important === item.important &&
          updated.mastered === item.mastered &&
          updated.popularity === item.popularity
        ) {
          return item
        }
        changed = true
        return updated
      })
      return changed ? next : current
    })
  }, [storeWords])

  const handleEditWord = useCallback(
    (word, patch) => {
      const merged = normalizeWordFields({ ...word, ...patch })
      setItems((current) =>
        current.map((item) => (item.id === word.id ? { ...item, ...merged } : item)),
      )
      patchWordInBrowseCache(word.id, {
        english: merged.english,
        hanTraditional: merged.hanTraditional,
        vietnamese: merged.vietnamese,
        hanViet: merged.hanViet,
        jyutping: merged.jyutping,
        vietnameseDetail: merged.vietnameseDetail,
      })
      editWord(word, patch)
    },
    [editWord],
  )

  const handleDelete = useCallback(
    (word) => {
      const label = [word.hanTraditional, word.english || word.vietnamese].filter(Boolean).join(' · ') || word.hanViet
      ask({
        title: t.confirm.deleteTitle,
        message: fmt(t.confirm.deleteWord, { label }),
        onConfirm: () => removeWord(word.id),
      })
    },
    [ask, fmt, t, removeWord],
  )

  const handleToggleImportant = useCallback(
    (word) => {
      const nextImportant = !word.important
      if (filter === 'important' && !nextImportant) {
        setTotal((current) => {
          const next = Math.max(0, current - 1)
          onTotalChange?.(next)
          return next
        })
      }
      toggleImportant(word)
    },
    [filter, onTotalChange, toggleImportant],
  )

  const handleToggleMastered = useCallback(
    (word) => {
      const nextMastered = !word.mastered
      if (filter === 'mastered' && !nextMastered) {
        setTotal((current) => {
          const next = Math.max(0, current - 1)
          onTotalChange?.(next)
          return next
        })
      }
      toggleMastered(word)
    },
    [filter, onTotalChange, toggleMastered],
  )

  const displayItems = useMemo(() => {
    if (filter === 'important') return items.filter((word) => word.important)
    if (filter === 'mastered') return items.filter((word) => word.mastered)
    return items
  }, [items, filter])

  const hasQuery = debouncedSearch.trim().length > 0

  const handleViewWord = useCallback(
    (word) => {
      if (!isPicker && onView) {
        saveWordBankReturnState({
          wordId: word.id,
          page,
          scrollY: window.scrollY,
          search: debouncedSearch,
          filter,
          sortKey,
          sortDir,
        })
        onView(word)
      }
    },
    [isPicker, onView, page, debouncedSearch, filter, sortKey, sortDir],
  )

  useEffect(() => {
    if (skipPageResetRef.current) {
      skipPageResetRef.current = false
      return
    }
    setPage(1)
  }, [debouncedSearch, filter, sortKey, sortDir])

  useEffect(() => {
    let cancelled = false
    const revision = wordsRevision
    const browseParams = {
      pageSize: PAGE_SIZE,
      sortKey,
      sortDir,
      filter,
      q: debouncedSearch,
    }

    const applyResult = (result) => {
      const nextItems = result.items ?? []
      const nextTotal = result.total ?? 0
      const nextTotalPages = Math.max(1, result.totalPages ?? 1)
      mergeWords(nextItems)
      setItems((current) => {
        const flagsById = new Map(
          current.map((word) => [
            word.id,
            { important: word.important, mastered: word.mastered, popularity: word.popularity },
          ]),
        )
        return nextItems.map((word) => {
          const flags = flagsById.get(word.id)
          if (!flags) return word
          return {
            ...word,
            important: flags.important,
            mastered: flags.mastered,
            popularity: word.popularity ?? flags.popularity,
          }
        })
      })
      setTotal(nextTotal)
      setTotalPages(nextTotalPages)
      onTotalChange?.(nextTotal)
      prefetchWordBrowsePages(browseParams, page, nextTotalPages, { revision, mergeWords })
    }

    const cached = getCachedWordBrowsePage({ ...browseParams, page }, revision)
    if (cached) {
      applyResult(cached)
      setLoadError(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setLoadError(null)
    fetchWordBrowsePage({ ...browseParams, page }, { revision })
      .then((result) => {
        if (cancelled) return
        applyResult(result)
      })
      .catch((err) => {
        if (cancelled) return
        const message = err instanceof Error ? err.message : String(err)
        console.warn('[word browse]', message)
        setLoadError(message)
        setItems([])
        setTotal(0)
        setTotalPages(1)
        onTotalChange?.(0)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [
    page,
    debouncedSearch,
    filter,
    sortKey,
    sortDir,
    wordsRevision,
    mergeWords,
    onTotalChange,
  ])

  useEffect(() => {
    if (loading) return
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages, loading])

  useEffect(() => {
    if (isPicker || !restoreState || restoredScrollRef.current || loading) return
    if (displayItems.length === 0 && !loadError) return

    let attempts = 0
    const maxAttempts = 30

    const tryRestore = () => {
      attempts += 1
      if (restoreWordBankScroll(restoreState)) {
        restoredScrollRef.current = true
        clearWordBankReturnState()
        return
      }
      if (attempts < maxAttempts) {
        requestAnimationFrame(tryRestore)
        return
      }
      restoredScrollRef.current = true
      clearWordBankReturnState()
    }

    requestAnimationFrame(tryRestore)
  }, [isPicker, restoreState, loading, displayItems, loadError])

  const safePage = Math.min(page, totalPages)
  const startIndex = (safePage - 1) * PAGE_SIZE
  const showEmpty = !loading && displayItems.length === 0
  const colCount = isPicker ? 6 : 6 + (canMark ? 2 : 0) + (canEdit ? 1 : 0)
  const placeholderCount = Math.max(0, PAGE_SIZE - (showEmpty ? 1 : displayItems.length))

  const placeholderRows = useMemo(
    () =>
      Array.from({ length: placeholderCount }, (_, i) => (
        <tr key={`placeholder-${i}`} aria-hidden="true" className="border-b border-border last:border-b-0">
          <td colSpan={colCount} className="py-2.5 align-middle">
            <span className="block min-h-5 invisible" aria-hidden="true">
              &nbsp;
            </span>
          </td>
        </tr>
      )),
    [placeholderCount, colCount],
  )

  const emptyMessage = useMemo(() => {
    if (loadError) return null
    if (hasQuery) return emptyNoMatch ?? t.wordBank.noSearchMatch
    if (isPicker) return emptyHint ?? t.lessonEdit.searchBankHint
    return withAdminHint(t.wordBank.empty, t.wordBank.emptyAdminHint, canEdit)
  }, [loadError, hasQuery, emptyNoMatch, emptyHint, isPicker, t, canEdit])

  const rows = useMemo(() => {
    return displayItems.map((word, i) => (
      <WordRow
        key={word.id}
        word={word}
        index={startIndex + i}
        canEdit={canEdit}
        canMark={canMark}
        pickerMode={isPicker}
        selected={selected?.has(String(word.id))}
        onToggleSelect={onToggleSelect}
        onSave={handleEditWord}
        onDelete={handleDelete}
        onToggleImportant={handleToggleImportant}
        onToggleMastered={handleToggleMastered}
        onView={handleViewWord}
      />
    ))
  }, [
    displayItems,
    startIndex,
    canEdit,
    canMark,
    isPicker,
    selected,
    onToggleSelect,
    handleEditWord,
    handleDelete,
    handleToggleImportant,
    handleToggleMastered,
    handleViewWord,
  ])

  const pagination = (
    <Pagination
      page={safePage}
      totalPages={totalPages}
      total={total}
      startIndex={startIndex}
      pageSize={PAGE_SIZE}
      onPageChange={setPage}
      reserveSpace={!isPicker}
    />
  )

  const th = cn(thClass, isPicker ? thClassPicker : thClassBank)
  const numHeadClass = cn(
    th,
    'text-text-muted text-[0.8125rem] whitespace-nowrap text-center px-1.5',
    !isPicker && 'pr-0.5',
  )

  return (
    <>
      {isPicker ? (
        <div className="border-t border-border px-3 pt-2 pb-3">{pagination}</div>
      ) : (
        <div className="min-h-11 mb-3 [&_.pagination]:mt-0">{pagination}</div>
      )}
      <div
        className={cn(
          'overflow-auto border border-border rounded-xl bg-surface',
          !isPicker && 'w-full max-w-full overflow-x-auto',
          isPicker && tdPicker,
        )}
      >
        <table className={cn('w-full border-collapse text-sm table-auto', isPicker && tdPicker)}>
          <colgroup>
            {isPicker ? <col className="w-9" /> : <col />}
            {!isPicker && canMark && <col className="w-8" />}
            <col />
            <col />
            <col />
            <col />
            <col />
            {!isPicker && canMark && <col className="w-[4.75rem]" />}
            {!isPicker && canEdit && <col className="w-16" />}
          </colgroup>
          <thead>
            <tr>
              {isPicker ? (
                <th className={cn(th, 'text-center align-middle')} aria-label={t.lessonEdit.selected} />
              ) : (
                <th className={numHeadClass}>{t.wordBank.colNum}</th>
              )}
              {!isPicker && canMark && <th className={cn(th, 'px-0.5 py-1.5 text-center align-middle w-8')}>{t.wordBank.colStar}</th>}
              <th className={th}>{t.wordBank.colHanViet}</th>
              <th className={th}>{t.wordBank.colHanTraditional}</th>
              <th className={th}>{t.wordBank.colJyutping}</th>
              <th className={th}>{t.wordBank.colVietnamese}</th>
              <th className={th}>{t.wordBank.colEnglish}</th>
              {!isPicker && canMark && (
                <th className={cn(th, 'px-2 py-1.5 text-center align-middle text-[0.6875rem] font-semibold leading-tight whitespace-nowrap tracking-wide')}>
                  {t.wordBank.colMastered}
                </th>
              )}
              {!isPicker && canEdit && (
                <th className={cn(th, 'px-0.5 py-1.5 text-center align-middle text-sm leading-none')} aria-label={t.common.actions} title={t.common.actions}>
                  ✎
                </th>
              )}
            </tr>
          </thead>
          <tbody className="[&_tr:last-child]:border-b-0">
            {loading ? (
              <tr>
                <td colSpan={colCount}>
                  <p className="m-0 min-h-10 flex items-center justify-center text-center text-sm text-text-muted">
                    {t.common.loading}
                  </p>
                </td>
              </tr>
            ) : loadError ? (
              <tr>
                <td colSpan={colCount}>
                  <p className="m-0 min-h-10 flex items-center justify-center text-center px-4 py-3 rounded-lg text-sm bg-error-bg text-error-text border border-error-border" role="alert">
                    {loadError}
                  </p>
                </td>
              </tr>
            ) : showEmpty ? (
              <tr>
                <td colSpan={colCount}>
                  <p className="m-0 min-h-10 flex items-center justify-center text-center text-sm text-text-muted">
                    {emptyMessage}
                  </p>
                </td>
              </tr>
            ) : (
              rows
            )}
            {!loading && placeholderRows}
          </tbody>
        </table>
      </div>
      {!isPicker && dialog}
    </>
  )
})
