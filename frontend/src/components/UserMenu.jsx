import { useEffect, useRef, useState } from 'react'
import {
  useAuthError,
  useAuthSigningOut,
  useAuthStore,
  useAuthUser,
  useGoogleReady,
} from '../store/authStore.js'
import { btnClass } from './ui/buttonStyles.js'
import { LoadingButton, BtnSpinner } from './LoadingButton.jsx'
import { GoogleIcon } from './GoogleIcon.jsx'
import { useLocale } from '../store/localeStore.js'

export function UserMenu() {
  const { t } = useLocale()
  const user = useAuthUser()
  const signingOut = useAuthSigningOut()
  const googleReady = useGoogleReady()
  const authError = useAuthError()
  const { signInWithGoogle, signOut, clearAuthError } = useAuthStore()

  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const errorMessage =
    authError === 'google_not_configured'
      ? t.auth.oauthNotConfigured
      : authError
        ? authError
        : null

  if (!user) {
    return (
      <div className="relative shrink-0 flex flex-col items-end" ref={rootRef}>
        <LoadingButton
          className={btnClass('google', 'sm')}
          onClick={signInWithGoogle}
          title={!googleReady ? t.auth.oauthNotConfigured : undefined}
        >
          <GoogleIcon className="size-[1.125rem]" />
          {t.auth.signIn}
        </LoadingButton>
        {errorMessage && (
          <p
            className="absolute top-[calc(100%+0.5rem)] right-0 z-20 m-0 max-w-64 rounded-lg border border-error-border bg-error-bg py-2 pr-7 pl-2.5 text-xs leading-snug text-error-text whitespace-normal"
            role="alert"
          >
            {errorMessage}
            <button
              type="button"
              className="absolute top-0.5 right-1 border-0 bg-transparent p-0.5 text-base leading-none text-inherit cursor-pointer"
              onClick={clearAuthError}
              aria-label={t.common.close}
            >
              ×
            </button>
          </p>
        )}
      </div>
    )
  }

  const initial = (user.name ?? user.email ?? '?').charAt(0).toUpperCase()

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        className="flex max-w-48 items-center gap-2 rounded-full border border-border bg-surface py-1 pr-2 pl-1 text-[0.8125rem] text-text-h cursor-pointer hover:border-accent-border hover:bg-accent-bg"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        title={user.email ?? user.name}
      >
        {user.picture ? (
          <img
            className="size-7 shrink-0 rounded-full object-cover"
            src={user.picture}
            alt=""
            referrerPolicy="no-referrer"
          />
        ) : (
          <span
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white"
            aria-hidden="true"
          >
            {initial}
          </span>
        )}
        <span className="overflow-hidden text-ellipsis whitespace-nowrap">{user.name ?? user.email}</span>
      </button>

      {open && (
        <div
          className="absolute top-[calc(100%+0.375rem)] right-0 z-20 min-w-44 rounded-[10px] border border-border bg-surface p-1.5 shadow-[0_8px_24px_rgb(0_0_0/12%)]"
          role="menu"
        >
          <div className="mb-1 break-all border-b border-border px-2.5 py-1.5 text-xs text-text-muted">
            {user.email}
          </div>
          <button
            type="button"
            className="block w-full rounded-md border-0 bg-transparent px-2.5 py-2 text-left text-[0.8125rem] text-text-h cursor-pointer hover:bg-accent-bg"
            role="menuitem"
            disabled={signingOut}
            onClick={() => {
              setOpen(false)
              signOut()
            }}
          >
            {signingOut ? (
              <span className="inline-flex items-center gap-2">
                <BtnSpinner size="sm" /> {t.auth.signingOut}
              </span>
            ) : (
              t.auth.signOut
            )}
          </button>
        </div>
      )}
    </div>
  )
}
