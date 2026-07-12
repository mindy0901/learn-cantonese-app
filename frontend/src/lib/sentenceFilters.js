import { useMemo } from 'react'
import { getSentenceSearchScore, matchesSentenceSearch } from './sentenceSearch.js'

function compareSentence(a, b, sortKey) {
  if (sortKey === 'createdAt') {
    let cmp = (a.addedAt ?? 0) - (b.addedAt ?? 0)
    if (cmp === 0 && (a.addedAt ?? 0) === 0) {
      cmp = (a._sortSeq ?? 0) - (b._sortSeq ?? 0)
    }
    if (cmp === 0) cmp = String(a.id).localeCompare(String(b.id))
    return cmp
  }

  const av = (a[sortKey] ?? '').toLowerCase()
  const bv = (b[sortKey] ?? '').toLowerCase()
  let cmp = av.localeCompare(bv, undefined, { sensitivity: 'base' })
  if (cmp === 0) cmp = String(a.id).localeCompare(String(b.id))
  return cmp
}

export function filterAndSortSentences(items, search, filter, sortKey, sortDir, importantFirst) {
  let result = [...items]

  if (filter === 'important') result = result.filter((s) => s.important)
  if (filter === 'mastered') result = result.filter((s) => s.mastered)

  const hasSearch = search.trim().length > 0
  if (hasSearch) result = result.filter((s) => matchesSentenceSearch(s, search))

  result.sort((a, b) => {
    if (hasSearch) {
      const scoreDiff = getSentenceSearchScore(b, search) - getSentenceSearchScore(a, search)
      if (scoreDiff !== 0) return scoreDiff
    }
    if (importantFirst && a.important !== b.important) return a.important ? -1 : 1
    const cmp = compareSentence(a, b, sortKey)
    return sortDir === 'asc' ? cmp : -cmp
  })

  return result
}

export function getSentenceBankSortDirLabel(sortKey, sortDir, t) {
  if (sortKey === 'createdAt') {
    return sortDir === 'asc' ? t.wordBank.sortDateAsc : t.wordBank.sortDateDesc
  }
  return sortDir === 'asc' ? t.wordBank.sortAsc : t.wordBank.sortDesc
}

export function useFilteredSentences(items, search, filter, sortKey, sortDir, importantFirst) {
  return useMemo(
    () => filterAndSortSentences(items, search, filter, sortKey, sortDir, importantFirst),
    [items, search, filter, sortKey, sortDir, importantFirst],
  )
}
