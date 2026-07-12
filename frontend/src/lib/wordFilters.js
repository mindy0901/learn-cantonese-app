export function getWordBankSortDirLabel(sortKey, sortDir, t) {
  if (sortKey === 'createdAt') {
    return sortDir === 'asc' ? t.wordBank.sortDateAsc : t.wordBank.sortDateDesc
  }
  return sortDir === 'asc' ? t.wordBank.sortAsc : t.wordBank.sortDesc
}
