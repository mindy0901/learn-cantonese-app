export const FLASHCARD_PROGRESS_DELTA = {
  hard: 10,
  medium: 25,
  easy: 40,
}

/** Days without review before high progress decays on hard/medium ratings. */
export const STALE_STUDY_DAYS = 3

const MS_PER_DAY = 24 * 60 * 60 * 1000

export function clampStudyProgress(value) {
  const n = Math.round(Number(value) || 0)
  return Math.max(0, Math.min(100, n))
}

/**
 * True when progress is above the rating floor and the word has not been studied recently.
 */
export function isStaleHighProgress(studyProgress, lastStudiedAt, now = Date.now()) {
  const progress = clampStudyProgress(studyProgress)
  if (progress <= FLASHCARD_PROGRESS_DELTA.hard) return false

  if (!lastStudiedAt) return true

  const studiedMs = new Date(lastStudiedAt).getTime()
  if (!Number.isFinite(studiedMs)) return true

  return now - studiedMs >= STALE_STUDY_DAYS * MS_PER_DAY
}

/**
 * @param {number} current
 * @param {'again'|'hard'|'medium'|'easy'|'mastered'} rating
 * @param {{ lastStudiedAt?: string, now?: number }} [options]
 */
export function nextStudyProgress(current, rating, { lastStudiedAt, now } = {}) {
  const base = clampStudyProgress(current)
  if (rating === 'again') return 0
  if (rating === 'mastered') return 100

  const floor = FLASHCARD_PROGRESS_DELTA[rating] ?? 0
  const stale = isStaleHighProgress(base, lastStudiedAt, now)

  if (stale && (rating === 'hard' || rating === 'medium') && base > floor) {
    return floor
  }

  return clampStudyProgress(base + floor)
}
