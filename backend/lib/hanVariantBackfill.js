import { fetchAllRows, rowToWord, upsertBatched, wordToRow } from "./dataService.js";
import { normalizeWordFields } from "./wordNormalize.js";

/** Fill han_traditional + han_simplified for all words via OpenCC (HK traditional + simplified). */
export async function backfillHanVariants(db, userId) {
    const rows = await fetchAllRows(db, "words", userId);
    const toUpsertById = new Map();
    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
        const existing = rowToWord(row);
        const prevTrad = String(existing.hanTraditional ?? "").trim();
        const prevSimp = String(existing.hanSimplified ?? "").trim();
        if (!prevTrad && !prevSimp) {
            skipped++;
            continue;
        }

        const normalized = normalizeWordFields(existing);
        const nextTrad = String(normalized.hanTraditional ?? "").trim();
        const nextSimp = String(normalized.hanSimplified ?? "").trim();
        const unchanged = prevTrad === nextTrad && prevSimp === nextSimp;

        if (unchanged) {
            skipped++;
            continue;
        }

        toUpsertById.set(existing.id, wordToRow(normalized, userId, { includeCreatedAt: false }));
        updated++;
    }

    const toUpsert = [...toUpsertById.values()];
    if (toUpsert.length > 0) {
        await upsertBatched(db, "words", toUpsert);
    }

    return { total: rows.length, updated, skipped };
}
