import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __app_dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__app_dirname, "..", ".env.dev") });

import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import session from "@fastify/session";
import formbody from "@fastify/formbody";
import { authRoutes } from "./routes/auth.js";
import { dataRoutes } from "./routes/data.js";
import { translateRoutes } from "./routes/translate.js";

const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:5173";
const cookieSecure =
    process.env.COOKIE_SECURE != null ? process.env.COOKIE_SECURE === "true" : process.env.NODE_ENV === "production";
const cookieSameSite = process.env.COOKIE_SAME_SITE ?? "lax";

export async function buildApp(opts = {}) {
    const app = Fastify({
        trustProxy: true,
        ...opts,
    });

    // CORS
    await app.register(cors, {
        origin: FRONTEND_URL,
        credentials: true,
    });

    // Body parsing
    await app.register(formbody);
    app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
        try {
            done(null, body ? JSON.parse(body) : {});
        } catch (err) {
            done(err, undefined);
        }
    });

    // Cookies
    await app.register(cookie);

    // Session — ensure secret is at least 32 chars for @fastify/session v11
    let sessionSecret = process.env.SESSION_SECRET ?? "dev-secret-change-me-min-32-chars!";
    if (sessionSecret.length < 32) {
        sessionSecret = sessionSecret.padEnd(32, "0");
    }
    await app.register(session, {
        cookieName: "cantonese.sid",
        secret: sessionSecret,
        cookie: {
            maxAge: 7 * 24 * 60 * 60 * 1000,
            httpOnly: true,
            secure: cookieSecure,
            sameSite: cookieSameSite,
            path: "/",
        },
        saveUninitialized: false,
    });

    // Health check
    app.get("/health", async () => ({ ok: true }));

    // Routes
    await app.register(authRoutes, { prefix: "/auth" });
    await app.register(dataRoutes, { prefix: "/api" });
    await app.register(translateRoutes, { prefix: "/api" });

    // Error handler
    app.setErrorHandler((error, _request, reply) => {
        console.error(`Error: ${error.message ?? error}`);
        const status = error.statusCode ?? error.status ?? 500;
        reply.code(status).send({ error: error.message ?? "Server error" });
    });

    return app;
}
