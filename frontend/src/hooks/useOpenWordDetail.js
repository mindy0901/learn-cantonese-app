import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { wordDetailPath } from '../lib/wordRoutes.js'

export function useOpenWordDetail() {
  const navigate = useNavigate()
  return useCallback(
    (word) => {
      const id = typeof word === 'string' ? word : word?.id
      if (id) navigate(wordDetailPath(id))
    },
    [navigate],
  )
}
