import { isAppAdmin } from "../lib/appAdmin.js";
import { log, logWarn } from "../lib/actionLog.js";

export function requireAppAdmin(req, res, next) {
    log("Checking admin");
    if (!isAppAdmin(req.session?.email)) {
        logWarn("Admin required", req.session?.email?.split("@")[0] ?? "guest");
        return res.status(403).json({ error: "Admin only" });
    }
    next();
}
