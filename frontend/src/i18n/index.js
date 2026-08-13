import { en } from './locales/en.js'
import { vi } from './locales/vi.js'

export const translations = { en, vi }

export function formatMessage(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ''))
}
