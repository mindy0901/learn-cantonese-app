import { create } from "zustand";
import { api, signInWithGoogle as redirectGoogleSignIn } from "../lib/api.js";
import { log } from "../lib/actionLog.js";
import { setVocabularyBrowseCacheOwner } from "../lib/wordBrowseCache.js";

// ── Auto check-in ngày đăng nhập (2026-08-24) ──
// Ghi ngày user đăng nhập (login/register/session restore). Dedupe 1 user/ngày
// qua localStorage để không gửi POST lặp trong cùng ngày.
const CHECKIN_KEY = "cantonese:last-checkin";

function localDateString(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function lastCheckinFor(userId) {
    try {
        const map = JSON.parse(localStorage.getItem(CHECKIN_KEY) || "{}");
        return map[userId] ?? null;
    } catch {
        return null;
    }
}

function markCheckin(userId, date) {
    try {
        const map = JSON.parse(localStorage.getItem(CHECKIN_KEY) || "{}");
        map[userId] = date;
        localStorage.setItem(CHECKIN_KEY, JSON.stringify(map));
    } catch {
        /* ignore */
    }
}

/** Auto check-in — fire-and-forget, không chặn login nếu lỗi. */
async function maybeCheckIn(userId) {
    if (!userId) return;
    const today = localDateString();
    if (lastCheckinFor(userId) === today) return;
    try {
        await api.checkIn(today);
        markCheckin(userId, today);
    } catch {
        /* check-in không quan trọng */
    }
}

function readAuthErrorFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("auth_error");
    if (!code) return null;
    window.history.replaceState({}, "", window.location.pathname + window.location.hash);
    return code;
}

export const useAuthStore = create((set, get) => ({
    user: null,
    loading: true,
    initialized: false,
    signingOut: false,
    googleReady: false,
    authError: null,

    init: async () => {
        if (get().initialized) return;

        log("Checking auth");
        const urlError = readAuthErrorFromUrl();
        if (urlError) set({ authError: urlError });

        set({ loading: true });

        try {
            const status = await api.getAuthStatus();
            const user = status.signedIn ? (status.user ?? null) : null;
            setVocabularyBrowseCacheOwner(user?.id ?? null);
            set({
                googleReady: status.googleReady,
                user,
                loading: false,
                initialized: true,
                authError: urlError ? get().authError : null,
            });
            log("Getting user", user?.email?.split("@")[0] ?? "guest");
            if (user) maybeCheckIn(user.id);
        } catch {
            setVocabularyBrowseCacheOwner(null);
            set({ user: null, googleReady: false, loading: false, initialized: true });
            log("Getting user", "guest");
        }
    },

    signInWithGoogle: () => {
        log("Google sign-in");
        if (!get().googleReady) {
            set({ authError: "google_not_configured" });
            return;
        }
        set({ authError: null });
        redirectGoogleSignIn();
    },

    signInWithPassword: async (email, password) => {
        log("Password sign-in");
        set({ authError: null, loading: true });
        try {
            const user = await api.login(email, password);
            setVocabularyBrowseCacheOwner(user.id);
            set({ user, loading: false });
            log("Getting user", user.email.split("@")[0]);
            maybeCheckIn(user.id);
            // Re-hydrate data
            const { useAppStore } = await import("./appStore.js");
            await useAppStore.getState().hydrateFromCloud();
            return user;
        } catch (err) {
            set({ loading: false });
            const msg = err?.message || "Đăng nhập thất bại";
            set({ authError: msg });
            log("Password sign-in failed", msg);
            throw err;
        }
    },

    signUpWithPassword: async (email, password) => {
        log("Password sign-up");
        set({ authError: null, loading: true });
        try {
            const user = await api.register(email, password);
            setVocabularyBrowseCacheOwner(user.id);
            set({ user, loading: false });
            log("Getting user", user.email.split("@")[0]);
            maybeCheckIn(user.id);
            // Re-hydrate data
            const { useAppStore } = await import("./appStore.js");
            await useAppStore.getState().hydrateFromCloud();
            return user;
        } catch (err) {
            set({ loading: false });
            const msg = err?.message || "Đăng ký thất bại";
            set({ authError: msg });
            log("Password sign-up failed", msg);
            throw err;
        }
    },

    signOut: async () => {
        log("Sign out");
        set({ signingOut: true });
        try {
            await api.logout();
            setVocabularyBrowseCacheOwner(null);
            set({ user: null, authError: null });
            const { useAppStore } = await import("./appStore.js");
            useAppStore.getState().clearData();
            try {
                await useAppStore.getState().hydrateFromCloud();
            } catch {
                /* error state handled in CloudGate */
            }
            log("Sign out done");
        } finally {
            set({ signingOut: false });
        }
    },

    clearAuthError: () => {
        log("Clear auth error");
        set({ authError: null });
    },
}));

export const useAuthUser = () => useAuthStore((s) => s.user);
export const useAuthLoading = () => useAuthStore((s) => s.loading);
export const useAuthInitialized = () => useAuthStore((s) => s.initialized);
export const useAuthSigningOut = () => useAuthStore((s) => s.signingOut);
export const useGoogleReady = () => useAuthStore((s) => s.googleReady);
export const useAuthError = () => useAuthStore((s) => s.authError);
export const useIsAdmin = () => useAuthStore((s) => Boolean(s.user?.isAdmin));
export const useIsSignedIn = () => useAuthStore((s) => Boolean(s.user));
