import { create } from 'zustand'
import { formatMessage, translations } from '../i18n/index.js'
import { logAction } from '../lib/actionLog.js'

const STORAGE_KEY = 'cantonese-app-locale'

function loadLocale() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && saved in translations) return saved
  } catch {
    /* ignore */
  }
  const lang = navigator.language
  if (lang.startsWith('vi')) return 'vi'
  if (lang === 'zh-TW' || lang === 'zh-HK') return 'zh-TW'
  if (lang.startsWith('zh')) return 'zh-CN'
  return 'en'
}

const initialLocale = loadLocale()
document.documentElement.lang = initialLocale

export const useLocaleStore = create((set) => ({
  locale: initialLocale,

  setLocale: (next) => {
    logAction('Set app locale', { locale: next })
    localStorage.setItem(STORAGE_KEY, next)
    document.documentElement.lang = next
    set({ locale: next })
  },
}))

export function useLocale() {
  const locale = useLocaleStore((s) => s.locale)
  const setLocale = useLocaleStore((s) => s.setLocale)
  return {
    locale,
    setLocale,
    t: translations[locale],
    fmt: formatMessage,
  }
}
