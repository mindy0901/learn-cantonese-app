/**
 * Extract unique Chinese characters from word strings.
 * Matches CJK Unified Ideographs (U+4E00–U+9FFF) and Extension A (U+3400–U+4DBF).
 */
const HAN_REGEX = /[\u3400-\u4dbf\u4e00-\u9fff]/g;

/**
 * Extract unique Chinese characters from an array of words.
 * Scans hanTraditional and hanSimplified fields.
 * @param {Array<{hanTraditional?: string, hanSimplified?: string}>} words
 * @returns {string[]} unique characters sorted by Unicode code point
 */
export function extractHanCharsFromWords(words) {
    const chars = new Set();
    for (const word of words) {
        const text = (word.hanTraditional ?? "") + (word.hanSimplified ?? "");
        for (const ch of text) {
            if (HAN_REGEX.test(ch)) chars.add(ch);
        }
        HAN_REGEX.lastIndex = 0; // reset regex after test()
    }
    return [...chars].sort((a, b) => a.localeCompare(b, "zh"));
}

/**
 * Find characters present in words but missing from hanCharacters.
 * @param {Array<{hanTraditional?: string, hanSimplified?: string}>} words
 * @param {Array<{hanSimplified: string, hanTraditional?: string}>} hanCharacters
 * @returns {string[]} characters to add
 */
export function findMissingHanChars(words, hanCharacters) {
    const wordChars = extractHanCharsFromWords(words);
    const existing = new Set();
    for (const h of hanCharacters) {
        if (h.hanSimplified) existing.add(h.hanSimplified);
        if (h.hanTraditional) existing.add(h.hanTraditional);
    }
    return wordChars.filter((ch) => !existing.has(ch));
}

/**
 * Find missing characters WITH readings AND existing chars needing variant updates.
 * @param {Array} words - vocabularies
 * @param {Array} hanCharacters - existing han characters
 * @returns {{ missing: Array<{hanSimplified, hanTraditional, pinyin, jyutping, sinoVietnamese}>, updates: Array<{id, hanTraditional?, hanSimplified?}> }}
 */
