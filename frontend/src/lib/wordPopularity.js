/** @typedef {0 | 1 | 2 | 3} PopularityLevel */

import { cn } from './cn.js'

export const POPULARITY_LEVELS = [0, 1, 2, 3]

export function normalizePopularity(value) {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  if (!Number.isInteger(n) || n < 0 || n > 3) return null
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
export function hanPopularityClass(popularity) {
  const level = normalizePopularity(popularity)
  return level === null ? '' : `han-popularity--lvl-${level}`
}

const HAN_CELL =
  'font-semibold leading-tight align-middle text-[calc(1em*var(--han-scale))]'

/** Standard Han text classes (base + popularity color). */
export function hanTextClassName(popularity, ...extra) {
  const popClass = hanPopularityClass(popularity)
  return cn(HAN_CELL, popClass || 'text-han', ...extra)
}
