import { create } from 'zustand'

const STORAGE_KEY = 'cantonese-app-ui'

function loadUiState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      const theme = parsed.theme === 'dark' || parsed.theme === 'light' ? parsed.theme : 'light'
      return { theme }
    }
  } catch {
    /* ignore */
  }
  return { theme: 'light' }
}

const initialUi = loadUiState()
document.documentElement.dataset.theme = initialUi.theme

export const useUiStore = create((set, get) => ({
  theme: initialUi.theme,

  persistUi: (patch) => {
    const next = { theme: get().theme, ...patch }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    set(patch)
  },

  setTheme: (theme) => {
    document.documentElement.dataset.theme = theme
    get().persistUi({ theme })
  },

  toggleTheme: () => {
    get().setTheme(get().theme === 'dark' ? 'light' : 'dark')
  },
}))
