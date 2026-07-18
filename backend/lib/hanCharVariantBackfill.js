import { fetchAllRows, rowToHanCharacter, upsertBatched } from "./dataService.js";
import { toHanSimplified, toHanHK, ensureHanVariants } from "./opencc.js";
import { normalizeSearchText } from "./searchNormalize.js";

/**
 * Fill han_traditional for all han_characters via OpenCC (bidirectional).
 * - If stored char is traditional → convert to simplified + HK traditional
 * - If stored char is simplified → convert to HK traditional
 * - Char without variant difference → han_traditional = null
 */
export async function backfillHanCharVariants(db, userId) {
    const rows = await fetchAllRows(db, "han_characters", userId);
    const toUpsert = [];
    let updated = 0;
    let skipped = 0;
    let same = 0;

    for (const row of rows) {
        const existing = rowToHanCharacter(row);
        const ch = (existing.hanSimplified ?? "").trim();
        if (!ch) {
            skipped++;
            continue;
        }

        const prevTraditional = (existing.hanTraditional ?? "").trim();

        // Bidirectional: get both simplified and HK traditional from the stored char
        const simplified = toHanSimplified(ch); // ch → simplified (via tw→cn)
        const hkTraditional = toHanHK(ch); // ch → HK traditional (via cn→hk after tw→cn)

        // If both forms are identical, no variant exists
        if (simplified === hkTraditional || !simplified || !hkTraditional) {
            if (prevTraditional) {
                // Had a traditional form but it should be null (same char)
                toUpsert.push({
                    id: existing.id,
                    user_id: userId,
                    han_simplified: ch,
                    han_traditional: null,
                    updated_at: new Date().toISOString(),
                });
                updated++;
            } else {
                same++;
            }
            continue;
        }

        // Determine if stored char is simplified or traditional
        const charIsTraditional = ch !== simplified;
        const charIsSimplified = ch !== hkTraditional;

        const nextSimp = charIsTraditional ? simplified : ch;
        const nextTrad = charIsSimplified ? hkTraditional : ch;

        const simpChanged = ch !== nextSimp;
        const tradChanged = prevTraditional !== nextTrad;

        if (!simpChanged && !tradChanged) {
            skipped++;
            continue;
        }

        const patch = {
            id: existing.id,
            user_id: userId,
            han_simplified: nextSimp,
            han_traditional: nextTrad !== nextSimp ? nextTrad : null,
            updated_at: new Date().toISOString(),
        };

        if (simpChanged) {
            const readings = Array.isArray(existing.hanViet)
                ? existing.hanViet.join(" ")
                : String(existing.hanViet ?? "");
            const pinyin = Array.isArray(existing.pinyin) ? existing.pinyin.join(" ") : String(existing.pinyin ?? "");
            const jyutpingArr = Array.isArray(existing.jyutping)
                ? existing.jyutping.join(" ")
                : String(existing.jyutping ?? "");
            patch.search_key = normalizeSearchText(
                nextSimp + " " + nextTrad + " " + readings + " " + pinyin + " " + jyutpingArr,
            );
        }

        toUpsert.push(patch);
        updated++;
    }

    if (toUpsert.length > 0) {
        await upsertBatched(db, "han_characters", toUpsert);
    }

    return { total: rows.length, updated, skipped, same };
}
