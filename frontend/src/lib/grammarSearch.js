export function getGrammarSearchBlob(item) {
  return `${item.title ?? ''} ${item.content ?? ''}`.toLowerCase()
}

export function matchesGrammarSearch(item, query) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (item._searchBlob && !item._searchBlob.includes(q)) return false
  return item.title.toLowerCase().includes(q) || item.content.toLowerCase().includes(q)
}

export function getGrammarSearchScore(item, query) {
  const q = query.trim().toLowerCase()
  if (!q) return 0
  let score = 0
  const title = item.title.toLowerCase()
  const content = item.content.toLowerCase()
  if (title === q) score += 100
  else if (title.startsWith(q)) score += 50
  else if (title.includes(q)) score += 25
  if (content.includes(q)) score += 10
  return score
}
