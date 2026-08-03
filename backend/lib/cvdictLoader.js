/**
 * cvdictLoader.js
 * Loads cvdict.json (Chinese-Vietnamese dictionary from CVDICT/CEDICT) and indexes
 * it for fast lookup by simplified OR traditional Han form.
 *
 * The Vietnamese dictionary is Mandarin (pinyin)-based but matches on Han characters,
 * which the Cantonese app can reuse for pre-filling vietMeanings.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

let cache = null;

export function loadCVDict() {
    if (cache) return cache;
    const file = resolve(__dirname, "..", "data", "cvdict.json");
    const entries = JSON.parse(readFileSync(file, "utf-8"));

    const bySimp = new Map();
    const byTrad = new Map();
    for (const e of entries) {
        if (!bySimp.has(e.s)) bySimp.set(e.s, e);
        if (e.t && !byTrad.has(e.t)) byTrad.set(e.t, e);
    }
    cache = { entries, bySimp, byTrad };
    return cache;
}

/**
 * Look up Vietnamese meaning for a Han string (uses simplified then traditional).
 * Returns the cleaned Vietnamese definition or null.
 */
export function lookupCVDictVocab(simplified, traditional) {
    const { bySimp, byTrad } = loadCVDict();
    const key = simplified || traditional;
    if (!key) return null;
    const hit = bySimp.get(key) || (traditional ? byTrad.get(traditional) : null) || byTrad.get(key);
    return hit ? hit.vi : null;
}