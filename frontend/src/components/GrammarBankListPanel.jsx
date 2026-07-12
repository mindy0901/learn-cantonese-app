import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { useLocale } from '../store/localeStore.js'
import { useGrammarBank, useAppActions } from '../store/appStore.js'
import { useFilteredGrammar, getGrammarBankSortDirLabel } from '../lib/grammarFilters.js'
import { paginateItems } from '../lib/pagination.js'
import { withAdminHint } from '../lib/emptyMessage.js'
import { useConfirmDialog } from '../hooks/useConfirmDialog.jsx'
import { useIsAdmin, useIsSignedIn } from '../store/authStore.js'
import { cn } from '../lib/cn.js'
import { bankToolbarButtonClass, bankToolbarRowClass, bankToolbarSearchClass, bankToolbarSelectClass } from './ui/bankToolbarStyles.js'
import { BankSearchInput } from './BankSearchInput.jsx'
import { Pagination } from './Pagination.jsx'
import { GrammarRow } from './GrammarRow.jsx'

const thClass =
  'px-3.5 py-2.5 text-left border-b border-border align-middle break-words min-w-0 bg-bg text-text-muted font-medium text-xs uppercase tracking-wide'

const GrammarBankTableResults = memo(function GrammarBankTableResults({
  debouncedSearch,
  filter,
  sortKey,
  sortDir,
}) {
  const { t, fmt } = useLocale()
  const canEdit = useIsAdmin()
  const canMark = useIsSignedIn()
  const items = useGrammarBank()
  const { editGrammar, toggleGrammarImportant, toggleGrammarMastered, removeGrammar } = useAppActions()
  const { ask, dialog } = useConfirmDialog()
  const [page, setPage] = useState(1)

  const handleDelete = useCallback(
    (item) => {
      ask({
        title: t.confirm.deleteTitle,
        message: fmt(t.confirm.deleteGrammar, {
          label: item.title || item.content?.slice(0, 40) || '—',
        }),
        onConfirm: () => removeGrammar(item.id),
      })
    },
    [ask, fmt, t, removeGrammar],
  )

  const filtered = useFilteredGrammar(items, debouncedSearch, filter, sortKey, sortDir, false)
  const hasQuery = debouncedSearch.trim().length > 0

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, filter, sortKey, sortDir])

  const { items: pageItems, page: safePage, totalPages, total, startIndex, pageSize } = useMemo(
    () => paginateItems(filtered, page),
    [filtered, page],
  )

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const showEmpty = pageItems.length === 0
  const colCount = 3 + (canMark ? 2 : 0) + (canEdit ? 1 : 0)
  const placeholderCount = Math.max(0, pageSize - (showEmpty ? 1 : pageItems.length))

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

  const rows = useMemo(() => {
    return pageItems.map((item, i) => (
        <GrammarRow
          key={item.id}
          item={item}
          index={startIndex + i}
          canEdit={canEdit}
          canMark={canMark}
          onSave={editGrammar}
          onDelete={handleDelete}
          onToggleImportant={toggleGrammarImportant}
          onToggleMastered={toggleGrammarMastered}
        />
      ))
  }, [pageItems, startIndex, canEdit, canMark, editGrammar, handleDelete, toggleGrammarImportant, toggleGrammarMastered])

  return (
    <>
      <div className="min-h-11 mb-3 [&_.pagination]:mt-0">
        <Pagination
          page={safePage}
          totalPages={totalPages}
          total={total}
          startIndex={startIndex}
          pageSize={pageSize}
          onPageChange={setPage}
          reserveSpace
        />
      </div>
      <div className="w-full max-w-full overflow-x-auto overflow-auto border border-border rounded-xl bg-surface">
        <table className="w-full border-collapse text-sm table-auto">
          <colgroup>
            <col />
            {canMark && <col className="w-8" />}
            <col />
            <col />
            {canMark && <col className="w-[4.75rem]" />}
            {canEdit && <col className="w-16" />}
          </colgroup>
          <thead>
            <tr>
              <th className={cn(thClass, 'text-text-muted text-[0.8125rem] whitespace-nowrap text-center px-1.5 pr-0.5')}>
                {t.grammarBank.colNum}
              </th>
              {canMark && <th className={cn(thClass, 'px-0.5 py-1.5 text-center align-middle w-8')}>{t.wordBank.colStar}</th>}
              <th className={thClass}>{t.grammarBank.colTitle}</th>
              <th className={thClass}>{t.grammarBank.colContent}</th>
              {canMark && (
                <th className={cn(thClass, 'px-2 py-1.5 text-center align-middle text-[0.6875rem] font-semibold leading-tight whitespace-nowrap tracking-wide')}>
                  {t.wordBank.colMastered}
                </th>
              )}
              {canEdit && <th className={thClass}>{t.common.actions}</th>}
            </tr>
          </thead>
          <tbody className="[&_tr:last-child]:border-b-0">
            {showEmpty ? (
              <tr>
                <td colSpan={colCount}>
                  <p className="m-0 min-h-10 flex items-center justify-center text-center text-sm text-text-muted">
                    {hasQuery
                      ? t.grammarBank.noSearchMatch
                      : withAdminHint(t.grammarBank.empty, t.grammarBank.emptyAdminHint, canEdit)}
                  </p>
                </td>
              </tr>
            ) : (
              rows
            )}
            {placeholderRows}
          </tbody>
        </table>
      </div>
      {dialog}
    </>
  )
})

