import { BtnSpinner } from './LoadingButton.jsx'
import { useAuthInitialized, useAuthLoading } from '../store/authStore.js'
import { useLocale } from '../store/localeStore.js'

export function AuthGate({ children }) {
  const { t } = useLocale()
  const loading = useAuthLoading()
  const initialized = useAuthInitialized()

  if (loading || !initialized) {
    return (
      <div
        className="min-h-dvh flex items-center justify-center p-8 px-6 text-text-muted bg-bg"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <p className="inline-flex items-center gap-2">
          <BtnSpinner /> {t.auth.loading}
        </p>
      </div>
    )
  }

  return children
}
