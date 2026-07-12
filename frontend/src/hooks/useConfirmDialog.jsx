import { useCallback, useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog.jsx'
import { useLocale } from '../store/localeStore.js'

export function useConfirmDialog() {
  const { t } = useLocale()
  const [state, setState] = useState(null)

  const ask = useCallback((options) => {
    setState(options)
  }, [])

  const close = useCallback(() => setState(null), [])

  const dialog = state ? (
    <ConfirmDialog
      title={state.title}
      message={state.message}
      confirmLabel={state.confirmLabel ?? t.confirm.deleteYes}
      cancelLabel={t.common.cancel}
      danger
      onConfirm={() => {
        state.onConfirm()
        close()
      }}
      onCancel={close}
    />
  ) : null

  return { ask, dialog }
}