export const GrammarBankListPanel = memo(function GrammarBankListPanel({
  filter,
  sortKey,
  sortDir,
  onFilterChange,
}) {
  const { t, fmt } = useLocale()
  const items = useGrammarBank()
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const handleDebouncedSearch = useCallback((value) => setDebouncedSearch(value), [])

  const filtered = useFilteredGrammar(items, debouncedSearch, filter, sortKey, sortDir, false)

  const countLabel =
    filter === 'important'
      ? fmt(t.grammarBank.itemsFoundImportant, { count: filtered.length })
      : filter === 'mastered'
        ? fmt(t.grammarBank.itemsFoundMastered, { count: filtered.length })
        : fmt(t.grammarBank.itemsFound, { count: filtered.length })

  const sortDirLabel = getGrammarBankSortDirLabel(sortKey, sortDir, t)

  return (
    <div className="w-full">
      <p className="mb-3 min-h-[1.375rem] tabular-nums text-sm text-text-muted">{countLabel}</p>

      <div className={bankToolbarRowClass}>
        <BankSearchInput
          className={bankToolbarSearchClass}
          onDebouncedChange={handleDebouncedSearch}
          placeholder={t.grammarBank.searchPlaceholder}
        />
        <select className={bankToolbarSelectClass} value={filter} onChange={(e) => onFilterChange({ filter: e.target.value })}>
          <option value="all">{t.grammarBank.filterAll}</option>
          <option value="important">{t.grammarBank.filterImportant}</option>
          <option value="mastered">{t.grammarBank.filterMastered}</option>
        </select>
        <select
          className={bankToolbarSelectClass}
          value={sortKey}
          onChange={(e) => {
            const nextKey = e.target.value
            onFilterChange({
              sortKey: nextKey,
              ...(nextKey === 'createdAt' && sortKey !== 'createdAt' ? { sortDir: 'desc' } : {}),
            })
          }}
          aria-label="Sort by"
        >
          <option value="title">{t.grammarBank.sortTitle}</option>
          <option value="content">{t.grammarBank.sortContent}</option>
          <option value="createdAt">{t.sort.createdAt}</option>
        </select>
        <button
          type="button"
          className={bankToolbarButtonClass}
          onClick={() => onFilterChange({ sortDir: sortDir === 'asc' ? 'desc' : 'asc' })}
        >
          {sortDirLabel}
        </button>
      </div>

      <GrammarBankTableResults
        debouncedSearch={debouncedSearch}
        filter={filter}
        sortKey={sortKey}
        sortDir={sortDir}
      />
    </div>
  )
})
