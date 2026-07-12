import { api } from './api.js'

export function isLatinSearchQuery(text) {
  const q = String(text ?? '').trim()
  if (!q || q.length < 2) return false
  if (/\p{Script=Han}/u.test(q)) return false
  return /^[\p{L}\p{N}\s'.,\-()/]+$/u.test(q)
}

/** Search CC-CEDICT by English via backend API. */
export async function searchCedictByEnglish(query, { limit = 30 } = {}) {
  const q = String(query ?? '').trim()
  if (!q || !isLatinSearchQuery(q)) return []

  const result = await api.searchCedict({ q, limit })
  return result.items ?? []
}
