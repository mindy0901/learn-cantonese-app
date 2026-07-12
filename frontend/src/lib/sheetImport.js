import { emptyGrammar } from '../types/word.js'
import { cell, mapColumns, parseBool, parseCsvText } from './sheetParsers.js'
import { grammarMergeKey, lessonMergeKey, wordMergeKey } from './sheetMergeKeys.js'
import { normalizeWordFields } from './wordNormalize.js'

function createParseStats(totalRows = 0) {
  return {
    totalRows,
    emptyRows: 0,
    invalidRows: 0,
    sheetDuplicates: 0,
    validRows: 0,
  }
}

function finalizeParseResult(items, stats) {
  stats.validRows = items.length
  return { items, stats }
}

/** Keep last row when the same merge key appears more than once in the sheet. */
function dedupeSheetItems(items, keyFn, stats) {
  const order = []
  const byKey = new Map()

  for (const item of items) {
    const key = keyFn(item)
    if (byKey.has(key)) {
      stats.sheetDuplicates++
    } else {
      order.push(key)
    }
    byKey.set(key, item)
  }

  return order.map((key) => byKey.get(key))
}

const WORD_ALIASES = {
  english: ['english', 'tieng anh'],
  hanTraditional: ['chu han', 'chữ hán', 'chữ han', 'han', 'han trad', 'han_trad', 'han traditional', 'han_traditional', 'kanji', 'han hk', 'phồn thể', 'phồn thể hk'],
  hanSimplified: [
    'han simp',
    'han simplified',
    '简体',
    'giản thể',
    'giản thể hán',
    'mandarin han',
    'chữ hán giản thể',
  ],
  vietnamese: ['tieng viet', 'tiếng việt', 'vietnamese'],
  hanViet: ['han viet', 'hán việt', 'han-viet', 'hán-việt'],
  jyutping: ['jyutping', 'jyut ping'],
  pinyin: ['pinyin', '拼音', 'bo do pho thong', 'bồ độ phổ thông'],
  dialect: ['dialect', 'ngon ngu', 'ngôn ngữ', 'language', 'phuong ngu', 'phương ngữ'],
  important: ['important', 'quan trong', 'quan trọng'],
  mastered: ['mastered', 'da thuoc', 'đã thuộc'],
}

const GRAMMAR_ALIASES = {
  title: ['title', 'tieu de', 'tiêu đề'],
  content: ['content', 'noi dung', 'nội dung'],
  important: ['important', 'quan trong', 'quan trọng'],
  mastered: ['mastered', 'da thuoc', 'đã thuộc'],
}

const LESSON_ALIASES = {
  name: ['name', 'ten bai', 'tên bài', 'lesson', 'lesson name', 'ten bai hoc', 'tên bài học'],
  words: ['words', 'tu', 'từ', 'word list', 'word keys', 'tu vung', 'từ vựng'],
  grammarTitles: ['grammar titles', 'grammar title', 'tieu de ngu phap', 'tiêu đề ngữ pháp'],
  grammarContents: ['grammar contents', 'grammar content', 'noi dung ngu phap', 'nội dung ngữ pháp'],
}

/** Fixed column order when the sheet has no header row (data-only export). */
const WORD_POSITIONAL = {
  hanViet: 0,
  hanTraditional: 1,
  jyutping: 2,
  vietnamese: 3,
  english: 4,
  important: 5,
  mastered: 6,
}

const GRAMMAR_POSITIONAL = {
  title: 0,
  content: 1,
  important: 2,
  mastered: 3,
}

const LESSON_POSITIONAL = {
  name: 0,
  words: 1,
  grammarTitles: 2,
  grammarContents: 3,
}

function hasAnyColumn(cols, keys) {
  return keys.some((key) => cols[key] != null)
}

