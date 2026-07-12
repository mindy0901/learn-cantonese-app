import { PAGE_SIZE } from './constants.js'

function range(start, end) {
  const length = end - start + 1
  return Array.from({ length }, (_, index) => start + index)
}

/** @returns {(number | 'ellipsis')[]} */
export function getPaginationRange(page, totalPages, siblingCount = 1) {
  if (totalPages <= 1) return [1]

  const totalPageNumbers = siblingCount + 5

  if (totalPageNumbers >= totalPages) {
    return range(1, totalPages)
  }

  const leftSibling = Math.max(page - siblingCount, 1)
  const rightSibling = Math.min(page + siblingCount, totalPages)
  const showLeftEllipsis = leftSibling > 2
  const showRightEllipsis = rightSibling < totalPages - 1

  if (!showLeftEllipsis && showRightEllipsis) {
    const leftItemCount = 3 + 2 * siblingCount
    return [...range(1, leftItemCount), 'ellipsis', totalPages]
  }

  if (showLeftEllipsis && !showRightEllipsis) {
    const rightItemCount = 3 + 2 * siblingCount
    return [1, 'ellipsis', ...range(totalPages - rightItemCount + 1, totalPages)]
  }

  if (showLeftEllipsis && showRightEllipsis) {
    return [1, 'ellipsis', ...range(leftSibling, rightSibling), 'ellipsis', totalPages]
  }

  return range(1, totalPages)
}

export function paginateItems(items, page, pageSize = PAGE_SIZE) {
  const total = items.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1)
  const safePage = Math.min(Math.max(1, page), totalPages)
  const start = (safePage - 1) * pageSize
  return {
    items: items.slice(start, start + pageSize),
    page: safePage,
    totalPages,
    total,
    startIndex: start,
    pageSize,
  }
}
