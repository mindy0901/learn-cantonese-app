import { create } from 'zustand'
import { api, signInWithGoogle as redirectGoogleSignIn } from '../lib/api.js'
import { logAction } from '../lib/actionLog.js'
import { setWordBrowseCacheOwner } from '../lib/wordBrowseCache.js'

function readAuthErrorFromUrl() {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('auth_error')
  if (!code) return null
  window.history.replaceState({}, '', window.location.pathname + window.location.hash)
  return code
}

export const useAuthStore = create((set, get) => ({
  user: null,
  loading: true,
  initialized: false,
  signingOut: false,
  googleReady: false,
  authError: null,

  init: async () => {
    if (get().initialized) return

    logAction('Initialize auth state')
    const urlError = readAuthErrorFromUrl()
    if (urlError) set({ authError: urlError })

    set({ loading: true })

    try {
      const status = await api.getAuthStatus()
      const user = status.signedIn ? status.user ?? null : null
      setWordBrowseCacheOwner(user?.id ?? null)
      set({
        googleReady: status.googleReady,
        user,
        loading: false,
        initialized: true,
        authError: urlError ? get().authError : null,
      })
      logAction('Auth state initialized', {
        signedIn: Boolean(user),
        email: user?.email ?? null,
        isAdmin: user?.isAdmin ?? false,
      })
    } catch {
      setWordBrowseCacheOwner(null)
      set({ user: null, googleReady: false, loading: false, initialized: true })
      logAction('Auth state initialized', { signedIn: false })
    }
  },

  signInWithGoogle: () => {
    logAction('Start Google sign-in flow')
    if (!get().googleReady) {
      set({ authError: 'google_not_configured' })
      return
    }
    set({ authError: null })
    redirectGoogleSignIn()
  },

  signOut: async () => {
    logAction('Sign out user')
    set({ signingOut: true })
    try {
      await api.logout()
      setWordBrowseCacheOwner(null)
      set({ user: null, authError: null })
      const { useAppStore } = await import('./appStore.js')
      useAppStore.getState().clearData()
      try {
        await useAppStore.getState().hydrateFromCloud()
      } catch {
        /* error state handled in CloudGate */
      }
      logAction('Sign out completed, reloaded public data')
    } finally {
      set({ signingOut: false })
    }
  },

  clearAuthError: () => {
    logAction('Clear auth error message')
    set({ authError: null })
  },
}))

export const useAuthUser = () => useAuthStore((s) => s.user)
export const useAuthLoading = () => useAuthStore((s) => s.loading)
export const useAuthInitialized = () => useAuthStore((s) => s.initialized)
export const useAuthSigningOut = () => useAuthStore((s) => s.signingOut)
export const useGoogleReady = () => useAuthStore((s) => s.googleReady)
export const useAuthError = () => useAuthStore((s) => s.authError)
export const useIsAdmin = () => useAuthStore((s) => Boolean(s.user?.isAdmin))
export const useIsSignedIn = () => useAuthStore((s) => Boolean(s.user))
