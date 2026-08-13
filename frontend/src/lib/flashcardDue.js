import { STALE_STUDY_DAYS, clampStudyProgress } from './flashcardProgress.js'

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Word needs review: partial progress and not studied within the stale window. */
export function isWordDueForReview(word, now = Date.now()) {
  if (!word || word.mastered) return false

  const progress = clampStudyProgress(word.studyProgress ?? 0)
  if (progress <= 0 || progress >= 100) return false

  const lastStudiedAt = word.studyProgressAt
  if (!lastStudiedAt) return true

  const studiedMs = new Date(lastStudiedAt).getTime()
  if (!Number.isFinite(studiedMs)) return true

  return now - studiedMs >= STALE_STUDY_DAYS * MS_PER_DAY
}

export function isLowProgressWord(word, maxProgress = 49) {
  if (!word || word.mastered) return false
  return clampStudyProgress(word.studyProgress ?? 0) <= maxProgress
}

export function matchesFlashcardScope(word, scope) {
  if (!word || word.mastered) return false
  if (scope === 'important') return Boolean(word.important)
  if (scope === 'lowProgress') return isLowProgressWord(word)
  return true
}

export function compareDueWords(a, b) {
  const aTime = a.studyProgressAt ? new Date(a.studyProgressAt).getTime() : 0
  const bTime = b.studyProgressAt ? new Date(b.studyProgressAt).getTime() : 0
  if (aTime !== bTime) return aTime - bTime
  return String(a.id).localeCompare(String(b.id))
}
