/**
 * In-memory sync job manager for the "Sync stroke count" action.
 * Frontend polls progress via GET /api/data/sync-han-char-strokes/progress/:jobId.
 */
import { randomUUID } from "crypto";
import { backfillHanCharStrokes } from "./hanCharStrokeSync.js";

const jobs = new Map(); // jobId → { id, status, processed, total, current, updated, error, done }

export function createStrokeJob() {
    const job = {
        id: randomUUID(),
        status: "pending",
        processed: 0,
        total: 0,
        current: "",
        updated: 0,
        error: null,
        done: false,
    };
    jobs.set(job.id, job);
    return job;
}

export function getStrokeJob(jobId) {
    return jobs.get(jobId) ?? null;
}

/** Kick off the stroke backfill in the background (not awaited by caller). */
export async function runStrokeJob(jobId, mode = "fast") {
    const job = jobs.get(jobId);
    if (!job) return;
    job.status = "running";
    job.mode = mode;
    try {
        const result = await backfillHanCharStrokes({
            mode,
            onProgress: ({ processed, total, current }) => {
                job.processed = processed;
                job.total = total;
                job.current = current ?? "";
            },
        });
        job.updated = result.updated;
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
