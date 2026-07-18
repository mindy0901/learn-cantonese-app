/** Compact backend logs: "Update word: 你好" / "Checking auth" */

function emit(level, message) {
    // Logging moved to frontend
}

function quoteIfNeeded(text) {
    const trimmed = String(text ?? "").trim();
    return trimmed || "";
}

/** @param {string | Record<string, unknown> | null | undefined} subject */
export function subjectLabel(subject) {
    if (subject == null) return "";
    if (typeof subject === "string" || typeof subject === "number") return quoteIfNeeded(subject);
    if (typeof subject !== "object") return "";

    const han =
        subject.hanTraditional ??
        subject.han_traditional ??
        subject.hanTrad ??
        subject.han_trad ??
        subject.hanSimplified ??
        subject.han_simplified ??
        subject.han;
    if (typeof han === "string" && han.trim()) return han.trim();

    if (typeof subject.title === "string" && subject.title.trim()) return subject.title.trim();
    if (typeof subject.name === "string" && subject.name.trim()) return subject.name.trim();
    if (typeof subject.email === "string" && subject.email.trim()) {
        return subject.email.split("@")[0] || subject.email;
    }
    if (subject.id != null) return `#${String(subject.id).slice(0, 8)}`;
    return "";
}

export function userLabel(req) {
    const email = req?.session?.email;
    if (email) return email.split("@")[0];
    if (req?.session?.userId) return `#${String(req.session.userId).slice(0, 8)}`;
    return "guest";
}

/** Main log: `log("Update word", row)` → "Update word: 你好" */
export function log(message, subject) {
    const label = subjectLabel(subject);
    emit("info", label ? `${message}: ${label}` : message);
}

export function logWarn(message, detail) {
    const label = subjectLabel(detail);
    emit("warn", label ? `${message}: ${label}` : message);
}

export function logError(message, detail) {
    const label = subjectLabel(detail);
    emit("error", label ? `${message}: ${label}` : message);
}

// --- Compatibility aliases (same compact style) ---

export function logStep(area, step, detail) {
    log(step, detail);
}

export function logStart(area, action, subject) {
    log(action, subject);
}

export function logAction(area, action, subject) {
    log(action, subject);
}

export function logOk(area, action, subject, detail) {
    if (detail != null && subject == null) log(action, detail);
    else log(action, subject ?? detail);
}

export function logFail(area, action, detail) {
    logWarn(action, detail);
}
