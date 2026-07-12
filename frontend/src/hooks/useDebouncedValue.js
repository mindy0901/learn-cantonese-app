import { useEffect, useState } from 'react'

export function useDebouncedValue(value, delay = 200) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const trimmed = value.trim()
    if (!trimmed) {
      setDebounced(value)
      return
    }
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])

  return debounced
}
