import { ensureHanVariants } from './opencc.js'
import { isHanVietNone } from './hanVietMarkers.js'
import { displayHanViet, hasFilledHanViet } from './hanVietReadings.js'

/** Table summary from top-level english / vietnamese fields. */
export function wordFieldSummary(word, field) {
  return String(word[field] ?? '').trim()
}

/** True when Hán–Việt, Vietnamese, or English is still empty / placeholder-only. */
export function isWordFieldPending(word, field) {
  if (field === 'hanViet') {
    const hanViet = String(word?.hanViet ?? '').trim()
    if (!hanViet) return true
    if (isHanVietNone(hanViet)) return false
    return !hasFilledHanViet(hanViet)
  }
  return !wordFieldSummary(word, field)
}

/** Display value for a word field, or the localized "updating" label when pending. */
export function wordFieldDisplayText(word, field, updatingLabel) {
  if (field === 'hanViet') {
    const hanViet = String(word?.hanViet ?? '').trim()
    if (!hanViet || (!isHanVietNone(hanViet) && !hasFilledHanViet(hanViet))) {
      return updatingLabel
    }
    return displayHanViet(hanViet)
  }
  return wordFieldSummary(word, field) || updatingLabel
}

function resolvedHanVariants(word) {
  return ensureHanVariants({
    hanTraditional: word.hanTraditional,
    hanSimplified: word.hanSimplified,
    hanTrad: word.hanTrad,
    han: word.han,
  })
}

/** Traditional Chinese characters for tables and lists. */
export function displayHan(word) {
  const stored = String(word.hanTraditional ?? word.hanTrad ?? word.han ?? '').trim()
  if (stored) return stored
  return resolvedHanVariants(word).hanTraditional.trim()
}

/** Jyutping for tables and lists. */
export function displayRomanization(word) {
  return String(word.jyutping ?? '').trim()
}
