/**
 * Split Chinese pinyin (romanization) strings into per-character syllables.
 * "ālābóyǔ" → "ā lā bó yǔ", "yīyī" → "yī yī"
 * Special erhua rule: trailing "r" attaches to previous syllable: "yīxiàr" → "yī xiàr"
 */

const SYLLABLE_RE =
    /([bpmfdtnlgkhjqxrzcs]?h?|[bpmfdtnlgkhjqxrzcsyw]?)([iïuü]{0,1}[aāáǎàeēéěèoōóǒòiīíǐìuūúǔùüǖǘǚǜ]{1,2}(?:ng?|r|[iïuü]|))(?=[bpmfdtnlgkhjqxrzcs]|[A-ZĀÁǍÀĒÉĚÈŌÓǑÒĪÍǏÌŪÚǓÙǕǗǙǛ]|\s|$)/gi;

/**
 * Split a single pinyin reading into space-separated syllables.
 * Also handles comma/slash-separated multi-reading strings.
 * Erhua rule: if the word ends with 儿, trailing "r" attaches to the prior syllable.
 */
export function splitPinyin(pinyin, options = {}) {
    if (!pinyin) return pinyin;

    const erhua = options.erhua ?? false;

    // Handle comma/slash-separated readings: split by delimiter, split each, rejoin
    const readings = pinyin
        .split(/[,，/、]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    if (readings.length > 1) {
        return readings.map((r) => splitSingle(r, erhua)).join(", ");
    }
    return splitSingle(pinyin, erhua);
}

function splitSingle(pinyin, erhua) {
    // Strip existing spaces first, then re-split
    const raw = pinyin.replace(/\s+/g, "");
    const parts = raw.match(SYLLABLE_RE);
    if (!parts) return pinyin;

    let result = parts.join(" ");

    // Erhua rule: if raw ends with "r" but split didn't capture it as part of last syllable,
    // attach "r" to the previous syllable (e.g., "yīxiàr" → "yī xià" → fix to "yī xiàr")
    if (erhua && /r$/i.test(raw)) {
        const lastPart = parts[parts.length - 1];
        if (!/r$/i.test(lastPart)) {
            // Last syllable doesn't end with r → append r to it
            parts[parts.length - 1] = lastPart + "r";
            result = parts.join(" ");
        }
    }

    // Also handle case where a standalone " r" is already present (attach to previous)
    result = result.replace(/ (\S+) r$/i, " $1r");

    return result;
}
