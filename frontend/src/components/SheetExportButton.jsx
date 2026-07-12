import { useCallback, useState } from 'react'
import { LoadingButton } from './LoadingButton.jsx'
import { useLocale } from '../store/localeStore.js'
import {
  useGrammarBank,
  useLessons,
  useWordCount,
  useAppStore,
  useAppActions,
} from '../store/appStore.js'
import {
  exportGrammarCsv,
  exportLessonsCsv,
  exportWordsCsv,
} from '../lib/sheetExport.js'
import { btnClass } from './ui/buttonStyles.js'

export function SheetExportButton({ type }) {
  const { t } = useLocale()
  const wordCount = useWordCount()
  const grammarBank = useGrammarBank()
  const lessons = useLessons()
  const { ensureAllWordsLoaded } = useAppActions()
  const [exporting, setExporting] = useState(false)

  const handleExport = useCallback(async () => {
    setExporting(true)
    try {
      if (type === 'words') {
        if (wordCount === 0) return
        await ensureAllWordsLoaded()
        exportWordsCsv(useAppStore.getState().words)
      } else if (type === 'grammar') {
        if (grammarBank.length === 0) return
        exportGrammarCsv(grammarBank)
      } else if (type === 'lessons') {
        if (lessons.length === 0) return
        await ensureAllWordsLoaded()
        exportLessonsCsv(lessons, useAppStore.getState().words)
      }
    } catch (err) {
      console.warn('[sheet export]', err instanceof Error ? err.message : err)
    } finally {
      setExporting(false)
    }
  }, [type, wordCount, grammarBank, lessons, ensureAllWordsLoaded])

  const empty =
    type === 'words'
      ? wordCount === 0
      : type === 'grammar'
        ? grammarBank.length === 0
        : lessons.length === 0

  return (
    <LoadingButton
      className={btnClass('outline')}
      loading={exporting}
      loadingText={t.sheetExport.exporting}
      onClick={handleExport}
      disabled={empty}
      title={t.sheetExport.hint}
    >
      {t.sheetExport.btn}
    </LoadingButton>
  )
}
