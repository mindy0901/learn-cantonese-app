/**
 * meaningsLookup.js
 * Look up Vietnamese + English meanings for a Han string from the local dicts:
 *   - CVDICT.json  → Vietnamese meaning (`vi`)
 *   - CEDICT.json  → English meanings (`en` array)
 * Both are indexed by simplified AND traditional Han form for fast lookup.
 * Returns a possibly-incomplete pair; callers fall back to the translate
 * pipeline for whichever side is missing.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { lookupCVDictVocab } from "./cvdictLoader.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

let cedictCache = null;

function loadCEDict() {
    if (cedictCache) return cedictCache;
    const entries = JSON.parse(readFileSync(resolve(__dirname, "..", "data", "CEDICT.json"), "utf-8"));
    const bySimp = new Map();
    const byTrad = new Map();
    for (const e of entries) {
        if (!bySimp.has(e.s)) bySimp.set(e.s, e);
        if (e.t && !byTrad.has(e.t)) byTrad.set(e.t, e);
    }
    cedictCache = { bySimp, byTrad };
    return cedictCache;
}

/**
 * Look up the meaning pair for a Han string.
 * @param {string|null} simplified
 * @param {string|null} traditional
 * @returns {{ vi: string, en: string }} raw meanings ("" when the dict has none)
 */
export function lookupDictMeanings(simplified, traditional) {
    const vi = lookupCVDictVocab(simplified, traditional) ?? "";

    const { bySimp, byTrad } = loadCEDict();
    const key = simplified || traditional;
    let hit = key ? bySimp.get(key) : null;
    if (!hit && traditional) hit = byTrad.get(traditional);
    if (!hit && key) hit = byTrad.get(key);
    const en = hit && Array.isArray(hit.en) ? hit.en.join("; ") : "";

    return { vi, en };
}
