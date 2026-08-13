import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ToJyutping from "to-jyutping";
import { normalizeRomanizationPunctuation } from "./wordNormalize.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** cantowords (words.hk) full-word jyutping — highest priority source. */
const cantowordsMap = new Map();
{
    const raw = JSON.parse(readFileSync(resolve(__dirname, "../data/cantowords-jyutping-words.json"), "utf-8"));
    for (const [word, readings] of Object.entries(raw)) {
        const jp = Array.isArray(readings) && readings.length ? String(readings[0]).trim() : "";
        if (word && jp) cantowordsMap.set(word, jp);
    }
}

/** CC-Canto full-word map (trad OR simp → jyutping) — second source. */
const cantoMap = new Map();
{
    const raw = JSON.parse(readFileSync(resolve(__dirname, "../data/cccanto.json"), "utf-8"));
    for (const e of raw) {
        if (!e.jp) continue;
        if (!cantoMap.has(e.t)) cantoMap.set(e.t, e.jp);
        if (e.s && !cantoMap.has(e.s)) cantoMap.set(e.s, e.jp);
    }
}

/**
 * Resolve jyutping for a Chinese word.
 * Priority: cantowords (words.hk) → CC-Canto full-word → to-jyutping fallback.
 */
export function lookupJyutping(text) {
    const input = String(text ?? "").trim();
    if (!input) return "";

    let result = "";
    // 1. cantowords (words.hk) full-word — highest priority
    const cw = cantowordsMap.get(input);
    if (cw) result = cw;
    else {
        // 2. CC-Canto full-word
        const canto = cantoMap.get(input);
        if (canto) result = canto;
        // 3. Fallback: to-jyutping (context-aware full-word)
        else result = ToJyutping.getJyutpingText(input);
    }
    return normalizeRomanizationPunctuation(result);
}