export function findMissingHanCharsWithReadings(words, hanCharacters) {
    // Build lookup: both simp and trad → the full hanCharacter entry
    const existingByChar = new Map(); // char → hanCharacter entry
    for (const h of hanCharacters) {
        const simp = h.hanSimplified || "";
        const trad = h.hanTraditional || "";
        if (simp) existingByChar.set(simp, h);
        if (trad) existingByChar.set(trad, h);
    }

    // Build variant pairs from vocabularies
    const vocabPairs = new Map(); // char → { trad, simp }
    const HAN = /\p{Script=Han}/u;
    for (const word of words) {
        const tc = [...(word.hanTraditional ?? "")];
        const sc = [...(word.hanSimplified ?? "")];
        if (tc.length === sc.length && tc.length > 0) {
            for (let i = 0; i < tc.length; i++) {
                if (!HAN.test(tc[i]) && !HAN.test(sc[i])) continue;
                if (tc[i] === sc[i]) continue;
                vocabPairs.set(tc[i], { trad: tc[i], simp: sc[i] });
                vocabPairs.set(sc[i], { trad: tc[i], simp: sc[i] });
            }
        }
    }

    // Collect updates: existing chars missing or having wrong variant pair
    const updateMap = new Map(); // id → { id, hanTraditional?, hanSimplified? }
    for (const [ch, pair] of vocabPairs) {
        const entry = existingByChar.get(ch);
        if (!entry) continue;
        const existingTrad = entry.hanTraditional || "";
        const existingSimp = entry.hanSimplified || "";
        // Need update if: field missing, or both fields are the same (fallback from createHanChar)
        const sameFields = existingTrad && existingSimp && existingTrad === existingSimp;
        const needsTrad = pair.trad && (!existingTrad || sameFields) && pair.trad !== existingTrad;
        const needsSimp = pair.simp && (!existingSimp || sameFields) && pair.simp !== existingSimp;
        if (needsTrad || needsSimp) {
            if (!updateMap.has(entry.id)) {
                updateMap.set(entry.id, { id: entry.id });
            }
            const upd = updateMap.get(entry.id);
            if (needsTrad) upd.hanTraditional = pair.trad;
            if (needsSimp) upd.hanSimplified = pair.simp;
        }
    }

    // Helper: is a character (or any variant) already in DB?
    function isExisting(ch) {
        if (existingByChar.has(ch)) return true;
        const pair = vocabPairs.get(ch);
        if (pair) {
            if (existingByChar.has(pair.trad)) return true;
            if (existingByChar.has(pair.simp)) return true;
        }
        return false;
    }

    // Build readings map for truly missing characters
    const readingsMap = new Map();

    function ensureEntry(ch) {
        if (!readingsMap.has(ch))
            readingsMap.set(ch, {
                pinyin: new Set(),
                jyutping: new Set(),
                sinoVietnamese: new Set(),
                trad: ch,
                // simp: undefined = không có simplified riêng (single-form)
                simp: undefined,
            });
        return readingsMap.get(ch);
    }

    for (const word of words) {
        const tradText = word.hanTraditional ?? "";
        const simpText = word.hanSimplified ?? "";
        const tradChars = [...tradText].filter((ch) => HAN_REGEX.test(ch));
        const simpChars = [...simpText].filter((ch) => HAN_REGEX.test(ch));
        const charCount = tradChars.length;

        const pyParts = (word.pinyin ?? "").split(/[\s,/、]+/).filter(Boolean);
        const jpParts = (word.jyutping ?? "").split(/\s+/).filter(Boolean);
        const svPartsRaw = (word.sinoVietnamese ?? "").split(/\s+/).filter(Boolean);
        const svParts = svPartsRaw.filter((t) => t !== "|" && t !== "/" && t !== "—" && t !== "·" && t !== "•");
        const svAligned =
            svParts.length > 0 &&
            ((charCount === 1 && svParts.length === 1) || (charCount > 1 && svParts.length % charCount === 0));

        for (let i = 0; i < tradChars.length; i++) {
            const ch = tradChars[i];
            if (isExisting(ch)) continue;
            const entry = ensureEntry(ch);
            if (pyParts[i]) entry.pinyin.add(pyParts[i]);
            if (jpParts[i]) entry.jyutping.add(jpParts[i]);
            if (svAligned) {
                for (let k = i; k < svParts.length; k += charCount) entry.sinoVietnamese.add(svParts[k]);
            }
            if (simpChars.length === tradChars.length && simpChars[i] !== ch) {
                entry.simp = simpChars[i];
                const simpEntry = ensureEntry(simpChars[i]);
                simpEntry.trad = ch;
            }
        }

        if (simpText !== tradText) {
            for (let i = 0; i < simpChars.length; i++) {
                const ch = simpChars[i];
                if (isExisting(ch)) continue;
                const entry = ensureEntry(ch);
                if (pyParts[i] && entry.pinyin.size === 0) entry.pinyin.add(pyParts[i]);
                if (jpParts[i] && entry.jyutping.size === 0) entry.jyutping.add(jpParts[i]);
                if (svAligned && entry.sinoVietnamese.size === 0) {
                    for (let k = i; k < svParts.length; k += charCount) entry.sinoVietnamese.add(svParts[k]);
                }
            }
        }
    }

    // Convert missing to array
    const missing = [];
    const seen = new Set();
    for (const [ch, entry] of readingsMap) {
        if (seen.has(ch) || isExisting(ch)) continue;
        seen.add(ch);
        if (entry.simp !== ch) seen.add(entry.simp);
        if (entry.trad !== ch) seen.add(entry.trad);
        missing.push({
            hanSimplified: entry.simp,
            hanTraditional: entry.trad || ch,
            pinyin: [...entry.pinyin].sort(),
            jyutping: [...entry.jyutping].sort(),
            sinoVietnamese: [...entry.sinoVietnamese].sort(),
        });
    }

    missing.sort((a, b) => (a.hanSimplified || "").localeCompare(b.hanSimplified || "", "zh"));
    const updates = [...updateMap.values()];

    return { missing, updates };
}
