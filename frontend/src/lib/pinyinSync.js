import { resolvePinyin, pinyinSourceHan } from './pinyin.js'
import { normWordField } from './wordNormalize.js'

/** Preview pinyin updates for all words (OpenCC simplified → pinyin-pro). */
export function previewPinyinSync(words) {
  const updates = []

  for (const word of words ?? []) {
    const sourceHan = pinyinSourceHan(word)
    if (!sourceHan) continue

    const nextPinyin = resolvePinyin(word)
    if (!nextPinyin) continue

    const prevPinyin = String(word.pinyin ?? '').trim()
    if (normWordField(prevPinyin) === normWordField(nextPinyin)) continue

    updates.push({
      id: word.id,
      hanTraditional: String(word.hanTraditional ?? word.hanTrad ?? word.han ?? '').trim(),
      hanSimplified: sourceHan,
      prevPinyin,
      nextPinyin,
      popularity: word.popularity,
    })
  }

  return { updates, wordCount: words?.length ?? 0 }
}

export function formatPinyin(value) {
  const text = String(value ?? '').trim()
  return text || '—'
}
