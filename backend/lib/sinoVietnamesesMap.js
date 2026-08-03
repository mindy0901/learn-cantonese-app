/**
 * sinoVietnamesesMap.js
 * Builds a merged Han→Sino-Vietnamese map.
 *
 * Source priority: Unihan kVietnamese (kvietnamese.txt) first, then phienam.txt fallback.
 * Both readings are normalized to the app's Hán-Việt convention (uppercase).
 *
 * Returns:
 *   {
 *     map: Map<string, { value: string, source: "unihan" | "phienam" }>,
 *     stats: { total, unihan, phienam, onlyUnihan, onlyPhienam, both }
 *   }
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "..", "data");

function loadLinesData(file) {
    const raw = readFileSync(resolve(DATA_DIR, file), "utf-8");
    const map = new Map();
    for (const line of raw.split("\n")) {
        const eq = line.indexOf("=");
        if (eq <= 0) continue;
        const char = line.slice(0, eq).trim();
        const value = line.slice(eq + 1).trim();
        if (char && value) map.set(char, value);
    }
    return map;
}

/** Normalize a reading to app H-V convention (uppercase, trimmed, single-spaced). */
function normReading(value) {
    return String(value).trim().toUpperCase().replace(/\s+/g, " ");
}

/**
 * Build merged Han→SV map. Unihan takes priority; phienam fills gaps.
 */
export function buildMergedSinoVietnameseMap() {
    const unihan = loadLinesData("kvietnamese.txt");
    const phienam = loadLinesData("phienam.txt");

    const map = new Map();
    let usedUnihan = 0;
    let usedPhienam = 0;

    // Unihan priority
    for (const [char, value] of unihan) {
        if (!map.has(char)) {
            map.set(char, { value: normReading(value), source: "unihan" });
            usedUnihan++;
        }
    }
    // phienam fallback (only where Unihan missing)
    for (const [char, value] of phienam) {
        if (!map.has(char)) {
            map.set(char, { value: normReading(value), source: "phienam" });
            usedPhienam++;
        }
    }

    const both = [...unihan.keys()].filter((c) => phienam.has(c)).length;

    return {
        map,
        stats: {
            unihanTotal: unihan.size,
            phienamTotal: phienam.size,
            mapTotal: map.size,
            usedUnihan,
            usedPhienam,
            both,
            onlyUnihan: [...unihan.keys()].filter((c) => !phienam.has(c)).length,
            onlyPhienam: [...phienam.keys()].filter((c) => !unihan.has(c)).length,
        },
    };
}