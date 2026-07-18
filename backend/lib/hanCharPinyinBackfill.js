import { fetchAllRows, rowToHanCharacter, upsertBatched } from "./dataService.js";
import { toPinyin } from "./pinyin.js";
import { ensureHanVariants } from "./opencc.js";
import { normalizeSearchText } from "./searchNormalize.js";

/**
 * Fill or correct pinyin for all han_characters.
 * Converts character to simplified via OpenCC, then generates pinyin via pinyin-pro.
 */
export async function backfillHanCharPinyin(db, userId) {
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

        // Convert to simplified for better pinyin accuracy
        const { hanSimplified: sourceChar } = ensureHanVariants({ hanTraditional: character });
        const source = sourceChar.trim() || character;
        const nextPinyin = toPinyin(source);
        if (!nextPinyin) {
            skipped++;
            continue;
        }

        const prevPinyin = Array.isArray(existing.pinyin)
            ? existing.pinyin.join(" ")
            : String(existing.pinyin ?? "").trim();
        if (prevPinyin === nextPinyin) {
            skipped++;
            continue;
        }

        const pinyinArr = nextPinyin.split(" ").filter(Boolean);
        const pinyinText = [...new Set(pinyinArr.map((r) => normalizeSearchText(r)).filter(Boolean))].join(" ");

        // Rebuild search_key with updated pinyin
        const hanTrad = String(existing.hanTraditional ?? "").trim();
        const readings = Array.isArray(existing.hanViet) ? existing.hanViet.join(" ") : String(existing.hanViet ?? "");
        const jyutpingArr = Array.isArray(existing.jyutping)
            ? existing.jyutping.join(" ")
            : String(existing.jyutping ?? "");

        toUpsert.push({
            id: existing.id,
            user_id: userId,
            pinyin: pinyinArr.length > 0 ? pinyinArr : null,
            search_key: normalizeSearchText(
                character + " " + hanTrad + " " + readings + " " + pinyinText + " " + jyutpingArr,
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
