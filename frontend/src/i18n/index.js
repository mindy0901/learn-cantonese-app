import { en } from './locales/en.js'
import { vi } from './locales/vi.js'
import { zhCN } from './locales/zh-CN.js'
import { zhTW } from './locales/zh-TW.js'

export const translations = {
  en,
  vi,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
}

export function formatMessage(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ''))
}
