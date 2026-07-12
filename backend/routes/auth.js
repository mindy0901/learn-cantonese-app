import { Router } from "express";
import { logAction, logFail, logOk, logStep } from "../lib/actionLog.js";
import { ensureSupabaseUser } from "../lib/dataService.js";
import { getAdminEmails, isAppAdmin } from "../lib/appAdmin.js";
import { requireAdmin } from "../lib/supabaseAdmin.js";

export const authRouter = Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:5173/auth/google/callback";
const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:5173";

function googleConfigured() {
    return Boolean(GOOGLE_CLIENT_ID?.trim() && GOOGLE_CLIENT_SECRET?.trim());
}

function sessionUser(req) {
    if (!req.session?.userId) return null;
    return {
        id: req.session.userId,
        email: req.session.email,
        name: req.session.name,
        picture: req.session.picture ?? null,
        isAdmin: isAppAdmin(req.session.email),
    };
}

authRouter.get("/status", (req, res) => {
    const user = sessionUser(req);
    res.json({
        googleReady: googleConfigured(),
        supabaseReady: Boolean(process.env.SUPABASE_SECRET_KEY?.trim()),
        adminConfigured: getAdminEmails().size > 0,
        signedIn: Boolean(user),
        user,
    });
});

authRouter.get("/google", (req, res) => {
    logStep("auth", "Google sign-in started");
    if (!googleConfigured()) {
        logFail("auth", "GOOGLE SIGN-IN", "OAuth not configured");
        return res.redirect(`${FRONTEND_URL}?auth_error=google_not_configured`);
    }
    logStep("auth", "Redirecting to Google OAuth");
    const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: GOOGLE_REDIRECT_URI,
        response_type: "code",
        scope: "openid email profile",
        access_type: "online",
        prompt: "select_account",
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

authRouter.get("/google/callback", async (req, res) => {
    try {
        logStep("auth", "Google OAuth callback received");
        if (!googleConfigured()) throw new Error("Google OAuth not configured");
        const code = req.query.code;
        if (!code) throw new Error("Missing OAuth code");

        logStep("auth", "Exchanging OAuth code", "fetching access token");
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                code,
                client_id: GOOGLE_CLIENT_ID,
                client_secret: GOOGLE_CLIENT_SECRET,
                redirect_uri: GOOGLE_REDIRECT_URI,
                grant_type: "authorization_code",
            }),
        });
        const tokens = await tokenRes.json();
        if (!tokenRes.ok) throw new Error(tokens.error_description ?? tokens.error ?? "Token exchange failed");

        logStep("auth", "Fetching Google profile");
        const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        const profile = await profileRes.json();
        if (!profileRes.ok || !profile.email) throw new Error("Could not read Google profile");

        logStep("auth", "Syncing Supabase user", profile.email.split("@")[0]);
        const db = requireAdmin();
        const user = await ensureSupabaseUser(db, {
            email: profile.email,
            name: profile.name ?? profile.email,
            googleId: profile.id,
        });

        req.session.userId = user.id;
        req.session.email = profile.email;
        req.session.name = profile.name ?? profile.email;
        req.session.picture = profile.picture ?? null;

        logOk("auth", "SIGN IN", profile.email.split("@")[0]);

        res.redirect(FRONTEND_URL);
    } catch (err) {
        logFail("auth", "SIGN IN", err.message);
        console.error(err);
        res.redirect(`${FRONTEND_URL}?auth_error=${encodeURIComponent(err.message)}`);
    }
});

authRouter.get("/me", (req, res) => {
    const user = sessionUser(req);
    if (!user) {
        logStep("auth", "Session check", "not signed in");
        return res.status(401).json({ error: "Not signed in" });
    }
    logStep("auth", "Session check", `OK — ${user.email.split("@")[0]}`);
    res.json(user);
});

authRouter.post("/logout", (req, res) => {
    const who = req.session?.email?.split("@")[0] ?? "guest";
    logAction("auth", "SIGN OUT", who);
    req.session = null;
    res.json({ ok: true });
});
