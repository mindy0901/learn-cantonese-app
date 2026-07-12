import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  resolveHanLookup,
  searchWordsForLookup,
  wordLookupDisplay,
} from '../lib/hanLookup.js'
import { isLatinSearchQuery, searchCedictByEnglish } from '../lib/cedictLookup.js'
import { displayRomanization } from '../lib/hanScriptDisplay.js'
import { useLocale } from '../store/localeStore.js'
import { HanVariantsInline } from '../components/HanVariantsInline.jsx'
import { Pagination } from '../components/Pagination.jsx'
import { BankSearchInput } from '../components/BankSearchInput.jsx'
import { CEDICT_PAGE_SIZE, LOOKUP_PAGE_SIZE } from '../lib/constants.js'
import { hanziiWordUrl } from '../lib/hanzii.js'
import { cn } from '../lib/cn.js'
import { btnClass } from '../components/ui/buttonStyles.js'
import { bankSearchInputClass } from '../components/ui/bankToolbarStyles.js'
import { WordFieldText } from '../components/WordFieldText.jsx'
import { useOpenWordDetail } from '../hooks/useOpenWordDetail.js'

const resultHanClass =
  'text-[clamp(1.75rem,5vw,2.5rem)] font-semibold text-han leading-tight [font-size:calc(clamp(1.75rem,5vw,2.5rem)*var(--han-scale))]'

function CopyButton({ text, label }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    const value = String(text ?? '').trim()
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      type="button"
      className={btnClass('outline', 'sm')}
      onClick={handleCopy}
      disabled={!String(text ?? '').trim()}
      aria-label={label}
    >
      {copied ? '✓' : '⎘'}
    </button>
  )
}

function VariantCard({ title, value, copyLabel }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h3 className="m-0 text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</h3>
        <CopyButton text={value} label={copyLabel} />
      </div>
      <p className={cn('m-0 break-all', resultHanClass)}>{value || '—'}</p>
    </div>
  )
}

function LookupResultRow({ word, onOpen }) {
  const { t } = useLocale()
  const display = wordLookupDisplay(word)
  const romanization = displayRomanization(word)

  return (
    <button
      type="button"
      className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-left transition-[border-color,background] duration-150 hover:border-accent-border hover:bg-accent-bg/40"
      onClick={() => onOpen(word)}
    >
      <HanVariantsInline
        traditional={display.traditional}
        simplified={display.simplified}
        popularity={word.popularity}
        size="md"
      />

      {romanization && (
        <div className="mt-2 text-sm tabular-nums">
          <span className="text-jyutping font-semibold not-italic">{romanization}</span>
        </div>
      )}

      <div className="mt-2 flex flex-col gap-0.5 text-sm text-text-h">
        <WordFieldText word={word} field="vietnamese" updatingLabel={t.wordBank.fieldUpdating} />
        <WordFieldText
          word={word}
          field="english"
          updatingLabel={t.wordBank.fieldUpdating}
          className="text-text-muted"
        />
      </div>
    </button>
  )
}

function CedictResultRow({ entry, locale }) {
  const { t, fmt } = useLocale()
  const hanziiUrl = hanziiWordUrl(entry.traditional, locale)

  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <HanVariantsInline traditional={entry.traditional} simplified={entry.simplified} size="md" />

      {entry.pinyin && (
        <div className="mt-2 text-sm tabular-nums">
          <span className="text-pinyin font-semibold not-italic">{entry.pinyin}</span>
        </div>
      )}

      <ul className="mt-2 list-disc pl-5 text-sm text-text-muted space-y-0.5">
        {(entry.english ?? []).map((gloss) => (
          <li key={gloss}>{gloss}</li>
        ))}
      </ul>

      {hanziiUrl && (
        <p className="mt-3 mb-0">
          <a
            href={hanziiUrl}
            className="text-xs font-medium text-accent no-underline hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            {fmt(t.hanLookup.openHanzii, { hanTraditional: entry.traditional })} ↗
          </a>
        </p>
      )}
    </div>
  )
}

