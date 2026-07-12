import { memo, useEffect, useState } from 'react'
import { SEARCH_DEBOUNCE_MS } from '../lib/constants.js'
import { useDebouncedValue } from '../hooks/useDebouncedValue.js'
import { cn } from '../lib/cn.js'
import { bankSearchInputClass } from './ui/bankToolbarStyles.js'

export const BankSearchInput = memo(function BankSearchInput({
  id,
  onDebouncedChange,
  placeholder,
  className,
  delay = SEARCH_DEBOUNCE_MS,
  initialValue = '',
  autoFocus = false,
}) {
  const [search, setSearch] = useState(initialValue)
  const debouncedSearch = useDebouncedValue(search, delay)

  useEffect(() => {
    onDebouncedChange(debouncedSearch)
  }, [debouncedSearch, onDebouncedChange])

  return (
    <input
      id={id}
      type="search"
      className={cn(bankSearchInputClass, className)}
      placeholder={placeholder}
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      autoComplete="off"
      autoFocus={autoFocus}
    />
  )
})
