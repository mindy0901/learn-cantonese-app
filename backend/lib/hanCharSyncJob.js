/**
 * In-memory sync job manager for the "Sync Han Characters" action.
 * A job runs the full backfill with a progress callback; the frontend polls
 * progress via GET /api/data/sync-han-characters/progress/:jobId.
 */
import { randomUUID } from "crypto";
import { backfillVocabularyHanCharacters } from "./hanCharacterBreakdown.js";

const jobs = new Map(); // jobId → { id, status, processed, total, current, created, updated, linked, merged, error, done }

export function createSyncJob() {
    const job = {
        id: randomUUID(),
        status: "pending",
        processed: 0,
        total: 0,
        current: "",
        created: 0,
        updated: 0,
        linked: 0,
        merged: 0,
        error: null,
        done: false,
    };
    jobs.set(job.id, job);
    return job;
}

export function getSyncJob(jobId) {
    return jobs.get(jobId) ?? null;
}

/**
 * Kick off the backfill in the background (not awaited by caller).
 * @param {string} jobId
 * @param {"fast"|"full"} [mode] Sync mode: fast = only unsynced vocabularies; full = wipe + rebuild
 */
export async function runSyncJob(jobId, mode = "fast") {
    const job = jobs.get(jobId);
    if (!job) return;
    job.status = "running";
    job.mode = mode;
    try {
        const result = await backfillVocabularyHanCharacters(
            {},
            ({ processed, total, current }) => {
                job.processed = processed;
                job.total = total;
                job.current = current ?? "";
            },
            mode,
        );
        job.created = result.created;
        job.updated = result.updated;
        job.linked = result.linked;
        job.merged = result.merged;
        job.reset = !!result.reset;
        job.total = result.total;
        job.processed = result.total;
        job.status = "done";
        job.done = true;
    } catch (err) {
        job.status = "error";
        job.error = err instanceof Error ? err.message : String(err);
        job.done = true;
    }
}
