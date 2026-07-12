import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { WordDetailContent } from '../components/WordDetailContent.jsx'
import { useAppActions, useLessons, useWords } from '../store/appStore.js'
import { useLocale } from '../store/localeStore.js'
import { useIsAdmin, useIsSignedIn } from '../store/authStore.js'
import { ButtonLink } from '../components/ui/Button.jsx'
import { wordDetailPath } from '../lib/wordRoutes.js'
import { log, logWarn } from '../lib/actionLog.js'

export function WordDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const words = useWords()
  const lessons = useLessons()
  const {
    ensureWordsByIds,
    toggleImportant,
    toggleMastered,
    setWordPopularity,
    editWord,
  } = useAppActions()
  const { t } = useLocale()
  const isAdmin = useIsAdmin()
  const canMark = useIsSignedIn()
  const [resolving, setResolving] = useState(true)

  useEffect(() => {
    if (!id) {
      setResolving(false)
      return
    }
    let cancelled = false
    setResolving(true)
    log("Get word detail", id)
    ensureWordsByIds([id])
      .catch((err) => {
        logWarn("Get word detail failed", err instanceof Error ? err.message : err)
      })
      .finally(() => {
        if (!cancelled) setResolving(false)
      })
    return () => {
      cancelled = true
    }
  }, [id, ensureWordsByIds])

  const word = useMemo(() => words.find((w) => w.id === id), [words, id])
  const relatedLessons = useMemo(
    () => lessons.filter((lesson) => lesson.wordIds.includes(id)),
    [lessons, id],
  )

  const handleNextRandom = useCallback(() => {
    const pool = words.filter((w) => w.id !== id)
    if (pool.length === 0) return
    const next = pool[Math.floor(Math.random() * pool.length)]
    navigate(wordDetailPath(next.id))
  }, [words, id, navigate])

  if (resolving && !word) {
    return (
      <main className="flex-1 max-w-[1080px] w-full mx-auto px-5 py-8 pb-12">
        <p className="text-text-muted text-sm">{t.common.loading}</p>
      </main>
    )
  }

  if (!word) {
    return (
      <main className="flex-1 max-w-[1080px] w-full mx-auto px-5 py-8 pb-12">
        <div className="text-center py-12 px-6 text-text-muted flex flex-col items-center gap-4">
          <p>{t.wordDetail.notFound}</p>
          <ButtonLink to="/words" variant="primary" preventScrollReset>
            {t.wordDetail.backToWordBank}
          </ButtonLink>
        </div>
      </main>
    )
  }

  return (
    <main className="flex-1 max-w-[1080px] w-full mx-auto px-5 py-8 pb-12">
      <div className="mb-6">
        <ButtonLink to="/words" variant="ghost" preventScrollReset>
          ← {t.wordDetail.backToWordBank}
        </ButtonLink>
      </div>

      <section className="flex min-h-[var(--word-detail-card-min-height)] flex-col rounded-xl border border-border bg-surface px-5 py-7 shadow-theme-sm sm:px-8 sm:py-8">
        <WordDetailContent
          word={words.find((w) => w.id === word.id) ?? word}
          relatedLessons={relatedLessons}
          canEdit={isAdmin}
          onSave={isAdmin ? editWord : undefined}
          onNextRandom={words.length > 1 ? handleNextRandom : undefined}
          {...(canMark && {
            onToggleImportant: toggleImportant,
            onToggleMastered: toggleMastered,
            onSetPopularity: setWordPopularity,
          })}
        />
      </section>
    </main>
  )
}
