import { create } from 'zustand'

const STORAGE_KEY = 'cantonese-app-font-size'
const SIZES = ['sm', 'md', 'lg']

function loadFontSize() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw && SIZES.includes(raw)) return raw
  } catch { /* ignore */ }
  return 'sm'
}

function applyFontSize(size) {
  document.documentElement.setAttribute('data-font-size', size)
}

const initial = loadFontSize()
applyFontSize(initial)

export const useFontSizeStore = create((set) => ({
  fontSize: initial,

  setFontSize: (size) => {
    if (!SIZES.includes(size)) return
    localStorage.setItem(STORAGE_KEY, size)
    applyFontSize(size)
    set({ fontSize: size })
  },
}))

export { SIZES as FONT_SIZES }