export function HanLookupPage() {
  const { t, fmt, locale } = useLocale()
  const openWordDetail = useOpenWordDetail()
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [matches, setMatches] = useState([])
  const [cedictMatches, setCedictMatches] = useState([])
  const [cedictError, setCedictError] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)
  const [cedictLoading, setCedictLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [cedictPage, setCedictPage] = useState(1)

  const handleDebouncedSearch = useCallback((value) => setDebouncedSearch(value), [])

  const query = debouncedSearch.trim()
  const conversion = useMemo(() => resolveHanLookup(query), [query])
  const showCedict = isLatinSearchQuery(query)

  const totalPages = Math.max(1, Math.ceil(matches.length / LOOKUP_PAGE_SIZE))
  const pagedMatches = useMemo(() => {
    const start = (page - 1) * LOOKUP_PAGE_SIZE
    return matches.slice(start, start + LOOKUP_PAGE_SIZE)
  }, [matches, page])

  const cedictTotalPages = Math.max(1, Math.ceil(cedictMatches.length / CEDICT_PAGE_SIZE))
  const pagedCedictMatches = useMemo(() => {
    const start = (cedictPage - 1) * CEDICT_PAGE_SIZE
    return cedictMatches.slice(start, start + CEDICT_PAGE_SIZE)
  }, [cedictMatches, cedictPage])

  useEffect(() => {
    setPage(1)
    setCedictPage(1)
  }, [query])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  useEffect(() => {
    if (cedictPage > cedictTotalPages) setCedictPage(cedictTotalPages)
  }, [cedictPage, cedictTotalPages])

  useEffect(() => {
    if (!query) {
      setMatches([])
      setSearchLoading(false)
      return
    }

    let cancelled = false
    setSearchLoading(true)

    searchWordsForLookup(query)
      .then((items) => {
        if (!cancelled) setMatches(items)
      })
      .catch(() => {
        if (!cancelled) setMatches([])
      })
      .finally(() => {
        if (!cancelled) setSearchLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [query])

  useEffect(() => {
    if (!query || !isLatinSearchQuery(query)) {
      setCedictMatches([])
      setCedictError('')
      setCedictLoading(false)
      return
    }

    let cancelled = false
    setCedictLoading(true)
    setCedictError('')

    searchCedictByEnglish(query)
      .then((items) => {
        if (!cancelled) {
          setCedictMatches(items)
          setCedictError('')
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setCedictMatches([])
          setCedictError(err instanceof Error ? err.message : String(err))
        }
      })
      .finally(() => {
        if (!cancelled) setCedictLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [query])

  const hanziiUrl = conversion?.traditional ? hanziiWordUrl(conversion.traditional, locale) : null
  const showBankResults = matches.length > 0 || (searchLoading && query)
  const showCedictResults =
    cedictError || cedictMatches.length > 0 || (cedictLoading && query && showCedict)

  return (
    <main className="flex-1 max-w-[920px] w-full mx-auto px-5 pt-8 pb-12">
      <header className="mb-6">
        <h1>{t.hanLookup.title}</h1>
        <p className="mt-2 text-sm text-text-muted max-w-[42rem]">{t.hanLookup.description}</p>
      </header>

      <section className="mb-6" aria-label={t.hanLookup.inputLabel}>
        <label htmlFor="han-lookup-input" className="mb-2 block text-sm font-medium text-text-h">
          {t.hanLookup.inputLabel}
        </label>
        <BankSearchInput
          id="han-lookup-input"
          className={bankSearchInputClass}
          onDebouncedChange={handleDebouncedSearch}
          placeholder={t.hanLookup.placeholder}
          autoFocus
        />
      </section>

      {conversion && (
        <section className="mb-8" aria-live="polite">
          <h2 className="text-base mb-3">{t.hanLookup.conversionTitle}</h2>
          {conversion.same ? (
            <VariantCard
              title={t.hanLookup.traditionalHk}
              value={conversion.traditional}
              copyLabel={t.hanLookup.copyTraditional}
            />
          ) : (
            <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <HanVariantsInline
                  traditional={conversion.traditional}
                  simplified={conversion.simplified}
                  size="lg"
                />
                <div className="flex gap-2">
                  <CopyButton
                    text={conversion.traditional}
                    label={t.hanLookup.copyTraditional}
                  />
                  <CopyButton
                    text={conversion.simplified}
                    label={t.hanLookup.copySimplified}
                  />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs uppercase tracking-wide text-text-muted">
                <span>
                  {t.hanLookup.traditionalHk}: {conversion.traditional}
                </span>
                <span>
                  {t.hanLookup.simplified}: {conversion.simplified}
                </span>
              </div>
            </div>
          )}
          {conversion.same && (
            <p className="mt-3 text-sm text-text-muted">{t.hanLookup.sameForm}</p>
          )}
          {hanziiUrl && (
            <p className="mt-4">
              <a
                href={hanziiUrl}
                className="text-sm font-medium text-accent no-underline hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                {fmt(t.hanLookup.openHanzii, { hanTraditional: conversion.traditional })} ↗
              </a>
            </p>
          )}
        </section>
      )}

      {query && (
        <section className="mb-8">
          <h2 className="text-base mb-3">
            {searchLoading
              ? t.hanLookup.searching
              : fmt(t.hanLookup.bankMatches, { count: matches.length })}
          </h2>

          {showBankResults ? (
            <div
              className={cn(
                'transition-opacity duration-150',
                searchLoading && 'pointer-events-none opacity-60',
              )}
            >
              {matches.length > 0 ? (
                <>
                  <ul className="list-none m-0 p-0 flex flex-col gap-2">
                    {pagedMatches.map((word) => (
                      <li key={word.id}>
                        <LookupResultRow word={word} onOpen={openWordDetail} />
                      </li>
                    ))}
                  </ul>
                  <Pagination
                    page={page}
                    totalPages={totalPages}
                    total={matches.length}
                    startIndex={(page - 1) * LOOKUP_PAGE_SIZE}
                    pageSize={LOOKUP_PAGE_SIZE}
                    onPageChange={setPage}
                  />
                </>
              ) : (
                <p className="text-sm text-text-muted">{t.common.loading}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-text-muted">{t.hanLookup.noBankMatches}</p>
          )}
        </section>
      )}

      {query && showCedict && (
        <section>
          <h2 className="text-base mb-1">
            {cedictLoading
              ? t.hanLookup.cedictSearching
              : fmt(t.hanLookup.cedictMatches, { count: cedictMatches.length })}
          </h2>
          <p className="mt-0 mb-3 text-xs text-text-muted">{t.hanLookup.cedictHint}</p>

          {cedictError ? (
            <p className="text-sm text-red-400">{fmt(t.hanLookup.cedictError, { error: cedictError })}</p>
          ) : showCedictResults ? (
            <div
              className={cn(
                'transition-opacity duration-150',
                cedictLoading && 'pointer-events-none opacity-60',
              )}
            >
              {cedictMatches.length > 0 ? (
                <>
                  <ul className="list-none m-0 p-0 flex flex-col gap-2">
                    {pagedCedictMatches.map((entry) => (
                      <li key={`${entry.traditional}|${entry.simplified}|${entry.pinyinNumbered}`}>
                        <CedictResultRow entry={entry} locale={locale} />
                      </li>
                    ))}
                  </ul>
                  <Pagination
                    page={cedictPage}
                    totalPages={cedictTotalPages}
                    total={cedictMatches.length}
                    startIndex={(cedictPage - 1) * CEDICT_PAGE_SIZE}
                    pageSize={CEDICT_PAGE_SIZE}
                    onPageChange={setCedictPage}
                  />
                </>
              ) : (
                <p className="text-sm text-text-muted">{t.common.loading}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-text-muted">{t.hanLookup.noCedictMatches}</p>
          )}
        </section>
      )}
    </main>
  )
}
