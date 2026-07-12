export const WORD_DIALECTS = ['cantonese', 'mandarin', 'both']

/** @typedef {'cantonese' | 'mandarin' | 'both'} WordDialect */

/** @type {Record<string, WordDialect>} */
const DIALECT_ALIASES = {
  cantonese: 'cantonese',
  canto: 'cantonese',
  yue: 'cantonese',
  quang: 'cantonese',
  'tiếng quảng': 'cantonese',
  'quang dong': 'cantonese',
  mandarin: 'mandarin',
  putonghua: 'mandarin',
  'pu tong hua': 'mandarin',
  'tiếng phổ thông': 'mandarin',
  'pho thong': 'mandarin',
  both: 'both',
  shared: 'both',
  common: 'both',
  chung: 'both',
  'chung cả hai': 'both',
}

/** @param {unknown} value */
export function normalizeDialect(value) {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase()
  if (!raw) return null
  return DIALECT_ALIASES[raw] ?? (WORD_DIALECTS.includes(raw) ? /** @type {WordDialect} */ (raw) : null)
}

/**
 * Infer dialect from romanization when not explicitly set.
 * @param {{ dialect?: string, jyutping?: string, pinyin?: string }} word
 * @returns {WordDialect}
 */
export function inferDialect(word) {
  const explicit = normalizeDialect(word.dialect)
  if (explicit) return explicit

  const hasJyutping = Boolean(String(word.jyutping ?? '').trim())
  const hasPinyin = Boolean(String(word.pinyin ?? '').trim())
  if (hasJyutping && hasPinyin) return 'both'
  if (hasPinyin) return 'mandarin'
  return 'cantonese'
}
