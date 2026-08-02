import { en } from './locales/en.js'

export const translations = { en }

export function formatMessage(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ''))
}
