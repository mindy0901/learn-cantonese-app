import { fetchAllRows, rowToHanCharacter, upsertBatched } from "./dataService.js";
import { toJyutping, toJyutpingList } from "./jyutping.js";
import { normalizeSearchText } from "./searchNormalize.js";

/**
 * Fill or correct Jyutping for all han_characters using to-jyutping.
 * Handles both simplified and traditional characters directly.
 */
export async function backfillHanCharJyutping(db, userId) {
    const rows = await fetchAllRows(db, "han_characters", userId);
    const toUpsert = [];
    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
        const existing = rowToHanCharacter(row);
        const character = (existing.hanSimplified ?? "").trim();
        if (!character) {
            skipped++;
            continue;
        }

        const jyutpingText = toJyutping(character);
        if (!jyutpingText) {
            skipped++;
            continue;
        }

        const readings = toJyutpingList(character);
        if (readings.length === 0) {
            skipped++;
            continue;
        }

        const prevJyutping = Array.isArray(existing.jyutping)
            ? existing.jyutping.join(" ")
            : String(existing.jyutping ?? "").trim();
        if (prevJyutping === readings.join(" ")) {
            skipped++;
            continue;
        }

        // Rebuild search_key with updated jyutping
        const jyutpingSearchText = [...new Set(readings.map((r) => normalizeSearchText(r)).filter(Boolean))].join(" ");
        const hanTrad = String(existing.hanTraditional ?? "").trim();
        const hanVietText = Array.isArray(existing.hanViet)
            ? existing.hanViet.join(" ")
            : String(existing.hanViet ?? "");
        const pinyinArr = Array.isArray(existing.pinyin) ? existing.pinyin.join(" ") : String(existing.pinyin ?? "");

        toUpsert.push({
            id: existing.id,
            user_id: userId,
            jyutping: readings,
            search_key: normalizeSearchText(
                character + " " + hanTrad + " " + hanVietText + " " + pinyinArr + " " + jyutpingSearchText,
            ),
            updated_at: new Date().toISOString(),
        });
        updated++;
    }

    if (toUpsert.length > 0) {
        await upsertBatched(db, "han_characters", toUpsert);
    }

    return { total: rows.length, updated, skipped };
}
