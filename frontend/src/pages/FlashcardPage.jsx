import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { FlashcardDeck } from '../components/FlashcardDeck.jsx'
import { FlashcardStatsPanel } from '../components/FlashcardStatsPanel.jsx'
import { FlashcardSessionSetup } from '../components/FlashcardSessionSetup.jsx'
import {
  useWordCount,
  useWordsRevision,
  useAppActions,
} from '../store/appStore.js'
import { useIsAdmin } from '../store/authStore.js'
import { withAdminHint } from '../lib/emptyMessage.js'
import { useLocale } from '../store/localeStore.js'
import { fetchFlashcardWords } from '../lib/flashcardWords.js'
import { btnClass } from '../components/ui/buttonStyles.js'

export function FlashcardPage() {
  const wordCount = useWordCount()
  const wordsRevision = useWordsRevision()
  const { mergeWords } = useAppActions()
  const { t, fmt } = useLocale()
  const isAdmin = useIsAdmin()
  const [sessionConfig, setSessionConfig] = useState(null)
  const [sessionWords, setSessionWords] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(null)

  const startSession = useCallback(
    async (config) => {
      setLoading(true)
      setLoadError(null)
      try {
        const words = await fetchFlashcardWords(config.sessionSize, {
          source: config.source,
          scope: config.scope,
          lessonId: config.lessonId,
          lesson: config.lesson,
          mergeWords,
          revision: wordsRevision,
          wordTotal: wordCount,
        })
        if (words.length === 0) {
          setLoadError(
            config.source === 'due' ? t.flashcard.noDueCards : t.flashcard.noCardsLeft,
          )
          return
        }
        setSessionConfig(config)
        setSessionWords(words)
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    },
    [mergeWords, wordsRevision, wordCount, t.flashcard.noDueCards, t.flashcard.noCardsLeft],
  )

  const resetSession = useCallback(() => {
    setSessionConfig(null)
    setSessionWords([])
    setLoadError(null)
  }, [])

  const playAgain = useCallback(() => {
    if (!sessionConfig) return Promise.resolve()
    return startSession(sessionConfig)
  }, [sessionConfig, startSession])

  if (wordCount === 0) {
    return (
      <main className="flex-1 max-w-[720px] w-full mx-auto px-5 py-8 pb-12">
        <div className="text-center py-12 px-6 text-text-muted flex flex-col items-center gap-4">
          <p>{withAdminHint(t.flashcard.empty, t.flashcard.emptyAdminHint, isAdmin)}</p>
          <Link to="/" className={btnClass('primary')}>{t.flashcard.goHome}</Link>
        </div>
      </main>
    )
  }

  return (
    <main className="flex-1 max-w-[720px] w-full mx-auto px-5 py-8 pb-12">
      <div className="flex items-start justify-between gap-4 mb-6 max-sm:flex-col">
        <div>
          <h1>{t.flashcard.title}</h1>
          <p className="mt-1 text-text-muted text-sm">
            {sessionConfig
              ? fmt(t.flashcard.sessionSubtitle, { count: sessionWords.length })
              : t.flashcard.chooseSize}
          </p>
        </div>
        {sessionConfig && (
          <button type="button" className={btnClass('ghost', 'sm')} onClick={resetSession}>
            {t.flashcard.newSession}
          </button>
        )}
      </div>

      {loadError && (
        <p className="px-4 py-3 rounded-lg text-sm bg-error-bg text-error-text border border-error-border mb-4" role="alert">
          {loadError}
        </p>
      )}

      {!sessionConfig ? (
        <div className="flex flex-col gap-5">
          <FlashcardStatsPanel />
          <FlashcardSessionSetup onStart={startSession} loading={loading} disabled={false} />
        </div>
      ) : (
        <FlashcardDeck
          words={sessionWords}
          cardMode={sessionConfig.cardMode}
          hideJyutping={sessionConfig.hideJyutping}
          loading={loading}
          onNewSession={resetSession}
          onPlayAgain={playAgain}
        />
      )}
    </main>
  )
}
