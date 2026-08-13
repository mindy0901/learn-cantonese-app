/**
 * analyze-sv-coverage.mjs — Compare hanviet-pinyin.csv (ph0ngp repo)
 * against our current sino-vietnamese.json AND coverage of real data (DB).
 *
 * Read-only analysis — no DB writes.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "data");

// ── 1. Parse hanviet-pinyin.csv ──
const raw = readFileSync(resolve(DATA_DIR, "_hanviet-pinyin.csv"), "utf8");
const lines = raw.split(/\r?\n/).filter((l) => l.trim());
const csvMap = new Map(); // char -> Set<readings>
let rows = 0;
for (const l of lines.slice(1)) {
    const m = l.match(/^([^,]+),\[(.*?)\],(.+)$/);
    if (!m) continue;
    const ch = m[1].trim();
    let readings;
    try {
        readings = JSON.parse(`[${m[2]}]`);
    } catch {
        readings = String(m[2])
            .split("'")
            .filter((x) => x && x !== ",");
    }
    if (!csvMap.has(ch)) csvMap.set(ch, new Set());
    for (const r of readings || []) if (r) csvMap.get(ch).add(String(r).trim());
    rows++;
}
const csvChars = [...csvMap.keys()];
let csvReadCount = 0;
for (const s of csvMap.values()) csvReadCount += s.size;
console.log("=== hanviet-pinyin.csv (ph0ngp repo) ===");
console.log(`  rows: ${rows} | unique chars: ${csvChars.length} | readings: ${csvReadCount}`);

// ── 2. Our existing merged map ──
const our = JSON.parse(readFileSync(resolve(DATA_DIR, "sino-vietnamese.json"), "utf-8"));
const ourChars = Object.keys(our);
let ourReadCount = 0;
for (const c of ourChars) {
    const e = our[c];
    ourReadCount += e && typeof e === "object" && Array.isArray(e.readings) ? e.readings.length : 1;
}
console.log("\n=== sino-vietnamese.json (current map) ===");
console.log(`  chars: ${ourChars.length} | readings: ${ourReadCount}`);

// ── 3. Overlap between the two maps ──
const ourSet = new Set(ourChars);
const csvSet = new Set(csvChars);
const inBoth = csvChars.filter((c) => ourSet.has(c)).length;
const newOnly = csvChars.filter((c) => !ourSet.has(c)).length;
const missingFromRepo = ourChars.filter((c) => !csvSet.has(c)).length;
console.log("\n=== Map overlap ===");
console.log(`  in both: ${inBoth}`);
console.log(`  NEW chars from repo (not in current map): ${newOnly}`);
console.log(`  chars in current map missing from repo: ${missingFromRepo}`);
console.log(
    `  sample new-only: ${
        newOnly
            ? csvChars
                  .filter((c) => !ourSet.has(c))
                  .slice(0, 25)
                  .join(", ")
            : "none"
    }`,
);