function countHeaderMatches(row, aliasMap) {
  const normalized = row.map((cell) =>
    String(cell ?? '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim(),
  )
  let matches = 0
  for (const aliases of Object.values(aliasMap)) {
    if (normalized.some((h) => aliases.some((a) => h === a || h.includes(a)))) {
      matches++
    }
  }
  return matches
}

function isWordHeaderRow(row) {
  return countHeaderMatches(row, WORD_ALIASES) >= 2
}

function isGrammarHeaderRow(row) {
  return countHeaderMatches(row, GRAMMAR_ALIASES) >= 1
}

function isLessonHeaderRow(row) {
  return countHeaderMatches(row, LESSON_ALIASES) >= 1
}

function resolveWordLayout(headers, rows) {
  if (isWordHeaderRow(headers)) {
    return { cols: mapColumns(headers, WORD_ALIASES), dataRows: rows, hasHeader: true }
  }
  const cols = mapColumns(headers, WORD_ALIASES)
  if (hasAnyColumn(cols, ['english', 'hanTraditional', 'vietnamese'])) {
    return { cols, dataRows: rows, hasHeader: true }
  }
  return { cols: WORD_POSITIONAL, dataRows: [headers, ...rows], hasHeader: false }
}

function resolveGrammarLayout(headers, rows) {
  if (isGrammarHeaderRow(headers)) {
    return { cols: mapColumns(headers, GRAMMAR_ALIASES), dataRows: rows, hasHeader: true }
  }
  const cols = mapColumns(headers, GRAMMAR_ALIASES)
  if (hasAnyColumn(cols, ['title', 'content'])) {
    return { cols, dataRows: rows, hasHeader: true }
  }
  return { cols: GRAMMAR_POSITIONAL, dataRows: [headers, ...rows], hasHeader: false }
}

function resolveLessonLayout(headers, rows) {
  if (isLessonHeaderRow(headers)) {
    return { cols: mapColumns(headers, LESSON_ALIASES), dataRows: rows, hasHeader: true }
  }
  const cols = mapColumns(headers, LESSON_ALIASES)
  if (cols.name != null) {
    return { cols, dataRows: rows, hasHeader: true }
  }
  return { cols: LESSON_POSITIONAL, dataRows: [headers, ...rows], hasHeader: false }
}

function rowHasData(row) {
  return row.some((c) => String(c ?? '').trim().length > 0)
}

export function parseWordsFromCsv(text) {
  const { headers, rows, totalRows } = parseCsvText(text)
  const { cols, dataRows } = resolveWordLayout(headers, rows)
  const stats = createParseStats(totalRows)

  const parsed = []
  const importBase = Date.now() - dataRows.length * 1000
  let importIndex = 0
  for (const row of dataRows) {
    if (!rowHasData(row)) {
      stats.emptyRows++
      continue
    }
    const english = cell(row, cols.english)
    const hanTraditional = cell(row, cols.hanTraditional)
    const hanSimplified = cell(row, cols.hanSimplified)
    const vietnamese = cell(row, cols.vietnamese)
    if (!english && !hanTraditional && !hanSimplified && !vietnamese) {
      stats.invalidRows++
      continue
    }

    const important = parseBool(cell(row, cols.important))
    const mastered = parseBool(cell(row, cols.mastered))
    const word = { english, hanTraditional, vietnamese }
    if (hanSimplified) word.hanSimplified = hanSimplified
    const hanViet = cell(row, cols.hanViet)
    const jyutping = cell(row, cols.jyutping)
    const pinyin = cell(row, cols.pinyin)
    const dialect = cell(row, cols.dialect)
    if (hanViet) word.hanViet = hanViet
    if (jyutping) word.jyutping = jyutping
    if (pinyin) word.pinyin = pinyin
    if (dialect) word.dialect = dialect
    if (important !== undefined) word.important = important
    if (mastered !== undefined) word.mastered = mastered
    word.createdAt = new Date(importBase + importIndex * 1000).toISOString()
    importIndex += 1
    parsed.push(normalizeWordFields(word))
  }

  const items = dedupeSheetItems(parsed, wordMergeKey, stats)
  return finalizeParseResult(items, stats)
}

export function parseGrammarFromCsv(text) {
  const { headers, rows, totalRows } = parseCsvText(text)
  const { cols, dataRows } = resolveGrammarLayout(headers, rows)
  const stats = createParseStats(totalRows)

  const parsed = []
  for (const row of dataRows) {
    if (!rowHasData(row)) {
      stats.emptyRows++
      continue
    }
    const title = cell(row, cols.title)
    const content = cell(row, cols.content)
    if (!title && !content) {
      stats.invalidRows++
      continue
    }

    const important = parseBool(cell(row, cols.important))
    const mastered = parseBool(cell(row, cols.mastered))
    const item = { title, content }
    if (important !== undefined) item.important = important
    if (mastered !== undefined) item.mastered = mastered
    parsed.push(item)
  }

  const items = dedupeSheetItems(parsed, grammarMergeKey, stats)
  return finalizeParseResult(items, stats)
}

function splitList(value, sep = /[,;|]/) {
  return String(value ?? '')
    .split(sep)
    .map((s) => s.trim())
    .filter(Boolean)
}

function splitGrammarList(value) {
  return String(value ?? '')
    .split(';;')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function parseLessonsFromCsv(text, existingWords = []) {
  const { headers, rows, totalRows } = parseCsvText(text)
  const { cols, dataRows } = resolveLessonLayout(headers, rows)

  const wordByEnglish = new Map()
  const wordByHanViet = new Map()
  for (const w of existingWords) {
    const eng = w.english?.trim().toLowerCase()
    const hv = w.hanViet?.trim().toLowerCase()
    if (eng) wordByEnglish.set(eng, w.id)
    if (hv) wordByHanViet.set(hv, w.id)
  }

  function resolveWordToken(token) {
    const t = token.trim()
    if (!t) return null
    const lower = t.toLowerCase()
    if (wordByEnglish.has(lower)) return wordByEnglish.get(lower)
    if (wordByHanViet.has(lower)) return wordByHanViet.get(lower)
    const parts = t.split('|').map((p) => p.trim().toLowerCase())
    if (parts.length === 3) {
      const match = existingWords.find(
        (w) =>
          w.english?.trim().toLowerCase() === parts[0] &&
          w.hanTraditional?.trim().toLowerCase() === parts[1] &&
          w.vietnamese?.trim().toLowerCase() === parts[2],
      )
      return match?.id ?? null
    }
    return null
  }

  const stats = createParseStats(totalRows)
  const parsed = []
  for (const row of dataRows) {
    if (!rowHasData(row)) {
      stats.emptyRows++
      continue
    }
    const name = cell(row, cols.name)
    if (!name) {
      stats.invalidRows++
      continue
    }

    const wordIds = []
    const seenWordIds = new Set()
    for (const token of splitList(cell(row, cols.words))) {
      const id = resolveWordToken(token)
      if (id && !seenWordIds.has(id)) {
        seenWordIds.add(id)
        wordIds.push(id)
      }
    }

    const titles = splitGrammarList(cell(row, cols.grammarTitles))
    const contents = splitGrammarList(cell(row, cols.grammarContents))
    const grammarCount = Math.max(titles.length, contents.length)
    const grammar = []
    for (let i = 0; i < grammarCount; i++) {
      const title = titles[i] ?? ''
      const content = contents[i] ?? ''
      if (!title && !content) continue
      grammar.push(emptyGrammar({ title, content }))
    }

    parsed.push({ name, wordIds, grammar })
  }

  const items = dedupeSheetItems(parsed, lessonMergeKey, stats)
  return finalizeParseResult(items, stats)
}
