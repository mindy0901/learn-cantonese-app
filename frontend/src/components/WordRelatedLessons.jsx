import { Link } from 'react-router-dom'
import { useLocale } from '../store/localeStore.js'

export function WordRelatedLessons({ lessons }) {
  const { t } = useLocale()

  if (!lessons?.length) return null

  return (
    <section className="w-full min-w-0 pt-4 text-left">
      <h4 className="m-0 mb-3 text-center text-sm font-semibold uppercase tracking-wide text-text-muted">
        {t.wordDetail.relatedLessons}
      </h4>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {lessons.map((lesson) => (
          <li key={lesson.id}>
            <Link
              to={`/lessons/${lesson.id}`}
              className="block w-full rounded-xl border border-border/70 bg-bg/50 px-4 py-3 no-underline transition-colors hover:border-accent-border hover:bg-accent-bg/40"
            >
              <p className="m-0 font-semibold text-text-h">{lesson.name}</p>
              <p className="m-0 mt-1 text-sm text-text-muted">
                {lesson.wordIds.length} {t.lessons.newWords}
                {lesson.grammar?.length > 0 && ` · ${lesson.grammar.length} ${t.lessons.grammar}`}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
