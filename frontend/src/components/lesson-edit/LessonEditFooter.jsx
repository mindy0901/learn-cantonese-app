import { memo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLocale } from '../../store/localeStore.js'
import { useAppActions, useAppStore } from '../../store/appStore.js'
import { useLessonDraftStore } from '../../store/lessonDraftStore.js'
import { emptyGrammar } from '../../types/word.js'
import { btnClass } from '../ui/buttonStyles.js'

export const LessonEditFooter = memo(function LessonEditFooter({ isNew, lessonId }) {
  const { t } = useLocale()
  const navigate = useNavigate()
  const { addLessonAwait, editLessonAwait, createWordAwait, createGrammarAwait } = useAppActions()
  const name = useLessonDraftStore((s) => s.name)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const canSave = name.trim().length > 0 && !saving

  const handleSave = async () => {
    const { name: draftName, selectedOrder, wordExtras, grammarSelectedOrder, grammarExtras } =
      useLessonDraftStore.getState().snapshot()
    const trimmed = draftName.trim()
    if (!trimmed || saving) return

    setSaving(true)
    setSaveError('')
    try {
      const createdIds = []
      for (const extra of wordExtras) {
        const saved = await createWordAwait(extra)
        createdIds.push(saved.id)
      }
      const wordIds = [...selectedOrder, ...createdIds]

      const grammarBank = useAppStore.getState().grammarBank
      const fromBank = grammarSelectedOrder
        .map((id) => {
          const item = grammarBank.find((g) => g.id === id)
          if (!item) return null
          return emptyGrammar({ id: item.id, title: item.title, content: item.content })
        })
        .filter(Boolean)
      const customGrammar = []
      for (const extra of grammarExtras) {
        const title = extra.title?.trim() ?? ''
        const content = extra.content?.trim() ?? ''
        if (!title && !content) continue
      const saved = await createGrammarAwait(extra)
      if (!saved?.id) throw new Error('Failed to save grammar to bank')
      customGrammar.push(
        emptyGrammar({ id: saved.id, title: saved.title, content: saved.content }),
      )
      }
      const cleanedGrammar = [...fromBank, ...customGrammar]

      if (isNew) {
        await addLessonAwait(trimmed, wordIds, cleanedGrammar.length > 0 ? cleanedGrammar : [emptyGrammar()])
        navigate('/lessons')
      } else {
        await editLessonAwait(lessonId, {
          name: trimmed,
          wordIds,
          grammar: cleanedGrammar.length > 0 ? cleanedGrammar : [emptyGrammar()],
        })
        navigate(`/lessons/${lessonId}`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setSaveError(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex justify-end gap-3 mt-4 flex-wrap">
      {saveError && (
        <p className="flex-[1_1_100%] mb-2 px-4 py-3 rounded-lg text-sm bg-error-bg text-error-text border border-error-border" role="alert">
          {saveError}
        </p>
      )}
      <Link to={isNew ? '/lessons' : `/lessons/${lessonId}`} className={btnClass('ghost')}>
        {t.lessonEdit.cancel}
      </Link>
      <button type="button" className={btnClass('primary')} disabled={!canSave} onClick={handleSave}>
        {saving ? t.common.loading : isNew ? t.lessonEdit.createBtn : t.lessonEdit.saveBtn}
      </button>
    </div>
  )
})
