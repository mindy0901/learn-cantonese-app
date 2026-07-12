import { useCallback, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { SheetExportButton } from '../components/SheetExportButton.jsx'
import { SheetUpdateButton } from '../components/SheetUpdateButton.jsx'
import { HanVietSyncButton } from '../components/HanVietSyncButton.jsx'
import { HanVietCognatesSyncButton } from '../components/HanVietCognatesSyncButton.jsx'
import { HanVariantSyncButton } from '../components/HanVariantSyncButton.jsx'
import { PinyinSyncButton } from '../components/PinyinSyncButton.jsx'
import { AddWordModal } from '../components/AddWordModal.jsx'
import { WordBankListPanel } from '../components/WordBankListPanel.jsx'
import { useAppActions } from '../store/appStore.js'
import { usePrefsStore, useWordBankPrefs } from '../store/prefsStore.js'
import { useLocale } from '../store/localeStore.js'
import { btnClass } from '../components/ui/buttonStyles.js'
import { useOpenWordDetail } from '../hooks/useOpenWordDetail.js'
import { loadWordBankReturnState } from '../lib/wordBankReturn.js'

export function WordBankPage() {
  const { isAdmin } = useOutletContext()
  const { createWord } = useAppActions()
  const { t } = useLocale()
  const openWordDetail = useOpenWordDetail()
  const prefs = useWordBankPrefs()
  const setWordBankPrefs = usePrefsStore((s) => s.setWordBankPrefs)
  const [restoreState] = useState(() => loadWordBankReturnState())

  const [addOpen, setAddOpen] = useState(false)

  const { filter, sortKey, sortDir } = prefs

  const handleView = useCallback((word) => openWordDetail(word), [openWordDetail])
  const handleFilterChange = useCallback((patch) => setWordBankPrefs(patch), [setWordBankPrefs])

  return (
    <main className="flex-1 max-w-[1240px] w-full mx-auto px-5 pt-8 pb-12">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1>{t.wordBank.title}</h1>
        </div>
        <div className="flex gap-2 shrink-0">
          {isAdmin && (
            <>
              <SheetExportButton type="words" />
              <SheetUpdateButton type="words" />
              <HanVietSyncButton />
              <HanVietCognatesSyncButton />
              <HanVariantSyncButton />
              <PinyinSyncButton />
              <button type="button" className={btnClass('primary')} onClick={() => setAddOpen(true)}>
                + {t.wordBank.addWord}
              </button>
            </>
          )}
        </div>
      </div>

      <WordBankListPanel
        filter={filter}
        sortKey={sortKey}
        sortDir={sortDir}
        onFilterChange={handleFilterChange}
        onView={handleView}
        restoreState={restoreState}
      />

      {addOpen && <AddWordModal onSave={createWord} onClose={() => setAddOpen(false)} />}
    </main>
  )
}
