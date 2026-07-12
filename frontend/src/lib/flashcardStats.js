const STORAGE_KEY = 'cantonese-flashcard-stats'

const EMPTY = {
  firstPlayedAt: null,
  lastPlayedAt: null,
  activeDates: [],
  totalSessions: 0,
  totalCardsReviewed: 0,
  totalMastered: 0,
  totalAgain: 0,
}

function toDateKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function parseDateKey(key) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function daysBetween(a, b) {
  const ms = parseDateKey(b).getTime() - parseDateKey(a).getTime()
  return Math.round(ms / 86_400_000)
}

export function loadFlashcardStats() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...EMPTY }
    const parsed = JSON.parse(raw)
    return {
      ...EMPTY,
      ...parsed,
      activeDates: Array.isArray(parsed.activeDates) ? [...parsed.activeDates] : [],
    }
  } catch {
    return { ...EMPTY }
  }
}

function saveFlashcardStats(stats) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stats))
}

export function computeStreak(activeDates) {
  if (!activeDates.length) return 0
  const sorted = [...new Set(activeDates)].sort()
  const today = toDateKey()
  const yesterday = toDateKey(new Date(Date.now() - 86_400_000))
  const last = sorted[sorted.length - 1]
  if (last !== today && last !== yesterday) return 0

  let streak = 1
  for (let i = sorted.length - 1; i > 0; i--) {
    if (daysBetween(sorted[i - 1], sorted[i]) === 1) streak++
    else break
  }
  return streak
}

export function getFlashcardStatsView(stats = loadFlashcardStats()) {
  const today = toDateKey()
  const activeDays = stats.activeDates.length
  const streak = computeStreak(stats.activeDates)
  const lastPlayedAt = stats.lastPlayedAt
  const offlineDays =
    !lastPlayedAt ? null : lastPlayedAt === today ? 0 : daysBetween(lastPlayedAt, today)

  return {
    ...stats,
    activeDays,
    streak,
    offlineDays,
    practicedToday: lastPlayedAt === today,
  }
}

/** @param {Array<{ outcome: string }>} entries */
export function recordFlashcardSession(entries) {
  const stats = loadFlashcardStats()
  const today = toDateKey()
  const mastered = entries.filter((e) => e.outcome === 'mastered').length
  const again = entries.filter((e) => e.outcome === 'again').length

  const activeDates = new Set(stats.activeDates)
  activeDates.add(today)

  const next = {
    firstPlayedAt: stats.firstPlayedAt ?? today,
    lastPlayedAt: today,
    activeDates: [...activeDates].sort(),
    totalSessions: stats.totalSessions + 1,
    totalCardsReviewed: stats.totalCardsReviewed + entries.length,
    totalMastered: stats.totalMastered + mastered,
    totalAgain: stats.totalAgain + again,
  }

  saveFlashcardStats(next)
  return getFlashcardStatsView(next)
}
