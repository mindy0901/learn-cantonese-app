import { pinyin } from 'pinyin-pro'
import { ensureHanVariants } from './opencc.js'

/** Simplified Han (via OpenCC) → Hanyu Pinyin with tone marks. */
export function toPinyin(text) {
  const value = String(text ?? '').trim()
  if (!value) return ''
  return pinyin(value, { toneType: 'symbol', type: 'array' })
    .map((s) => String(s ?? '').trim())
    .filter(Boolean)
    .join(' ')
}

export function pinyinSourceHan(word) {
  const { hanSimplified } = ensureHanVariants({
    hanTraditional: word.hanTraditional,
    hanSimplified: word.hanSimplified,
    hanTrad: word.hanTrad,
    han: word.han,
  })
  return hanSimplified.trim()
}

/** Generate pinyin from OpenCC simplified form. */
export function resolvePinyin(word) {
  const source = pinyinSourceHan(word)
  if (!source) return ''
  return toPinyin(source)
}
