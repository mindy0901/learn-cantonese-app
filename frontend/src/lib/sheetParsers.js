function normalizeHeader(header) {
  return String(header ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Parse CSV text into rows, including quoted fields that contain newlines. */
function parseAllCsvRows(text) {
  const csvText = String(text ?? '').replace(/^\uFEFF/, '')
  const rows = []
  let row = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i]
    if (inQuotes) {
      if (ch === '"') {
        if (csvText[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(current)
      current = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && csvText[i + 1] === '\n') i++
      row.push(current)
      current = ''
      if (row.some((cell) => String(cell ?? '').trim().length > 0)) {
        rows.push(row.map((cell) => String(cell ?? '').trim()))
      }
      row = []
    } else {
      current += ch
    }
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current)
    if (row.some((cell) => String(cell ?? '').trim().length > 0)) {
      rows.push(row.map((cell) => String(cell ?? '').trim()))
    }
  }

  return rows
}

export function parseCsvText(text) {
  const allRows = parseAllCsvRows(text)
  if (allRows.length === 0) return { headers: [], rows: [], totalRows: 0 }

  return {
    headers: allRows[0],
    rows: allRows.slice(1),
    totalRows: allRows.length,
  }
}

export function extractSheetId(url) {
  const match = String(url).match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  return match?.[1] ?? null
}

export function extractGid(url) {
  const hashMatch = String(url).match(/[#&]gid=(\d+)/)
  if (hashMatch) return hashMatch[1]
  const queryMatch = String(url).match(/[?&]gid=(\d+)/)
  return queryMatch?.[1] ?? null
}

export function buildCsvExportUrl(sheetUrl) {
  const id = extractSheetId(sheetUrl)
  if (!id) throw new Error('INVALID_SHEET_URL')
  if (id.length < 20) throw new Error('INVALID_SHEET_URL')
  const gid = extractGid(sheetUrl)
  const base = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv`
  return gid != null ? `${base}&gid=${gid}` : base
}

function buildCsvExportCandidates(sheetUrl) {
  const id = extractSheetId(sheetUrl)
  if (!id || id.length < 20) throw new Error('INVALID_SHEET_URL')
  const gid = extractGid(sheetUrl)
  const exportBase = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv`
  const gvizBase = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv`
  if (gid != null) {
    return [`${exportBase}&gid=${gid}`, `${gvizBase}&gid=${gid}`]
  }
  return [exportBase, gvizBase]
}

function validateSheetUrl(sheetUrl) {
  const trimmed = sheetUrl.trim()
  if (!trimmed) {
    const err = new Error('NO_SHEET_URL')
    err.code = 'NO_SHEET_URL'
    throw err
  }
  const id = extractSheetId(trimmed)
  if (!id || id.length < 20) {
    const err = new Error('INVALID_SHEET_URL')
    err.code = 'INVALID_SHEET_URL'
    throw err
  }
  return trimmed
}

function isHtmlResponse(text) {
  const sample = text.slice(0, 512).trimStart().toLowerCase()
  return sample.startsWith('<!doctype html') || sample.startsWith('<html')
}

function mapFetchStatus(status) {
  if (status === 404) return 'SHEET_NOT_FOUND'
  if (status === 403 || status === 401) return 'SHEET_NOT_PUBLIC'
  return 'SHEET_HTTP_ERROR'
}

async function readCsvResponse(response) {
  if (!response.ok) {
    const err = new Error(`HTTP ${response.status}`)
    err.code = mapFetchStatus(response.status)
    err.status = response.status
    throw err
  }
  const text = await response.text()
  if (isHtmlResponse(text)) {
    const err = new Error('SHEET_NOT_PUBLIC')
    err.code = 'SHEET_NOT_PUBLIC'
    throw err
  }
  if (!text.trim()) {
    const err = new Error('EMPTY_SHEET')
    err.code = 'EMPTY_SHEET'
    throw err
  }
  return text
}

/** Fetch sheet CSV directly from Google (Check — no backend/cloud). */
export async function fetchGoogleSheetCsvDirect(sheetUrl) {
  const trimmed = validateSheetUrl(sheetUrl)
  const candidates = buildCsvExportCandidates(trimmed)
  let lastError = null

  for (const exportUrl of candidates) {
    try {
      const response = await fetch(exportUrl, { redirect: 'follow' })
      return await readCsvResponse(response)
    } catch (err) {
      if (err?.code && err.code !== 'SHEET_NOT_FOUND' && err.code !== 'SHEET_HTTP_ERROR') {
        throw err
      }
      lastError = err
    }
  }

  const err = lastError instanceof Error ? lastError : new Error('SHEET_NETWORK')
  err.code = err.code ?? 'SHEET_NETWORK'
  throw err
}

/** Fetch sheet CSV via backend proxy (fallback if browser fetch is blocked). */
export async function fetchGoogleSheetCsv(sheetUrl) {
  const trimmed = validateSheetUrl(sheetUrl)
  const API = import.meta.env.VITE_API_URL ?? ''
  const proxyUrl = `${API}/api/sheet/csv`
  let response
  try {
    response = await fetch(proxyUrl, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: trimmed }),
    })
  } catch {
    const err = new Error('SERVER_UNREACHABLE')
    err.code = 'SERVER_UNREACHABLE'
    throw err
  }

  if (!response.ok) {
    let payload = null
    try {
      payload = await response.json()
    } catch {
      /* non-json body */
    }
    const err = new Error(payload?.error ?? `HTTP ${response.status}`)
    if (payload?.code) {
      err.code = payload.code
    } else if (response.status === 404) {
      err.code = 'API_NOT_FOUND'
    } else {
      err.code = 'SHEET_HTTP_ERROR'
    }
    err.status = response.status
    throw err
  }

  return readCsvResponse(response)
}

export function mapColumns(headers, aliasMap) {
  const normalized = headers.map(normalizeHeader)
  const mapping = {}
  for (const [key, aliases] of Object.entries(aliasMap)) {
    const idx = normalized.findIndex((h) => aliases.some((a) => h === a || h.includes(a)))
    if (idx >= 0) mapping[key] = idx
  }
  return mapping
}

export function cell(row, index) {
  if (index == null || index < 0) return ''
  return String(row[index] ?? '').trim()
}

export function parseBool(value) {
  const v = String(value ?? '')
    .trim()
    .toLowerCase()
  if (!v) return undefined
  if (['1', 'true', 'yes', 'y', 'x', '✓', '★'].includes(v)) return true
  if (['0', 'false', 'no', 'n'].includes(v)) return false
  return undefined
}
