import "dotenv/config";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import cookieSession from "cookie-session";
import { authRouter } from "./routes/auth.js";
import { cedictRouter } from "./routes/cedict.js";
import { dataRouter } from "./routes/data.js";

const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:5173";
const cookieSecure =
    process.env.COOKIE_SECURE != null ? process.env.COOKIE_SECURE === "true" : process.env.NODE_ENV === "production";
const cookieSameSite = process.env.COOKIE_SAME_SITE ?? "lax";

const app = express();
app.set("trust proxy", 1);

app.use(
    cors({
        origin: FRONTEND_URL,
        credentials: true,
    }),
);
app.use(express.json({ limit: "50mb" }));
app.use(cookieParser());
// Store session in the signed cookie itself so auth survives Vercel serverless cold starts
// (express-session MemoryStore is per-instance and breaks PUT/auth on other instances).
app.use(
    cookieSession({
        name: "cantonese.sid",
        keys: [process.env.SESSION_SECRET ?? "dev-secret-change-me"],
        maxAge: 7 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: cookieSecure,
        sameSite: cookieSameSite,
    }),
);

app.get("/health", (_req, res) => {
    res.json({ ok: true });
});

app.use("/auth", authRouter);
app.use("/api/cedict", cedictRouter);
app.use("/api", dataRouter);

app.use((err, _req, res, _next) => {
    console.error(`Error: ${err.message ?? err}`);
    res.status(err.status ?? 500).json({ error: err.message ?? "Server error" });
});

import { warmCedictIndex } from "./lib/cedictSearch.js";

warmCedictIndex();

export default app;
