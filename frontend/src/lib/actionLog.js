/** Compact frontend logs — same style as backend: "Update word: 你好" */

function emit(level, message) {
  const line = String(message ?? '').trim()
  if (!line) return
  if (level === 'warn') console.warn(line)
  else if (level === 'error') console.error(line)
  else console.log(line)
}

/** @param {unknown} subject */
export function subjectLabel(subject) {
  if (subject == null || subject === '') return ''
  if (typeof subject === 'string' || typeof subject === 'number' || typeof subject === 'boolean') {
    return String(subject).trim()
  }
  if (typeof subject !== 'object') return ''

  const o = /** @type {Record<string, unknown>} */ (subject)

  const han = o.hanTraditional ?? o.han_traditional ?? o.hanTrad ?? o.han
  if (typeof han === 'string' && han.trim()) return han.trim()

  if (typeof o.title === 'string' && o.title.trim()) return o.title.trim()
  if (typeof o.name === 'string' && o.name.trim()) return o.name.trim()

  if (typeof o.email === 'string' && o.email.trim()) {
    return o.email.split('@')[0] || o.email
  }

  if (typeof o.locale === 'string') return o.locale
  if (typeof o.theme === 'string') return o.theme
  if (typeof o.rating === 'string' || typeof o.rating === 'number') return String(o.rating)
  if ('popularity' in o) return String(o.popularity ?? 'null')
  if ('studyProgress' in o) return String(o.studyProgress)
  if (typeof o.type === 'string' && o.type.trim()) return o.type.trim()

  if ('signedIn' in o) {
    if (o.signedIn && typeof o.email === 'string') return o.email.split('@')[0] || 'signed in'
    return o.signedIn ? 'signed in' : 'guest'
  }

  if (typeof o.error === 'string' && o.error.trim()) return o.error.trim()
  if (typeof o.path === 'string' && o.path.trim()) return o.path.trim()

  for (const key of ['wordId', 'grammarId', 'sentenceId', 'lessonId', 'id']) {
    if (o[key] != null && o[key] !== '') return `#${String(o[key]).slice(0, 8)}`
  }

  if (typeof o.loaded === 'number' && typeof o.wordTotal === 'number') {
    return `${o.loaded}/${o.wordTotal}`
  }
  if (typeof o.wordCount === 'number') return String(o.wordCount)
  if (typeof o.total === 'number') return String(o.total)

  return ''
}

/** Main log: `log("Update word", word)` → "Update word: 你好" */
export function log(message, subject) {
  const label = subjectLabel(subject)
  emit('info', label ? `${message}: ${label}` : message)
}

export function logWarn(message, detail) {
  const label = subjectLabel(detail)
  emit('warn', label ? `${message}: ${label}` : message)
}

export function logError(message, detail) {
  const label = subjectLabel(detail)
  emit('error', label ? `${message}: ${label}` : message)
}

/** @deprecated Prefer `log` */
export function logAction(message, subject) {
  log(message, subject)
}

export function logApiError(method, path, error) {
  const msg = error instanceof Error ? error.message : String(error ?? 'error')
  const status =
    error && typeof error === 'object' && 'status' in error && error.status != null
      ? error.status
      : null
  logError(
    'API failed',
    status != null ? `${method} ${path} (${status}) — ${msg}` : `${method} ${path} — ${msg}`,
  )
}
