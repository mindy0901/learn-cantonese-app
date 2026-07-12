import { log } from './actionLog.js'

const STORAGE_KEY = 'cantonese-app-sheet-urls'

const DEFAULTS = {
  wordsSheetUrl: '',
  grammarSheetUrl: '',
  lessonsSheetUrl: '',
}

export function loadSheetUrls() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSheetUrls(patch) {
  log("Save sheet URLs", Object.keys(patch).join(", "))
  const next = { ...loadSheetUrls(), ...patch }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}

export function getSheetUrlForType(type) {
  const urls = loadSheetUrls()
  if (type === 'words') return urls.wordsSheetUrl
  if (type === 'grammar') return urls.grammarSheetUrl
  if (type === 'lessons') return urls.lessonsSheetUrl
  return ''
}
