import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useWords, useLesson, useAppActions } from '../store/appStore.js'
import { useLocale } from '../store/localeStore.js'
import { useIsAdmin, useIsSignedIn } from '../store/authStore.js'
import { WordFieldText } from '../components/WordFieldText.jsx'
import { hanTextClassName } from '../lib/wordPopularity.js'
import { HanziiHanCellLink } from '../components/HanziiHanCellLink.jsx'
import { btnClass } from '../components/ui/buttonStyles.js'
import { cn } from '../lib/cn.js'
import { useOpenWordDetail } from '../hooks/useOpenWordDetail.js'
import { logWarn } from '../lib/actionLog.js'

export function LessonDetailPage() {
  const { id } = useParams()
  const words = useWords()
  const lesson = useLesson(id)
  const { toggleLessonGrammarMastered, ensureWordsByIds } = useAppActions()
  const { t, fmt } = useLocale()
  const isAdmin = useIsAdmin()
  const canMark = useIsSignedIn()
  const openWordDetail = useOpenWordDetail()
  const [hideMastered, setHideMastered] = useState(true)

  useEffect(() => {
    if (!lesson?.wordIds?.length) return
    ensureWordsByIds(lesson.wordIds).catch((err) => {
      logWarn("Load lesson words failed", err instanceof Error ? err.message : err)
    })
  }, [lesson, ensureWordsByIds])

  if (!lesson) {
    return (
      <main className="flex-1 max-w-[1080px] w-full mx-auto px-5 py-8 pb-12">
        <div className="text-center py-12 px-6 text-text-muted flex flex-col items-center gap-4">
          <p>{t.lessons.notFound}</p>
          <Link to="/lessons" className={btnClass('primary')}>{t.lessons.backToList}</Link>
        </div>
      </main>
    )
  }

  const lessonWords = lesson.wordIds.map((wid) => words.find((w) => w.id === wid)).filter(Boolean)
  const visibleWords = hideMastered ? lessonWords.filter((w) => !w.mastered) : lessonWords
  const grammarSections = lesson.grammar.filter((g) => g.title.trim() || g.content.trim())
  const visibleGrammar = hideMastered ? grammarSections.filter((g) => !g.mastered) : grammarSections
  const masteredWordCount = lessonWords.filter((w) => w.mastered).length

  return (
    <main className="flex-1 max-w-[1080px] w-full mx-auto px-5 py-8 pb-12">
      <div className="flex items-start justify-between gap-4 mb-6 max-sm:flex-col">
        <div>
          <h1>{lesson.name}</h1>
          <p className="mt-1 text-text-muted text-sm">
            {fmt(t.lessonDetail.meta, { words: lessonWords.length, grammar: grammarSections.length })}
            {masteredWordCount > 0 && ` · ${fmt(t.lessonDetail.masteredCount, { count: masteredWordCount })}`}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {isAdmin && (
            <Link to={`/lessons/${lesson.id}/edit`} className={btnClass('outline')}>{t.common.edit}</Link>
          )}
        </div>
      </div>

      <div className="mb-4">
        <label className="flex flex-row items-center gap-1.5 text-[0.8125rem] text-text-muted cursor-pointer">
          <input type="checkbox" checked={hideMastered} onChange={(e) => setHideMastered(e.target.checked)} />
          {hideMastered ? t.lessonDetail.hideMastered : t.lessonDetail.showMastered}
        </label>
      </div>

      <section className="bg-surface border border-border rounded-xl px-5 sm:px-6 py-5 mb-5 shadow-theme-sm [&_h2]:mb-3">
        <h2>{t.lessonDetail.vocabTitle}</h2>
        {visibleWords.length === 0 ? (
          <p className="text-text-muted text-sm">{hideMastered && lessonWords.length > 0 ? t.lessonDetail.allWordsMastered : t.lessonDetail.noVocab}</p>
        ) : (
          <div className="overflow-auto border border-border rounded-xl bg-surface">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="px-3.5 py-2.5 text-left border-b border-border bg-bg text-text-muted font-medium text-xs uppercase tracking-wide">{t.wordBank.colHanViet}</th>
                  <th className="px-3.5 py-2.5 text-left border-b border-border bg-bg text-text-muted font-medium text-xs uppercase tracking-wide">{t.wordBank.colHanTraditional}</th>
                  <th className="px-3.5 py-2.5 text-left border-b border-border bg-bg text-text-muted font-medium text-xs uppercase tracking-wide">{t.wordBank.colJyutping}</th>
                  <th className="px-3.5 py-2.5 text-left border-b border-border bg-bg text-text-muted font-medium text-xs uppercase tracking-wide">{t.wordBank.colVietnamese}</th>
                  <th className="px-3.5 py-2.5 text-left border-b border-border bg-bg text-text-muted font-medium text-xs uppercase tracking-wide">{t.wordBank.colEnglish}</th>
                  {canMark && <th className="px-3.5 py-2.5 text-left border-b border-border bg-bg text-text-muted font-medium text-xs uppercase tracking-wide">{t.wordBank.colStar}</th>}
                </tr>
              </thead>
              <tbody className="[&_tr:last-child]:border-b-0">
                {visibleWords.map((word) => (
                  <tr
                    key={word.id}
                    className={cn(
                      'border-b border-border cursor-pointer hover:bg-accent-bg',
                      word.mastered && 'opacity-75',
                    )}
                    onClick={() => openWordDetail(word)}
                    title={t.wordBank.clickToView}
                  >
                    <td className="px-3.5 py-2.5 align-middle">
                      <WordFieldText word={word} field="hanViet" updatingLabel={t.wordBank.fieldUpdating} />
                    </td>
                    <td className={cn('px-3.5 py-2.5 align-middle', hanTextClassName(word.popularity))} onClick={(e) => e.stopPropagation()}>
                      <HanziiHanCellLink hanTraditional={word.hanTraditional} popularity={word.popularity} />
                    </td>
                    <td className="px-3.5 py-2.5 align-middle text-jyutping font-semibold text-[calc(0.9375rem*var(--jyutping-scale))] leading-snug tracking-wide whitespace-pre-line">{word.jyutping ?? '—'}</td>
                    <td className="px-3.5 py-2.5 align-middle text-viet">
                      <WordFieldText word={word} field="vietnamese" updatingLabel={t.wordBank.fieldUpdating} />
                    </td>
                    <td className="px-3.5 py-2.5 align-middle leading-snug">
                      <WordFieldText word={word} field="english" updatingLabel={t.wordBank.fieldUpdating} />
                    </td>
                    {canMark && <td className="px-3.5 py-2.5 align-middle">{word.important ? '★' : ''}{word.mastered ? ' ✓' : ''}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="bg-surface border border-border rounded-xl px-5 sm:px-6 py-5 mb-5 shadow-theme-sm [&_h2]:mb-3">
        <h2>{t.lessonDetail.grammarTitle}</h2>
        {visibleGrammar.length === 0 ? (
          <p className="text-text-muted text-sm">{hideMastered && grammarSections.length > 0 ? t.lessonDetail.allGrammarMastered : t.lessonDetail.noGrammar}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {visibleGrammar.map((section) => (
              <article
                key={section.id}
                className={cn(
                  'px-5 py-4 border border-border rounded-[0.625rem] bg-bg',
                  section.mastered && 'opacity-80 border-success-border',
                )}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h3 className="text-base m-0 text-text-h">{section.title || t.lessonDetail.untitled}</h3>
                  {canMark && (
                    <button
                      type="button"
                      className={cn(btnClass('ghost', 'sm'), section.mastered && 'text-success-text')}
                      onClick={() => toggleLessonGrammarMastered(lesson.id, section.id)}
                    >
                      {section.mastered ? t.lessonDetail.unmarkGrammarMastered : t.lessonDetail.markGrammarMastered}
                    </button>
                  )}
                </div>
                <p className="whitespace-pre-wrap text-text text-[0.9375rem] leading-relaxed m-0">{section.content}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <Link to="/lessons" className={btnClass('ghost')}>{t.lessonDetail.back}</Link>
    </main>
  )
}
