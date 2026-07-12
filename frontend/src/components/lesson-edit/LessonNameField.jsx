import { memo } from 'react'
import { useLocale } from '../../store/localeStore.js'
import { useLessonDraftStore } from '../../store/lessonDraftStore.js'
import { uiInputClass } from '../ui/controlStyles.js'

export const LessonNameField = memo(function LessonNameField() {
  const { t } = useLocale()
  const name = useLessonDraftStore((s) => s.name)
  const setName = useLessonDraftStore((s) => s.setName)

  return (
    <section className="bg-surface border border-border rounded-xl px-5 sm:px-6 py-5 mb-5 shadow-theme-sm [&_h2]:mb-3">
      <h2>{t.lessonEdit.nameLabel}</h2>
      <input
        type="text"
        className={uiInputClass}
        placeholder={t.lessonEdit.namePlaceholder}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
    </section>
  )
})
