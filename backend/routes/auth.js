import { log, logWarn } from "../lib/actionLog.js";
import { ensureUser, ensureUserVocabulary } from "../lib/prismaService.js";
import { getAdminEmails, isAppAdmin } from "../lib/appAdmin.js";
import bcrypt from "bcryptjs";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:5173/auth/google/callback";
const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:5173";

function googleConfigured() {
    return Boolean(GOOGLE_CLIENT_ID?.trim() && GOOGLE_CLIENT_SECRET?.trim());
}

async function sessionUser(request) {
    if (!request.session?.userId) return null;
    const { prisma } = await import("../lib/prisma.js");
    const user = await prisma.user.findUnique({
        where: { id: request.session.userId },
        select: { isAdmin: true },
    });
    return {
        id: request.session.userId,
        email: request.session.email,
        name: request.session.name,
        picture: request.session.picture ?? null,
        isAdmin: isAppAdmin(request.session.email) || Boolean(user?.isAdmin),
    };
}

export async function authRoutes(fastify) {
    fastify.get("/status", async (request) => {
        const user = await sessionUser(request);
        return {
            googleReady: googleConfigured(),
            adminConfigured: getAdminEmails().size > 0,
            signedIn: Boolean(user),
            user,
        };
    });

    fastify.get("/google", async (_request, reply) => {
        log("Google sign-in");
        if (!googleConfigured()) {
            logWarn("Google sign-in failed", "OAuth not configured");
            return reply.redirect(`${FRONTEND_URL}?auth_error=google_not_configured`);
        }
        return reply.redirect(
            `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
                client_id: GOOGLE_CLIENT_ID,
                redirect_uri: GOOGLE_REDIRECT_URI,
                response_type: "code",
                scope: "openid email profile",
                access_type: "online",
                prompt: "select_account",
            })}`,
        );
    });

    fastify.get("/google/callback", async (request, reply) => {
        try {
            log("Google callback");
            if (!googleConfigured()) throw new Error("Google OAuth not configured");
            const code = request.query.code;
            if (!code) throw new Error("Missing OAuth code");

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

            const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
                headers: { Authorization: `Bearer ${tokens.access_token}` },
            });
            const profile = await profileRes.json();
            if (!profileRes.ok || !profile.email) throw new Error("Could not read Google profile");

            const user = await ensureUser({
                email: profile.email,
                name: profile.name ?? profile.email,
            });

            // Link shared vocabulary to new users
            await ensureUserVocabulary(user.id);

            request.session.userId = user.id;
            request.session.email = profile.email;
            request.session.name = profile.name ?? profile.email;
            request.session.picture = profile.picture ?? null;

            log("Sign in", profile.email.split("@")[0]);

            return reply.redirect(FRONTEND_URL);
        } catch (err) {
            logWarn("Sign in failed", err.message);
            return reply.redirect(`${FRONTEND_URL}?auth_error=${encodeURIComponent(err.message)}`);
        }
    });

    fastify.get("/me", async (request, reply) => {
        log("Checking auth");
        const user = await sessionUser(request);
        if (!user) {
            log("Not signed in");
            return reply.code(401).send({ error: "Not signed in" });
        }
        log("Getting user", user.email.split("@")[0]);
        return user;
    });

    fastify.post("/login", async (request, reply) => {
        const { email, password } = request.body ?? {};
        if (!email || !password) {
            return reply.code(400).send({ error: "Username and password are required" });
        }

        try {
            const { prisma } = await import("../lib/prisma.js");
            const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });

            if (!user || !user.password) {
                return reply.code(401).send({ error: "Invalid email or password" });
            }

            const valid = await bcrypt.compare(password, user.password);
            if (!valid) {
                return reply.code(401).send({ error: "Invalid email or password" });
            }

            // Link shared vocabulary to new users
            await ensureUserVocabulary(user.id);

            request.session.userId = user.id;
            request.session.email = user.email;
            request.session.name = user.name ?? user.email;
            request.session.picture = null;

            log("Sign in (password)", user.email.split("@")[0]);

            return {
                id: user.id,
                email: user.email,
                name: user.name ?? user.email,
                picture: null,
                isAdmin: isAppAdmin(user.email) || user.isAdmin,
            };
        } catch (err) {
            logWarn("Password sign in failed", err.message);
            return reply.code(500).send({ error: "Sign in failed" });
        }
    });

    fastify.post("/logout", async (request) => {
        log("Sign out", request.session?.email?.split("@")[0] ?? "guest");
        request.session.destroy();
        return { ok: true };
    });
}
