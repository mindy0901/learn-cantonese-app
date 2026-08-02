import { create } from 'zustand'
import { formatMessage, translations } from '../i18n/index.js'

document.documentElement.lang = 'en'

export const useLocaleStore = create((set) => ({
  locale: 'en',

  setLocale: () => {},
}))

export function useLocale() {
  return {
    locale: 'en',
    setLocale: () => {},
    t: translations.en,
    fmt: formatMessage,
  }
}
