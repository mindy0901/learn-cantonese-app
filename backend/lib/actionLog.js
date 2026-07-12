/** Structured backend logs: area, action, subject, detail. */

function emit(level, parts) {
    const line = parts.filter(Boolean).join(' ');
    if (level === 'warn') console.warn(line);
    else if (level === 'error') console.error(line);
    else console.log(line);
}

function quoteLabel(text) {
    const trimmed = String(text ?? '').trim();
    return trimmed ? `"${trimmed}"` : '';
}

/** @param {string | { hanTraditional?: string, hanTrad?: string, han?: string, title?: string, name?: string, id?: string }} subject */
export function subjectLabel(subject) {
    if (!subject) return '';
    if (typeof subject === 'string') return quoteLabel(subject);
    if (subject.hanTraditional?.trim()) return quoteLabel(subject.hanTraditional);
    if (subject.hanTrad?.trim()) return quoteLabel(subject.hanTrad);
    if (subject.han?.trim()) return quoteLabel(subject.han);
    if (subject.title?.trim()) return quoteLabel(subject.title);
    if (subject.name?.trim()) return quoteLabel(subject.name);
    if (subject.id) return `#${String(subject.id).slice(0, 8)}`;
    return '';
}

export function userLabel(req) {
    const email = req?.session?.email;
    if (email) return email.split('@')[0];
    if (req?.session?.userId) return `#${String(req.session.userId).slice(0, 8)}`;
    return 'guest';
}

/** Process step, e.g. auth flow. */
export function logStep(area, step, detail) {
    emit('info', [`[${area}]`, step, detail ? `— ${detail}` : '']);
}

/** Request / mutation started (before DB call). */
export function logStart(area, action, subject, actor) {
    const label = subjectLabel(subject);
    const parts = [`[${area}]`, `${action} started`, label];
    if (actor) parts.push(`by ${actor}`);
    emit('info', parts.filter(Boolean));
}

/** Completed action with optional subject. */
export function logAction(area, action, subject, detail) {
    const label = subjectLabel(subject);
    emit('info', [`[${area}]`, action, label, detail ? `(${detail})` : ''].filter(Boolean));
}

export function logOk(area, action, subject, detail) {
    logAction(area, `${action} succeeded`, subject, detail);
}

export function logFail(area, action, detail) {
    emit('warn', [`[${area}]`, `${action} failed`, detail ? `— ${detail}` : ''].filter(Boolean));
}

export function logWarn(area, message, detail) {
    emit('warn', [`[${area}]`, message, detail ? `— ${detail}` : ''].filter(Boolean));
}

export function logError(area, message, detail) {
    emit('error', [`[${area}]`, message, detail ? `— ${detail}` : ''].filter(Boolean));
}

/** @deprecated Prefer logStep / logAction */
export function log(message) {
    console.log(message);
}
