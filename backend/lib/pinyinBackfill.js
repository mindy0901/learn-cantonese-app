import {
  fetchAllRows,
  rowToWord,
  upsertBatched,
  wordToRow,
} from './dataService.js'
import { normalizeWordFields, normWordField } from './wordNormalize.js'
import { resolvePinyin } from './pinyin.js'

/** Fill or correct pinyin for all words via OpenCC simplified + pinyin-pro. */
export async function backfillPinyin(db, userId) {
  const rows = await fetchAllRows(db, 'words', userId)
  const toUpsertById = new Map()
  let updated = 0
  let skipped = 0

  for (const row of rows) {
    const existing = rowToWord(row)
    const nextPinyin = resolvePinyin(existing)
    if (!nextPinyin) {
      skipped++
      continue
    }

    const prevPinyin = String(existing.pinyin ?? '').trim()
    if (normWordField(prevPinyin) === normWordField(nextPinyin)) {
      skipped++
      continue
    }

    const normalized = normalizeWordFields({ ...existing, pinyin: nextPinyin })
    toUpsertById.set(existing.id, wordToRow(normalized, userId, { includeCreatedAt: false }))
    updated++
  }

  const toUpsert = [...toUpsertById.values()]
  if (toUpsert.length > 0) {
    await upsertBatched(db, 'words', toUpsert)
  }

  return { total: rows.length, updated, skipped }
}
