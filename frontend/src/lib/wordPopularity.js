/** @typedef {0 | 1 | 2 | 3 | 4} PopularityLevel */

import { cn } from './cn.js'

export const POPULARITY_LEVELS = [0, 1, 2, 3, 4]

export function normalizePopularity(value) {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  if (!Number.isInteger(n) || n < 0 || n > 4) return null
  return /** @type {PopularityLevel} */ (n)
}

export function mergePopularity(a, b) {
  const left = normalizePopularity(a)
  const right = normalizePopularity(b)
  if (left === null) return right
  if (right === null) return left
  return /** @type {PopularityLevel} */ (Math.max(left, right))
}

/** CSS class for Han text color by popularity; empty when not voted. */
export function hanPopularityClass(_popularity) {
  return ''
}

const HAN_CELL =
  'font-semibold leading-tight align-middle text-[calc(1em*var(--han-scale))]'

/** Standard Han text classes (base + popularity color). */
export function hanTextClassName(_popularity, ...extra) {
  return cn(HAN_CELL, 'text-han', ...extra)
}
