import { useEffect } from 'react'
import { Outlet, useOutletContext } from 'react-router-dom'
import { BtnSpinner } from './LoadingButton.jsx'
import {
  useAppActions,
  useDataError,
  useDataHydrated,
  useDataLoading,
} from '../store/appStore.js'
import { useAuthInitialized } from '../store/authStore.js'
import { useLocale } from '../store/localeStore.js'
import { cn } from '../lib/cn.js'
import { btnClass } from './ui/buttonStyles.js'

const pageClass =
  'flex-1 max-w-[1080px] w-full mx-auto px-5 py-8 pb-12'

const emptyStateClass =
  'text-center py-12 px-6 text-text-muted flex flex-col items-center gap-4'

export function CloudGate() {
  const layoutContext = useOutletContext()
  const { t } = useLocale()
  const authInitialized = useAuthInitialized()
  const dataLoading = useDataLoading()
  const dataError = useDataError()
  const hydrated = useDataHydrated()
  const { hydrateFromCloud } = useAppActions()

  useEffect(() => {
    if (!authInitialized || hydrated || dataLoading) return
    hydrateFromCloud().catch(() => {})
  }, [authInitialized, hydrated, dataLoading, hydrateFromCloud])

  if (!authInitialized || dataLoading || !hydrated) {
    return (
      <div
        className={cn(pageClass, emptyStateClass)}
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <p className="inline-flex items-center gap-2">
          <BtnSpinner /> {t.data.loading}
        </p>
      </div>
    )
  }

  if (dataError) {
    return (
      <div className={cn(pageClass, emptyStateClass)}>
        <p
          className="px-4 py-3 rounded-lg text-sm bg-error-bg text-error-text border border-error-border"
          role="alert"
        >
          {dataError}
        </p>
        <button
          type="button"
          className={btnClass('primary')}
          onClick={() => hydrateFromCloud()}
        >
          {t.data.retry}
        </button>
      </div>
    )
  }

  return <Outlet context={layoutContext} />
}
