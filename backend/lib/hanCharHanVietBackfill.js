import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { fetchAllRows, rowToHanCharacter, upsertBatched } from "./dataService.js";
import { normalizeSearchText } from "./searchNormalize.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {Map<string, string[]> | null} */
let _phienAmMap = null;

function loadPhienAm() {
    if (_phienAmMap) return _phienAmMap;
    _phienAmMap = new Map();

    const filePath = resolve(__dirname, "..", "data", "phienam.txt");
    let raw;
    try {
        raw = readFileSync(filePath, "utf-8");
    } catch {
        return _phienAmMap;
    }

    for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx < 1) continue;
        const ch = trimmed.slice(0, eqIdx);
        if (ch.length !== 1) continue;
        const reading = trimmed.slice(eqIdx + 1).trim();
        if (!reading) continue;

        const existing = _phienAmMap.get(ch);
        if (existing) {
            if (!existing.includes(reading)) existing.push(reading);
        } else {
            _phienAmMap.set(ch, [reading]);
        }
    }

    return _phienAmMap;
}

/**
 * Fill Hán-Việt readings for all han_characters using phienam.txt.
 */
export async function backfillHanCharHanViet(db, userId) {
    const rows = await fetchAllRows(db, "han_characters", userId);
    const phienAm = loadPhienAm();
    const toUpsert = [];
    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
        const existing = rowToHanCharacter(row);
        const ch = (existing.hanSimplified ?? "").trim();
        if (!ch) {
            skipped++;
            continue;
        }

        // Check both simplified and traditional forms for readings
        const readings = phienAm.get(ch) ?? [];
        if (readings.length === 0 && existing.hanTraditional) {
            const tradReadings = phienAm.get(existing.hanTraditional);
            if (tradReadings) readings.push(...tradReadings);
        }

        const prevHanViet = Array.isArray(existing.hanViet)
            ? existing.hanViet.join(" ")
            : String(existing.hanViet ?? "").trim();
        const nextHanViet = [...new Set(readings)];

        if (nextHanViet.length === 0 || prevHanViet === nextHanViet.join(" ")) {
            skipped++;
            continue;
        }

        // Rebuild search_key
        const hanTrad = String(existing.hanTraditional ?? "").trim();
        const pinyinArr = Array.isArray(existing.pinyin) ? existing.pinyin.join(" ") : String(existing.pinyin ?? "");
        const jyutpingArr = Array.isArray(existing.jyutping)
            ? existing.jyutping.join(" ")
            : String(existing.jyutping ?? "");
        const hanVietSearchText = [...new Set(nextHanViet.map((r) => normalizeSearchText(r)).filter(Boolean))].join(
            " ",
        );

        toUpsert.push({
            id: existing.id,
            user_id: userId,
            han_viet: nextHanViet,
            search_key: normalizeSearchText(
                ch + " " + hanTrad + " " + hanVietSearchText + " " + pinyinArr + " " + jyutpingArr,
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
