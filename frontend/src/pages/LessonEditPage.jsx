import { useEffect } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { LessonEditFooter } from '../components/lesson-edit/LessonEditFooter.jsx'
import { LessonGrammarSection } from '../components/lesson-edit/LessonGrammarSection.jsx'
import { LessonNameField } from '../components/lesson-edit/LessonNameField.jsx'
import { LessonVocabSection } from '../components/lesson-edit/LessonVocabSection.jsx'
import { useLocale } from '../store/localeStore.js'
import { useLesson, useAppStore } from '../store/appStore.js'
import { useLessonDraftStore } from '../store/lessonDraftStore.js'
import { useIsAdmin } from '../store/authStore.js'
import { btnClass } from '../components/ui/buttonStyles.js'

export function LessonEditPage() {
  const { id } = useParams()
  const { t } = useLocale()
  const isAdmin = useIsAdmin()
  const isNew = !id || id === 'new'
  const existing = useLesson(isNew ? undefined : id)

  useEffect(() => {
    if (!isAdmin) return
    const { init, reset } = useLessonDraftStore.getState()
    if (isNew) {
      reset()
    } else if (existing) {
      init({
        name: existing.name,
        wordIds: existing.wordIds,
        grammar: existing.grammar,
        grammarBank: useAppStore.getState().grammarBank,
      })
    }
    return () => reset()
  }, [isNew, existing?.id, isAdmin])

  if (!isAdmin) {
    return <Navigate to="/lessons" replace />
  }

  if (!isNew && !existing) {
    return (
      <main className="flex-1 max-w-[1080px] w-full mx-auto px-5 py-8 pb-12">
        <div className="text-center py-12 px-6 text-text-muted flex flex-col items-center gap-4">
          <p>{t.lessons.notFound}</p>
          <Link to="/lessons" className={btnClass('primary')}>{t.lessons.backToList}</Link>
        </div>
      </main>
    )
  }

  return (
    <main className="flex-1 max-w-[1080px] w-full mx-auto px-5 py-8 pb-12">
      <div className="flex items-start justify-between gap-4 mb-6 max-sm:flex-col">
        <div>
          <h1>{isNew ? t.lessonEdit.createTitle : t.lessonEdit.editTitle}</h1>
          <p className="mt-1 text-text-muted text-sm">{t.lessonEdit.subtitle}</p>
        </div>
      </div>

      <LessonNameField />
      <LessonVocabSection />
      <LessonGrammarSection />
      <LessonEditFooter isNew={isNew} lessonId={existing?.id} />
    </main>
  )
}
