import { memo, useCallback, useState } from 'react'
import { useLocale } from '../store/localeStore.js'
import { BankSearchInput } from './BankSearchInput.jsx'
import { WordBankBrowseTable } from './WordBankBrowseTable.jsx'

export const WordPicker = memo(function WordPicker({
  selected,
  onToggle,
}) {
  const { t } = useLocale()
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const handleDebouncedSearch = useCallback((value) => setDebouncedSearch(value), [])

  return (
    <div className="border border-border rounded-[10px] overflow-hidden">
      <div className="p-3 border-b border-border flex flex-col gap-2">
        <BankSearchInput
          onDebouncedChange={handleDebouncedSearch}
          placeholder={t.lessonEdit.searchBank}
        />
      </div>

      <WordBankBrowseTable
        variant="picker"
        debouncedSearch={debouncedSearch}
        filter="all"
        sortKey="createdAt"
        sortDir="desc"
        selected={selected}
        onToggleSelect={onToggle}
        emptyHint={t.lessonEdit.searchBankHint}
        emptyNoMatch={t.lessonEdit.noMatch}
      />
    </div>
  )
})
