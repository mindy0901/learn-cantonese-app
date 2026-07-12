export function getSentenceSearchBlob(item) {
  return `${item.hanTraditional ?? ''} ${item.hanSimplified ?? ''} ${item.jyutping ?? ''} ${item.pinyin ?? ''} ${item.vietnamese ?? ''} ${item.english ?? ''}`.toLowerCase()
}

export function matchesSentenceSearch(item, query) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (item._searchBlob && !item._searchBlob.includes(q)) return false
  const blob = getSentenceSearchBlob(item)
  return blob.includes(q)
}

export function getSentenceSearchScore(item, query) {
  const q = query.trim().toLowerCase()
  if (!q) return 0
  let score = 0
  const han = (item.hanTraditional ?? '').toLowerCase()
  const viet = (item.vietnamese ?? '').toLowerCase()
  if (han === q) score += 100
  else if (han.startsWith(q)) score += 50
  else if (han.includes(q)) score += 25
  if (viet.includes(q)) score += 10
  return score
}
