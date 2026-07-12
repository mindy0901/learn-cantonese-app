import { api } from './api.js'
import { log } from './actionLog.js'
import { fetchGoogleSheetCsvDirect } from './sheetParsers.js'
import { resolveSheetError, toSheetError } from './sheetErrors.js'
import {
  parseGrammarFromCsv,
  parseLessonsFromCsv,
  parseWordsFromCsv,
} from './sheetImport.js'
import {
  previewGrammarMerge,
  previewLessonsMerge,
} from './sheetMergePreview.js'
import { getSheetUrlForType } from './syncConfig.js'

function parseSheetItems(type, csv, existingWords = []) {
  if (type === 'words') return parseWordsFromCsv(csv)
  if (type === 'grammar') return parseGrammarFromCsv(csv)
  if (type === 'lessons') return parseLessonsFromCsv(csv, existingWords)
  const err = new Error('UNKNOWN')
  err.code = 'UNKNOWN'
  throw err
}

async function loadSheetItems(type, sheetUrl, existingWords = []) {
  const url = sheetUrl?.trim()
  if (!url) {
    const err = new Error('NO_SHEET_URL')
    err.code = 'NO_SHEET_URL'
    throw err
  }

  const csv = await fetchGoogleSheetCsvDirect(url)
  const { items, stats } = parseSheetItems(type, csv, existingWords)

  if (items.length === 0) {
    const err = new Error('EMPTY_SHEET')
    err.code = 'EMPTY_SHEET'
    throw err
  }

  return { items, stats }
}

export { resolveSheetError, toSheetError }

/** Check: fetch sheet in browser only, preview against local store — no cloud API. */
export async function previewSheetMerge(
  type,
  { sheetUrl, existingWords = [], existingGrammar = [], existingLessons = [] } = {},
) {
  log("Preview sheet merge", type)
  const { items, stats } = await loadSheetItems(type, sheetUrl, existingWords)

  let mergePreview
  if (type === 'words') {
    mergePreview = await api.previewSheetMerge({ type, items })
  } else if (type === 'grammar') {
    mergePreview = previewGrammarMerge(items, existingGrammar)
  } else {
    mergePreview = previewLessonsMerge(items, existingLessons)
  }

  return { valid: true, items, ...stats, ...mergePreview }
}

/** Update: merge to cloud. Reuses items from Check when provided. */
export async function pullAndMergeFromSheet(
  type,
  { sheetUrl, existingWords = [], items: preloadedItems } = {},
) {
  log("Merge sheet", type)
  const { items } =
    preloadedItems != null
      ? { items: preloadedItems }
      : await loadSheetItems(type, sheetUrl, existingWords)
  const result = await api.mergeFromSheet({ type, items })
  log("Merge sheet done", type)
  return { ...result, validRows: items.length }
}

export { getSheetUrlForType }
