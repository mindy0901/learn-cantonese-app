import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import ToJyutping from "to-jyutping";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Tier 2: rime-cantonese jyut6ping3.dict.yaml ──────────────────────

/** @type {Map<string, string[]> | null} */
let _jyutpingDictMap = null;

function loadJyutpingDict() {
    if (_jyutpingDictMap) return _jyutpingDictMap;
    _jyutpingDictMap = new Map();

    const filePath = resolve(__dirname, "..", "data", "jyut6ping3.dict.yaml");
    let raw;
    try {
        raw = readFileSync(filePath, "utf-8");
    } catch {
        return _jyutpingDictMap;
    }

    // Skip YAML front matter — data starts after the second "---" or "..."
    const parts = raw.split(/^---$/m);
    const dataSection = parts.length >= 3 ? parts.slice(2).join("---") : raw;
    for (const line of dataSection.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("...")) continue;
        // Format: character\tjyutping
        const tabIdx = trimmed.indexOf("\t");
        if (tabIdx < 1) continue;
        const ch = trimmed.slice(0, tabIdx);
        if (ch.length !== 1) continue;
        const jp = trimmed.slice(tabIdx + 1).trim();
        if (!jp || !/^[a-z]+[1-6]$/.test(jp)) continue;

        const existing = _jyutpingDictMap.get(ch);
        if (existing) {
            if (!existing.includes(jp)) existing.push(jp);
        } else {
            _jyutpingDictMap.set(ch, [jp]);
        }
    }

    return _jyutpingDictMap;
}

// ── Tier 3: rime-cantonese-upstream char.csv lookup ──────────────────────

/** @type {Map<string, string[]> | null} */
let _charCsvMap = null;

function loadCharCsv() {
    if (_charCsvMap) return _charCsvMap;
    _charCsvMap = new Map();

    const filePath = resolve(__dirname, "..", "data", "char.csv");
    let raw;
    try {
        raw = readFileSync(filePath, "utf-8");
    } catch {
        return _charCsvMap; // empty map if file missing
    }

    for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("char,")) continue;

        const firstComma = trimmed.indexOf(",");
        if (firstComma < 1) continue;
        const ch = trimmed.slice(0, firstComma);
        if (ch.length !== 1) continue; // single char only

        const rest = trimmed.slice(firstComma + 1);
        const secondComma = rest.indexOf(",");
        const jp = secondComma >= 0 ? rest.slice(0, secondComma) : rest;
        if (!jp) continue;

        const existing = _charCsvMap.get(ch);
        if (existing) {
            if (!existing.includes(jp)) existing.push(jp);
        } else {
            _charCsvMap.set(ch, [jp]);
        }
    }

    return _charCsvMap;
}

// ── Tier 4: CC-Canto fallback ────────────────────────────────────────────

/** @type {Map<string, string[]> | null} */
let _ccCantoMap = null;

function loadCcCanto() {
    if (_ccCantoMap) return _ccCantoMap;
    _ccCantoMap = new Map();

    const filePath = resolve(__dirname, "..", "data", "cccanto-webdist.txt");
    let raw;
    try {
        raw = readFileSync(filePath, "utf-8");
    } catch {
        return _ccCantoMap;
    }

    for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;

        const jyutpingMatch = trimmed.match(/\{([^}]+)\}/);
        if (!jyutpingMatch) continue;

        const parts = trimmed.split(/\s+/);
        if (parts.length < 2) continue;
        const traditional = parts[1];
        if (traditional.length !== 1) continue;

        const readings = jyutpingMatch[1]
            .split("/")
            .map((r) => r.trim())
            .filter((r) => /^[a-z]+[1-6]$/.test(r));
        if (readings.length === 0) continue;

        const existing = _ccCantoMap.get(traditional);
        if (existing) {
            for (const r of readings) {
                if (!existing.includes(r)) existing.push(r);
            }
        } else {
            _ccCantoMap.set(traditional, [...new Set(readings)]);
        }
    }

    return _ccCantoMap;
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Convert Chinese text to Jyutping (Cantonese romanization).
 * 4-tier approach:
 *   1. to-jyutping (ML model, handles both simplified & traditional)
 *   2. jyut6ping3.dict.yaml from rime-cantonese (curated dictionary)
 *   3. rime-cantonese-upstream char.csv (supplementary)
 *   4. CC-Canto (legacy fallback)
 *
 * Returns space-separated jyutping string with tone numbers (e.g., "zung1 man4").
 */
export function toJyutping(text) {
    const value = String(text ?? "").trim();
    if (!value) return "";

    // Tier 1: to-jyutping ML model
    const mlResult = ToJyutping.getJyutpingText(value);
    if (mlResult && !/^\s*$/.test(mlResult)) {
        const mlPairs = ToJyutping.getJyutpingList(value);
        const allCovered = mlPairs.every(([, jp]) => jp && jp.trim());
        if (allCovered) return mlResult;
    }

    // Fall back to per-character lookup for missing chars
    const jyutpingDict = loadJyutpingDict();
    const charCsv = loadCharCsv();
    const ccCanto = loadCcCanto();
    const mlPairs = ToJyutping.getJyutpingList(value);

    const parts = [];
    for (const [ch, jp] of mlPairs) {
        // Preserve "/" separator for variant characters
        if (ch === "/") {
            parts.push("/");
            continue;
        }
        if (jp && jp.trim()) {
            parts.push(jp.trim());
        } else {
            // Tier 2: jyut6ping3.dict.yaml
            const dictReadings = jyutpingDict.get(ch);
            if (dictReadings && dictReadings.length > 0) {
                parts.push(dictReadings[0]);
                continue;
            }
            // Tier 3: char.csv lookup
            const csvReadings = charCsv.get(ch);
            if (csvReadings && csvReadings.length > 0) {
                parts.push(csvReadings[0]);
                continue;
            }
            // Tier 4: CC-Canto fallback
            const ccReadings = ccCanto.get(ch);
            if (ccReadings && ccReadings.length > 0) {
                parts.push(ccReadings[0]);
                continue;
            }
        }
    }

    return parts.join(" ");
}

/**
 * Get all known jyutping readings for a character.
 * For single characters, merges readings from ALL 4 sources.
 * For multi-character text, uses to-jyutping contextual readings only.
 * Returns array of unique readings (e.g., ["haang4", "hang4", "hong4"]).
 */
export function toJyutpingList(text) {
    const value = String(text ?? "").trim();
    if (!value) return [];

    const readings = new Set();

    // Tier 1: to-jyutping
    const mlPairs = ToJyutping.getJyutpingList(value);
    for (const [, jp] of mlPairs) {
        if (jp) {
            for (const r of jp.split(/\s+/)) {
                readings.add(r);
            }
        }
    }

    // For single characters, also merge dictionary readings (Tier 2 + 3 + 4)
    if ([...value].length === 1) {
        const jyutpingDict = loadJyutpingDict();
        const dictReadings = jyutpingDict.get(value);
        if (dictReadings) {
            for (const r of dictReadings) readings.add(r);
        }

        const charCsv = loadCharCsv();
        const csvReadings = charCsv.get(value);
        if (csvReadings) {
            for (const r of csvReadings) readings.add(r);
        }

        const ccCanto = loadCcCanto();
        const ccReadings = ccCanto.get(value);
        if (ccReadings) {
            for (const r of ccReadings) readings.add(r);
        }
    }

    return [...readings];
}
