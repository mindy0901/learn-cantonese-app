function escapeCsvCell(value) {
  const s = String(value ?? '')
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function rowsToCsv(rows) {
  return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\n')
}

function flagCell(value) {
  return value ? '1' : ''
}

export function wordsToDataRows(words) {
  return words.map((w) => [
    w.hanViet ?? '',
    w.hanTraditional ?? '',
    w.jyutping ?? '',
    w.vietnamese ?? '',
    w.english ?? '',
    flagCell(w.important),
    flagCell(w.mastered),
    w.hanSimplified ?? '',
    w.pinyin ?? '',
    w.dialect ?? '',
  ])
}

export function grammarToDataRows(items) {
  return items.map((g) => [
    g.title ?? '',
    g.content ?? '',
    flagCell(g.important),
    flagCell(g.mastered),
  ])
}

export function lessonsToDataRows(lessons, words) {
  const wordById = new Map(words.map((w) => [w.id, w]))
  return lessons.map((lesson) => {
    const wordKeys = (lesson.wordIds ?? [])
      .map((id) => wordById.get(id))
      .filter(Boolean)
      .map((w) => w.english || w.hanViet || w.hanTraditional)
      .join(', ')

    const grammarSections = (lesson.grammar ?? []).filter((g) => g.title || g.content)
    const grammarTitles = grammarSections.map((g) => g.title ?? '').join(';;')
    const grammarContents = grammarSections.map((g) => g.content ?? '').join(';;')

    return [lesson.name ?? '', wordKeys, grammarTitles, grammarContents]
  })
}

export function downloadDataCsv(filename, rows) {
  const bom = '\uFEFF'
  const blob = new Blob([bom + rowsToCsv(rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function exportWordsCsv(words) {
  downloadDataCsv('words.csv', wordsToDataRows(words))
}

export function exportGrammarCsv(items) {
  downloadDataCsv('grammar.csv', grammarToDataRows(items))
}

export function exportLessonsCsv(lessons, words) {
  downloadDataCsv('lessons.csv', lessonsToDataRows(lessons, words))
}
