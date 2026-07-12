import { Link } from 'react-router-dom'
import {
  useWordCount,
  useLessonCount,
  useMasteredWordCount,
  useGrammarCount,
  useLessons,
} from '../store/appStore.js'
import { useLocale } from '../store/localeStore.js'
import { FlashcardStatsPanel } from '../components/FlashcardStatsPanel.jsx'
import { btnClass } from '../components/ui/buttonStyles.js'

export function HomePage() {
  const wordCount = useWordCount()
  const grammarCount = useGrammarCount()
  const lessonCount = useLessonCount()
  const masteredCount = useMasteredWordCount()
  const lessons = useLessons()
  const { t, fmt } = useLocale()

  const remaining = wordCount - masteredCount
  const recentLessons = [...lessons]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 4)

  return (
    <main className="flex-1 max-w-[1080px] w-full mx-auto px-5 py-8 pb-12">
      <section className="mb-6">
        <FlashcardStatsPanel />
      </section>

      <section className="mb-6">
        <h2 className="text-base mb-3">{t.home.quickNav}</h2>
        <div className="grid grid-cols-5 max-[900px]:grid-cols-2 max-[640px]:grid-cols-1 gap-3">
          <Link
            to="/words"
            className="flex flex-col gap-1 p-4 bg-surface border border-border rounded-xl no-underline text-text-h shadow-sm transition-[border-color,transform] duration-150 hover:border-accent-border hover:-translate-y-px"
          >
            <span className="text-2xl" aria-hidden="true">
              ☰
            </span>
            <span className="font-semibold">{t.home.goWordBank}</span>
            <span className="text-[0.8125rem] text-text-muted">
              {fmt(t.home.wordCountMeta, { count: wordCount })}
            </span>
          </Link>
          <Link
            to="/grammar"
            className="flex flex-col gap-1 p-4 bg-surface border border-border rounded-xl no-underline text-text-h shadow-sm transition-[border-color,transform] duration-150 hover:border-accent-border hover:-translate-y-px"
          >
            <span className="text-2xl" aria-hidden="true">
              ¶
            </span>
            <span className="font-semibold">{t.home.goGrammar}</span>
            <span className="text-[0.8125rem] text-text-muted">
              {fmt(t.home.grammarCountMeta, { count: grammarCount })}
            </span>
          </Link>
          <Link
            to="/lessons"
            className="flex flex-col gap-1 p-4 bg-surface border border-border rounded-xl no-underline text-text-h shadow-sm transition-[border-color,transform] duration-150 hover:border-accent-border hover:-translate-y-px"
          >
            <span className="text-2xl" aria-hidden="true">
              📖
            </span>
            <span className="font-semibold">{t.home.goLessons}</span>
            <span className="text-[0.8125rem] text-text-muted">
              {fmt(t.home.lessonCountMeta, { count: lessonCount })}
            </span>
          </Link>
          <Link
            to="/flashcard"
            className="flex flex-col gap-1 p-4 border border-accent-border rounded-xl no-underline text-text-h bg-accent-bg shadow-sm transition-[border-color,transform] duration-150 hover:border-accent-border hover:-translate-y-px"
          >
            <span className="text-2xl" aria-hidden="true">
              🃏
            </span>
            <span className="font-semibold">{t.home.goFlashcard}</span>
            <span className="text-[0.8125rem] text-text-muted">
              {fmt(t.home.flashcardMeta, { remaining })}
            </span>
          </Link>
          <Link
            to="/lookup"
            className="flex flex-col gap-1 p-4 bg-surface border border-border rounded-xl no-underline text-text-h shadow-sm transition-[border-color,transform] duration-150 hover:border-accent-border hover:-translate-y-px"
          >
            <span className="text-2xl" aria-hidden="true">
              字
            </span>
            <span className="font-semibold">{t.home.goHanLookup}</span>
            <span className="text-[0.8125rem] text-text-muted">{t.hanLookup.title}</span>
          </Link>
        </div>
      </section>

      {recentLessons.length > 0 && (
        <section className="mb-6">
          <h2 className="text-base mb-3">{t.home.recentLessons}</h2>
          <ul className="list-none m-0 p-0 flex flex-col gap-2">
            {recentLessons.map((lesson) => (
              <li
                key={lesson.id}
                className="flex items-center justify-between gap-3 px-4 py-3 bg-surface border border-border rounded-[10px]"
              >
                <Link
                  to={`/lessons/${lesson.id}`}
                  className="flex-1 flex flex-col gap-0.5 no-underline text-text-h font-medium"
                >
                  <span>{lesson.name}</span>
                  <span className="text-[0.8125rem] text-text-muted font-normal">
                    {lesson.wordIds.length} {t.lessons.newWords}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex justify-center gap-3 mb-10 flex-wrap">
        <Link to="/flashcard" className={btnClass('primary', 'lg')}>
          <span aria-hidden="true">🃏</span> {t.home.startFlashcard}
        </Link>
      </section>
    </main>
  )
}
