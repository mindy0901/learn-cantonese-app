/**
 * merge-hanviet.mjs
 * Merge kvietnamese.txt (Unihan kVietnamese) + phienam.txt into ONE file:
 *   backend/data/sino-vietnamese.json
 *
 * Priority: phienam is MORE ACCURATE (verified 2026-08-05) → primary reading.
 * kvietnamese is NEWER but less accurate → kept as alternate.
 *
 * Output shape (JSON object, char → reading):
 *   - single reading  → string:        "人": "NHÂN"
 *   - multiple        → object:        "二": { "readings": ["NHỊ", "NHÌ"] }
 *        readings[0] = primary (phienam), the rest = alternates (kvietnamese).
 *
 * Readings are normalized to the app's Hán-Việt convention (uppercase).
 *
 * Usage: node merge-hanviet.mjs
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "data");

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

function normReading(value) {
    return String(value).trim().toUpperCase().replace(/\s+/g, " ");
}

const phienam = loadLinesData("phienam.txt");
const kvietnamese = loadLinesData("kvietnamese.txt");

const chars = new Set([...phienam.keys(), ...kvietnamese.keys()]);
const out = {};
let single = 0;
let multi = 0;

for (const ch of chars) {
    const readings = [];
    if (phienam.has(ch)) readings.push(normReading(phienam.get(ch)));
    if (kvietnamese.has(ch)) readings.push(normReading(kvietnamese.get(ch)));
    // dedupe (case-insensitive already via uppercase)
    const uniq = [...new Set(readings)];
    if (uniq.length === 1) {
        out[ch] = uniq[0];
        single++;
    } else {
        // phienam first = primary (more accurate)
        out[ch] = { readings: uniq };
        multi++;
    }
}

writeFileSync(resolve(DATA_DIR, "sino-vietnamese.json"), JSON.stringify(out, null, 2), "utf-8");

console.log("phienam entries:", phienam.size);
console.log("kvietnamese entries:", kvietnamese.size);
console.log("merged total chars:", chars.size);
console.log("single reading:", single);
console.log("multiple readings (object):", multi);
