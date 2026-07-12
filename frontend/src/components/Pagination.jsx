import { cn } from '../lib/cn.js'
import { btnClass } from './ui/buttonStyles.js'
import { useLocale } from '../store/localeStore.js'
import { getPaginationRange } from '../lib/pagination.js'

export function Pagination({ page, totalPages, total, startIndex, pageSize, onPageChange, reserveSpace = false }) {
  const { t, fmt } = useLocale()

  if (totalPages <= 1 && !reserveSpace) return null

  if (totalPages <= 1) {
    return <div className="invisible pointer-events-none mt-3 py-2" aria-hidden="true" />
  }

  const from = total === 0 ? 0 : startIndex + 1
  const to = Math.min(startIndex + pageSize, total)
  const pageNumbers = getPaginationRange(page, totalPages)

  return (
    <nav
      className="mt-3 flex flex-wrap items-center justify-between gap-3 py-2"
      aria-label={t.pagination.label}
    >
      <p className="m-0 text-[0.8125rem] text-text-muted">
        {fmt(t.pagination.showing, { from, to, total })}
      </p>
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <button
          type="button"
          className={btnClass('ghost', 'sm')}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          {t.pagination.prev}
        </button>
        <div className="flex items-center gap-1" role="group" aria-label={fmt(t.pagination.pageOf, { page, totalPages })}>
          {pageNumbers.map((item, index) =>
            item === 'ellipsis' ? (
              <span
                key={`ellipsis-${index}`}
                className="px-0.5 text-[0.8125rem] leading-none text-text-muted select-none"
                aria-hidden="true"
              >
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                className={cn(
                  btnClass('ghost', 'sm'),
                  'min-w-9 px-3 tabular-nums',
                  item === page && 'bg-accent border-accent text-white cursor-default disabled:opacity-100',
                )}
                aria-label={fmt(t.pagination.goToPage, { page: item })}
                aria-current={item === page ? 'page' : undefined}
                disabled={item === page}
                onClick={() => onPageChange(item)}
              >
                {item}
              </button>
            ),
          )}
        </div>
        <button
          type="button"
          className={btnClass('ghost', 'sm')}
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          {t.pagination.next}
        </button>
      </div>
    </nav>
  )
}
