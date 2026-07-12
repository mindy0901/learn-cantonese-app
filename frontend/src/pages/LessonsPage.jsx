import { useMemo } from 'react'
import { SheetExportButton } from '../components/SheetExportButton.jsx'
import { SheetUpdateButton } from '../components/SheetUpdateButton.jsx'
import { Link } from 'react-router-dom'
import { useWordCount, useLessons, useAppActions } from '../store/appStore.js'
import { usePrefsStore, useLessonsPrefs } from '../store/prefsStore.js'
import { useLocale } from '../store/localeStore.js'
import { useConfirmDialog } from '../hooks/useConfirmDialog.jsx'
import { useIsAdmin } from '../store/authStore.js'
import { withAdminHint } from '../lib/emptyMessage.js'
import { getLessonsSortDirLabel, sortLessons } from '../lib/lessonFilters.js'
import { btnClass } from '../components/ui/buttonStyles.js'
import { cn } from '../lib/cn.js'
import { uiControlRowClass, uiSelectClass } from '../components/ui/controlStyles.js'

export function LessonsPage() {
  const wordCount = useWordCount()
  const lessons = useLessons()
  const { removeLesson } = useAppActions()
  const { t, fmt } = useLocale()
  const isAdmin = useIsAdmin()
  const { ask, dialog } = useConfirmDialog()
  const { sortKey, sortDir } = useLessonsPrefs()
  const setLessonsPrefs = usePrefsStore((s) => s.setLessonsPrefs)

  const sortedLessons = useMemo(
    () => sortLessons(lessons, sortKey, sortDir),
    [lessons, sortKey, sortDir],
  )

  const sortDirLabel = getLessonsSortDirLabel(sortKey, sortDir, t)

  const handleDeleteLesson = (lesson) => {
    ask({
      title: t.confirm.deleteTitle,
      message: fmt(t.confirm.deleteLesson, { label: lesson.name }),
      onConfirm: () => removeLesson(lesson.id),
    })
  }

  return (
    <main className="flex-1 max-w-[1080px] w-full mx-auto px-5 py-8 pb-12">
      <div className="flex items-start justify-between gap-4 mb-6 max-sm:flex-col">
        <div>
          <h1>{t.lessons.title}</h1>
          <p className="mt-1 text-text-muted text-sm">{t.lessons.subtitle}</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2 shrink-0">
            <SheetExportButton type="lessons" />
            <SheetUpdateButton type="lessons" />
            <Link to="/lessons/new" className={btnClass('primary')}>
              + {t.lessons.create}
            </Link>
          </div>
        )}
      </div>

      {wordCount === 0 ? (
        <div className="text-center py-12 px-6 text-text-muted flex flex-col items-center gap-4">
          <p>{withAdminHint(t.lessons.emptyWords, t.lessons.emptyWordsAdminHint, isAdmin)}</p>
          <Link to="/words" className={btnClass('primary')}>
            {t.lessons.goWordBank}
          </Link>
        </div>
      ) : lessons.length === 0 ? (
        <div className="text-center py-12 px-6 text-text-muted flex flex-col items-center gap-4">
          <p>{withAdminHint(t.lessons.emptyLessons, t.lessons.emptyLessonsAdminHint, isAdmin)}</p>
          {isAdmin && (
            <div className="flex gap-3">
              <SheetUpdateButton type="lessons" />
              <Link to="/lessons/new" className={btnClass('primary')}>
                {t.lessons.create}
              </Link>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className={cn(uiControlRowClass, 'mb-4')}>
              <select
                className={uiSelectClass}
                value={sortKey}
                onChange={(e) => {
                  const nextKey = e.target.value
                  setLessonsPrefs({
                    sortKey: nextKey,
                    ...(nextKey === 'createdAt' && sortKey !== 'createdAt' ? { sortDir: 'desc' } : {}),
                  })
                }}
                aria-label="Sort by"
              >
                <option value="name">{t.lessons.sortName}</option>
                <option value="createdAt">{t.wordBank.sortBy}: {t.sort.createdAt}</option>
              </select>
              <button
                type="button"
                className={btnClass('ghost', 'sm')}
                onClick={() => setLessonsPrefs({ sortDir: sortDir === 'asc' ? 'desc' : 'asc' })}
              >
                {sortDirLabel}
              </button>
          </div>
          <ul className="list-none m-0 p-0 flex flex-col gap-3">
            {sortedLessons.map((lesson) => (
              <li
                key={lesson.id}
                className={cn(
                  'flex items-center justify-between gap-4 px-6 py-5 bg-surface border border-border rounded-[0.625rem] transition-[border-color,box-shadow] duration-150',
                  'hover:border-accent-border hover:shadow-theme-sm max-sm:flex-col max-sm:items-start',
                )}
              >
                <Link to={`/lessons/${lesson.id}`} className="flex-1 min-w-0 flex flex-col gap-1.5 no-underline text-inherit group">
                  <h2 className="m-0 font-bold leading-tight text-text-h break-words [font-size:clamp(1.875rem,5vw,3rem)] group-hover:text-accent">
                    {lesson.name}
                  </h2>
                  <div className="text-[0.8125rem] text-text-muted flex gap-1.5">
                    <span>
                      {lesson.wordIds.length} {t.lessons.newWords}
                    </span>
                    <span>·</span>
                    <span>
                      {lesson.grammar.filter((g) => g.title || g.content).length} {t.lessons.grammar}
                    </span>
                  </div>
                </Link>
                {isAdmin && (
                  <div className="flex shrink-0 gap-2">
                    <Link to={`/lessons/${lesson.id}/edit`} className={btnClass('outline', 'sm')}>
                      {t.lessons.edit}
                    </Link>
                    <button
                      type="button"
                      className={btnClass('ghost', 'sm')}
                      onClick={() => handleDeleteLesson(lesson)}
                    >
                      {t.lessons.delete}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {dialog}
    </main>
  )
}
