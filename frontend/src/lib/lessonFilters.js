import { wordAddedAtMs } from './dataTransforms.js'

function compareLessons(a, b, sortKey) {
  if (sortKey === 'createdAt') {
    let cmp = wordAddedAtMs(a) - wordAddedAtMs(b)
    if (cmp === 0) cmp = String(a.id).localeCompare(String(b.id))
    return cmp
  }

  const av = (a.name ?? '').toLowerCase()
  const bv = (b.name ?? '').toLowerCase()
  let cmp = av.localeCompare(bv, undefined, { sensitivity: 'base' })
  if (cmp === 0) cmp = String(a.id).localeCompare(String(b.id))
  return cmp
}

export function sortLessons(lessons, sortKey, sortDir) {
  return [...lessons].sort((a, b) => {
    const cmp = compareLessons(a, b, sortKey)
    return sortDir === 'asc' ? cmp : -cmp
  })
}

export function getLessonsSortDirLabel(sortKey, sortDir, t) {
  if (sortKey === 'createdAt') {
    return sortDir === 'asc' ? t.wordBank.sortDateAsc : t.wordBank.sortDateDesc
  }
  return sortDir === 'asc' ? t.wordBank.sortAsc : t.wordBank.sortDesc
}
