/**
 * sinoVietnamesesMap.js
 * Loads the merged Han→Sino-Vietnamese map from backend/data/sino-vietnamese.json.
 *
 * The merged file is produced by merge-hanviet.mjs from kvietnamese.txt (Unihan
 * kVietnamese) + phienam.txt. Priority (verified 2026-08-05): phienam is MORE
 * ACCURATE → primary reading; kvietnamese is newer but less accurate → alternate.
 *
 * File shape (char → reading):
 *   - string → single reading:    "人": "NHÂN"
 *   - object → multiple readings: "二": { "readings": ["NHỊ", "NHÌ"] }
 *                                  readings[0] = primary (phienam)
 *
 * Returns:
 *   {
 *     map: Map<string, { value: string, source: "merged" }>,
 *     stats: { total, single, multi }
 *   }
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "..", "data");

/**
 * Build merged Han→SV map from the single merged JSON file.
 */
export function buildMergedSinoVietnameseMap() {
    const raw = JSON.parse(readFileSync(resolve(DATA_DIR, "sino-vietnamese.json"), "utf-8"));
    const map = new Map();
    let single = 0;
    let multi = 0;

    for (const [char, entry] of Object.entries(raw)) {
        const isMulti = entry && typeof entry === "object" && Array.isArray(entry.readings);
        const value = isMulti ? String(entry.readings[0]).trim() : String(entry).trim();
        if (!char || !value) continue;
        map.set(char, { value, source: "merged" });
        if (isMulti && entry.readings.length > 1) multi++;
        else single++;
    }

    return {
        map,
        stats: { total: map.size, single, multi },
    };
}
