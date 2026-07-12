/**
 * Central action logger for frontend browser/dev terminal output.
 * All logs use English labels for easy filtering.
 */
export function logAction(action, details = {}) {
  const timestamp = new Date().toISOString()
  console.log(`[Frontend Action] ${action}`, { timestamp, ...details })
}

export function logApiCall(method, path, details = {}) {
  logAction('API call started', { method, path, ...details })
}

export function logApiResult(method, path, details = {}) {
  logAction('API call completed', { method, path, ...details })
}

export function logApiError(method, path, error, details = {}) {
  logAction('API call failed', {
    method,
    path,
    error: error instanceof Error ? error.message : String(error),
    ...details,
  })
}
