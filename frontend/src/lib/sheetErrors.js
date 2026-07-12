const ERROR_CODES = new Set([
  'INVALID_SHEET_URL',
  'SHEET_NOT_FOUND',
  'SHEET_FORBIDDEN',
  'SHEET_NOT_PUBLIC',
  'SHEET_NETWORK',
  'SHEET_HTTP_ERROR',
  'EMPTY_SHEET',
  'MISSING_COLUMNS',
  'SERVER_UNREACHABLE',
  'API_NOT_FOUND',
  'NO_SHEET_URL',
])

export function resolveSheetError(err, t) {
  const errors = t?.sheetUpdate?.errors ?? {}
  const code = err?.code
  if (code && ERROR_CODES.has(code) && errors[code]) {
    return errors[code]
  }
  if (err instanceof Error && err.message) {
    return err.message
  }
  return errors.UNKNOWN ?? 'An unknown error occurred.'
}

export function toSheetError(err, fallbackCode = 'UNKNOWN') {
  if (err?.code && ERROR_CODES.has(err.code)) return err
  const message = err instanceof Error ? err.message : String(err)
  if (message === 'NO_SHEET_URL') {
    return { code: 'NO_SHEET_URL', message }
  }
  if (message === 'EMPTY_SHEET') {
    return { code: 'EMPTY_SHEET', message }
  }
  if (message.includes('missing required columns') || message.includes('missing Name')) {
    return { code: 'MISSING_COLUMNS', message }
  }
  if (message.includes('Invalid Google Sheets URL')) {
    return { code: 'INVALID_SHEET_URL', message }
  }
  if (message.includes('Could not reach server')) {
    return { code: 'SERVER_UNREACHABLE', message }
  }
  if (message.includes('404')) {
    return { code: 'SHEET_NOT_FOUND', message }
  }
  if (message.includes('403') || message.includes('not publicly accessible')) {
    return { code: 'SHEET_NOT_PUBLIC', message }
  }
  return { code: fallbackCode, message }
}
