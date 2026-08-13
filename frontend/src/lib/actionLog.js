/** Compact frontend logs — "Fetch all Data (Word:2000, Grammar:15)", "Update word: aaa complete" */

function emit(level, message) {
    const line = String(message ?? "").trim();
    if (!line) return;
    console.log(
        `%c${line}`,
        level === "error" ? "color:#fca5a5" : level === "warn" ? "color:#fcd34d" : "color:#6ee7b7",
    );
}

function emitGroup(label, payload, level = "info") {
    console.groupCollapsed(
        `%c${label}`,
        level === "error" ? "color:#fca5a5" : level === "warn" ? "color:#fcd34d" : "color:#6ee7b7",
    );
    if (payload !== undefined) {
        if (typeof payload === "object" && payload !== null) {
            console.log("Payload:", JSON.parse(JSON.stringify(payload)));
        } else {
            console.log("Payload:", payload);
        }
    }
    console.groupEnd();
}

// --- Structured log helpers ---

/** Log data fetch completion with counts.
 *  Usage: logFetchDone({ words:2000, grammar:15 })
 */
export function logFetchDone(counts) {
    const parts = [];
    if (counts.words != null) parts.push(`Word:${counts.words}`);
    if (counts.grammar != null) parts.push(`Grammar:${counts.grammar}`);
    if (counts.sentences != null) parts.push(`Sentence:${counts.sentences}`);
    if (counts.hanCharacters != null) parts.push(`HanChar:${counts.hanCharacters}`);
    const label = `Fetch all Data (${parts.join(", ")})`;
    emit("info", label);
    emitGroup(label, counts);
}

/** Log mutation start with optional send payload. */
export function logMutStart(action, subject, payload) {
    const label = subject ? `Start ${action}: ${subject}` : `Start ${action}`;
    emit("info", label);
    if (payload !== undefined) emitGroup(label, payload);
}

/** Log mutation complete with receive payload. */
export function logMutDone(action, subject, payload) {
    const label = subject ? `${action}: ${subject} complete` : `${action} complete`;
    emit("info", label);
    if (payload !== undefined) emitGroup(label, payload);
}

// --- Legacy log functions ---

/** @param {unknown} subject */
function subjectLabel(subject) {
    if (subject == null || subject === "") return "";
    if (typeof subject === "string" || typeof subject === "number" || typeof subject === "boolean") {
        return String(subject).trim();
    }
    if (typeof subject !== "object") return "";

    const o = /** @type {Record<string, unknown>} */ (subject);

    const han = o.hanTraditional ?? o.han_traditional ?? o.hanTrad ?? o.han;
    if (typeof han === "string" && han.trim()) return han.trim();

    if (typeof o.title === "string" && o.title.trim()) return o.title.trim();
    if (typeof o.name === "string" && o.name.trim()) return o.name.trim();

    if (typeof o.email === "string" && o.email.trim()) {
        return o.email.split("@")[0] || o.email;
    }

    if (typeof o.locale === "string") return o.locale;
    if (typeof o.theme === "string") return o.theme;
    if (typeof o.rating === "string" || typeof o.rating === "number") return String(o.rating);
    if ("popularity" in o) return String(o.popularity ?? "null");
    if ("studyProgress" in o) return String(o.studyProgress);
    if (typeof o.type === "string" && o.type.trim()) return o.type.trim();

    if ("signedIn" in o) {
        if (o.signedIn && typeof o.email === "string") return o.email.split("@")[0] || "signed in";
        return o.signedIn ? "signed in" : "guest";
    }

    if (typeof o.error === "string" && o.error.trim()) return o.error.trim();
    if (typeof o.path === "string" && o.path.trim()) return o.path.trim();

    for (const key of ["wordId", "grammarId", "sentenceId", "id"]) {
        if (o[key] != null && o[key] !== "") return `#${String(o[key]).slice(0, 8)}`;
    }

    if (typeof o.loaded === "number" && typeof o.wordTotal === "number") {
        return `${o.loaded}/${o.wordTotal}`;
    }
    if (typeof o.vocabCount === "number") return String(o.vocabCount);
    if (typeof o.total === "number") return String(o.total);

    return "";
}

/** Main log: `log("Update word", word)` → "Update word: 你好" */
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

export function logApiError(method, path, error) {
    const msg = error instanceof Error ? error.message : String(error ?? "error");
    const status =
        error && typeof error === "object" && "status" in error && error.status != null ? error.status : null;
    logError("API failed", status != null ? `${method} ${path} (${status}) — ${msg}` : `${method} ${path} — ${msg}`);
}
