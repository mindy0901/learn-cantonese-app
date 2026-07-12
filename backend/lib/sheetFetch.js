export class SheetFetchError extends Error {
  constructor(code, message, status) {
    super(message)
    this.name = 'SheetFetchError'
    this.code = code
    this.status = status
  }
}

function extractSheetId(url) {
  const match = String(url).match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  return match?.[1] ?? null
}

/** Returns gid only when explicitly present in the pasted URL. */
function extractGid(url) {
  const hashMatch = String(url).match(/[#&]gid=(\d+)/)
  if (hashMatch) return hashMatch[1]
  const queryMatch = String(url).match(/[?&]gid=(\d+)/)
  return queryMatch?.[1] ?? null
}

export function validateSheetUrl(sheetUrl) {
  const id = extractSheetId(sheetUrl)
  if (!id) {
    throw new SheetFetchError(
      'INVALID_SHEET_URL',
      'Invalid Google Sheets URL. Paste the full link from your browser.',
    )
  }
  if (id.length < 20) {
    throw new SheetFetchError(
      'INVALID_SHEET_URL',
      'Sheet ID looks truncated. Copy the full URL from the browser address bar.',
    )
  }
  return { id, gid: extractGid(sheetUrl) }
}

export function buildCsvExportUrl(sheetUrl) {
  const { id, gid } = validateSheetUrl(sheetUrl)
  const base = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv`
  return gid != null ? `${base}&gid=${gid}` : base
}

function buildCsvExportCandidates(sheetUrl) {
  const { id, gid } = validateSheetUrl(sheetUrl)
  const exportBase = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv`
  const gvizBase = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv`
  if (gid != null) {
    return [`${exportBase}&gid=${gid}`, `${gvizBase}&gid=${gid}`]
  }
  return [exportBase, gvizBase]
}

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; CantoneseApp/1.0)',
  Accept: 'text/csv,text/plain,*/*',
}

function mapGoogleStatus(status) {
  if (status === 404) {
    return new SheetFetchError(
      'SHEET_NOT_FOUND',
      'Sheet or tab not found (404). Check the URL, tab (gid), and that the file still exists.',
      404,
    )
  }
  if (status === 403) {
    return new SheetFetchError(
      'SHEET_FORBIDDEN',
      'Access denied (403). Share the sheet as "Anyone with the link can view".',
      403,
    )
  }
  if (status === 401) {
    return new SheetFetchError(
      'SHEET_FORBIDDEN',
      'Sheet requires sign-in. Share as "Anyone with the link can view".',
      401,
    )
  }
  return new SheetFetchError(
    'SHEET_HTTP_ERROR',
    `Could not download sheet (HTTP ${status}). Check the URL and sharing settings.`,
    status,
  )
}

function isHtmlResponse(text) {
  const sample = text.slice(0, 512).trimStart().toLowerCase()
  return sample.startsWith('<!doctype html') || sample.startsWith('<html')
}

async function fetchCsvFromUrl(exportUrl) {
  let response
  try {
    response = await fetch(exportUrl, { redirect: 'follow', headers: FETCH_HEADERS })
  } catch {
    throw new SheetFetchError(
      'SHEET_NETWORK',
      'Network error while fetching the sheet. Check your connection.',
    )
  }

  if (!response.ok) {
    throw mapGoogleStatus(response.status)
  }

  const text = await response.text()
  if (isHtmlResponse(text)) {
    throw new SheetFetchError(
      'SHEET_NOT_PUBLIC',
      'Sheet is not publicly accessible. Set sharing to "Anyone with the link can view".',
    )
  }
  if (!text.trim()) {
    throw new SheetFetchError('EMPTY_SHEET', 'Sheet is empty or the selected tab has no data.')
  }
  return text
}

export async function fetchSheetCsvText(sheetUrl) {
  const candidates = buildCsvExportCandidates(sheetUrl)
  let lastError = null

  for (const exportUrl of candidates) {
    try {
      return await fetchCsvFromUrl(exportUrl)
    } catch (err) {
      if (!(err instanceof SheetFetchError)) throw err
      lastError = err
      if (err.code !== 'SHEET_NOT_FOUND' && err.code !== 'SHEET_HTTP_ERROR') {
        throw err
      }
    }
  }

  throw lastError ?? new SheetFetchError('SHEET_NOT_FOUND', 'Could not download sheet.', 404)
}
