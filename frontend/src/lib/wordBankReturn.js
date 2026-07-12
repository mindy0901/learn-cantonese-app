const STORAGE_KEY = 'cantonese-word-bank-return'

/** @type {WordBankReturnState | null} */
let memoryCache = null

/** @typedef {{
 *   wordId: string
 *   page: number
 *   scrollY: number
 *   search: string
 *   filter: string
 *   sortKey: string
 *   sortDir: string
 * }} WordBankReturnState */

/** @param {WordBankReturnState} state */
export function saveWordBankReturnState(state) {
  memoryCache = state
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore quota / private mode
  }
}

/** @returns {WordBankReturnState | null} */
export function loadWordBankReturnState() {
  if (memoryCache) return memoryCache
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || !parsed.wordId) return null
    memoryCache = parsed
    return parsed
  } catch {
    return null
  }
}

export function clearWordBankReturnState() {
  memoryCache = null
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

/** @param {WordBankReturnState | null | undefined} restore @param {{ filter: string, sortKey: string, sortDir: string }} browse */
export function wordBankReturnMatches(restore, browse) {
  if (!restore) return false
  return (
    restore.filter === browse.filter &&
    restore.sortKey === browse.sortKey &&
    restore.sortDir === browse.sortDir
  )
}

/** @param {WordBankReturnState} state */
export function restoreWordBankScroll(state) {
  const row = state.wordId
    ? document.querySelector(`[data-word-id="${CSS.escape(String(state.wordId))}"]`)
    : null
  if (row) {
    row.scrollIntoView({ block: 'center' })
    return true
  }
  if (typeof state.scrollY === 'number') {
    window.scrollTo({ top: state.scrollY, left: 0 })
    return true
  }
  return false
}
