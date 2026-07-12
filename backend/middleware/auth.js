import { log, logWarn } from "../lib/actionLog.js";

export function requireAuth(req, res, next) {
    log("Checking auth");
    if (!req.session?.userId) {
        logWarn("Auth failed", "not signed in");
        return res.status(401).json({ error: "Not signed in" });
    }
    next();
}

export function getUserId(req) {
    return req.session.userId;
}
