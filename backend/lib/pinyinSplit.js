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
    // Split by existing spaces, process each segment independently
    // This preserves correct splits and only fixes merged segments
    const segments = pinyin.trim().split(/\s+/).filter(Boolean);
    const allParts = [];
    for (const seg of segments) {
        let parts = seg.match(SYLLABLE_RE);
        if (!parts) {
            allParts.push(seg);
            continue;
        }
        // Second pass: split parts that contain adjacent tone-marked vowels
        // e.g. "gèàn" → ["gè", "àn"], "jiāāi" → ["jiā", "āi"]
        parts = splitAdjacentTones(parts);
        allParts.push(...parts);
    }

    if (allParts.length === 0) return pinyin;

    let result = allParts.join(" ");

    // Erhua rule: if raw ends with "r" but split didn't capture it as part of last syllable,
    // attach "r" to the previous syllable (e.g., "yīxiàr" → "yī xià" → fix to "yī xiàr")
    const rawNoSpace = pinyin.replace(/\s+/g, "");
    if (erhua && /r$/i.test(rawNoSpace)) {
        const lastPart = allParts[allParts.length - 1];
        if (!/r$/i.test(lastPart)) {
            // Last syllable doesn't end with r → append r to it
            allParts[allParts.length - 1] = lastPart + "r";
            result = allParts.join(" ");
        }
    }

    // Also handle case where a standalone " r" is already present (attach to previous)
    result = result.replace(/ (\S+) r$/i, " $1r");

    return result;
}

/**
 * Split parts that contain adjacent tone-marked vowels into separate syllables.
 * Tone marks: āáǎà ēéěè īíǐì ōóǒò ūúǔù ǖǘǚǜ
 * e.g. "gèàn" → ["gè", "àn"], "jiāāi" → ["jiā", "āi"], "mùǒu" → ["mù", "ǒu"]
 */
const TONE_MARK = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/;
const TONE_MARK_G = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/g;

function splitAdjacentTones(parts) {
    const result = [];
    for (const part of parts) {
        // Find all tone mark positions
        const matches = [...part.matchAll(TONE_MARK_G)];
        if (matches.length <= 1) {
            result.push(part);
            continue;
        }
        // Split at each position between two adjacent tone marks
        let remaining = part;
        for (let i = 0; i < matches.length - 1; i++) {
            const currIdx = matches[i].index;
            const nextIdx = matches[i + 1].index;
            // Split after the current syllable ends, before next tone mark
            // A syllable boundary between two tone marks is right before the next tone mark's initial consonant
            // But the next tone mark could be at the start of the next syllable (e.g., "àn" in "gèàn")
            // We need to split BEFORE the consonant that precedes the next tone mark
            // Find the consonant before the next tone: scan back from next tone to find first consonant or start
            let splitAt = nextIdx;
            // Look backwards from the tone mark to find the beginning of the syllable
            // A syllable starts with an optional consonant, so find the position after previous tone's syllable ends
            // The split point is right before the consonant (if any) that starts the next syllable
            // In "gèàn": tone marks at 1(è) and 3(à), split between 1 and 2 → "gè" + "àn"
            // In "jiāāi": tone marks at 2(ā) and 3(ā), split between 2 and 3 → "jiā" + "āi"
            // In "nǚér": tone marks at 1(ǚ) and 3(é), split between 1 and 2 → "nǚ" + "ér"
            // In "cìěr": tone marks at 1(ì) and 3(ě), split between 1 and 2 → "cì" + "ěr"
            // So: split at position (currIdx + 1) — right after the current tone-marked vowel
            // BUT: need to include trailing consonants (n, ng, r) with the current syllable
            // Actually the safest split: find the start of the next syllable
            // Next syllable starts with optional consonant + vowel. The tone mark is on the vowel.
            // In "gèàn": tone at 1(è), next tone at 3(à), the 'n' between them belongs to next syllable
            // So split at position 2: "gè" + "àn"
            // In "nǚér": tone at 1(ǚ), next tone at 3(é), the 'r' belongs to next syllable
            // So split at position 2: "nǚ" + "ér"
            // Pattern: split right after the current tone-marked vowel
            splitAt = currIdx + 1;
            // But make sure we don't split in the middle of "ng" ending
            // If the character after tone is 'n' and the one after is 'g', include 'ng' with current
            if (remaining[splitAt] === "n" && remaining[splitAt + 1] === "g") {
                splitAt = currIdx + 2; // include 'ng'
            }

            const first = remaining.slice(0, splitAt);
            remaining = remaining.slice(splitAt);
            result.push(first);
        }
        result.push(remaining);
    }
    return result;
}
