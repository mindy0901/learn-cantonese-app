import { HAN_VIET_NONE, isHanVietNone } from './hanVietMarkers.js'

const HAN_VIET_PLACEHOLDER = '•'
const HAN_VIET_PLACEHOLDER_LEGACY = '·'
const HAN_VIET_ALT_SEP = '/'
const TRAILING_PUNCT_RE = /(?:\.{2,}|[\s.,?!…:;，。！？、])+$/u

function stripTrailingPunctuation(value) {
  let s = String(value ?? '').trim()
  while (s.length > 0) {
    const next = s.replace(TRAILING_PUNCT_RE, '').trim()
    if (next === s) break
    s = next
  }
  return s
}

function titleCaseSegment(segment) {
  if (!segment) return segment
  const lower = segment.toLocaleLowerCase('vi')
  return lower.charAt(0).toLocaleUpperCase('vi') + lower.slice(1)
}

function titleCaseToken(token) {
  return token.split('-').map(titleCaseSegment).join('-')
}

function toDisplayCase(value) {
  return String(value ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(titleCaseToken)
    .join(' ')
}

function isHanVietPlaceholder(token) {
  return token === HAN_VIET_PLACEHOLDER || token === HAN_VIET_PLACEHOLDER_LEGACY
}

function parseHanVietSlotReadings(slot) {
  return String(slot ?? '')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
}

function normalizeHanVietSlot(slot) {
  const readings = parseHanVietSlotReadings(slot)
  if (readings.length === 0) return ''

  const normalized = readings.map((reading) => {
    if (isHanVietPlaceholder(reading) || /^_+$/.test(reading)) return reading
    return toDisplayCase(stripTrailingPunctuation(reading))
  })

  const seen = new Set()
  const unique = []
  for (const reading of normalized) {
    const key = reading.toLocaleLowerCase('vi')
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(reading)
  }

  return unique.join(HAN_VIET_ALT_SEP)
}

export function normalizeHanVietValue(hanViet) {
  const text = String(hanViet ?? '').trim()
  if (!text) return ''
  if (isHanVietNone(text)) return HAN_VIET_NONE

  return text
    .split(/\s+/)
    .filter(Boolean)
    .map(normalizeHanVietSlot)
    .filter(Boolean)
    .join(' ')
}
