/**
 * Tính `hanCharacters` breakdown ở FRONTEND (2026-08-14) — thay cột JSONB cũ.
 * Port từ `backend/lib/hanCharacterBreakdown.js` `computeHanCharacters`.
 *
 * Input: vocab (legacy store shape) với `hanTraditional`, `hanSimplified`,
 *        `romanization` (typed array: pinyin/jyutping/sinoVietnamese per reading).
 * Output: `[{ sinoVietnamese, hanSimplified, hanTraditional, pinyin, jyutping }]`
 *         căn chỉnh theo từng ký tự.
 */

/** Check if a single char is a CJK Unified Ideograph (U+4E00–U+9FFF) or Extension A (U+3400–U+4DBF). */
function isHanChar(ch) {
    const code = ch.codePointAt(0);
    return (code >= 0x3400 && code <= 0x4dbf) || (code >= 0x4e00 && code <= 0x9fff);
}

/** Split a string into individual CJK characters (preserving order & duplicates). */
function splitHanChars(text) {
    const value = String(text ?? "").trim();
    if (!value) return [];
    return [...value].filter((ch) => isHanChar(ch));
}

/**
 * Đếm SỐ HÁN TỰ trong chuỗi (bỏ khoảng trắng/dấu câu/ký tự latin).
 * Dùng cho sort "số lượng hán tự" ở bảng từ vựng (VocabularyRowColumns).
 * ⚠️ Regex `\p{Script=Han}` (KHÔNG cờ `g` — tránh stateful lastIndex) phủ cả
 * Extension B+ (chữ Cantonese hiếm như 𥄫/𠝹), `isHanChar` ở trên chỉ tới U+9FFF.
 */
const HAN_ANY_RE = /\p{Script=Han}/u;

export function countHanChars(text) {
    return [...String(text ?? "")].filter((ch) => HAN_ANY_RE.test(ch)).length;
}

/** Split a pinyin string into per-syllable parts (space/comma separated), lowercased. */
function splitPinyinParts(pinyin) {
    return String(pinyin ?? "")
        .split(/[\s,/、]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
}

/** Split a jyutping string into per-syllable parts (space separated), lowercased. */
function splitJyutpingParts(jyutping) {
    return String(jyutping ?? "")
        .split(/\s+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
}

/**
 * Split a sino-Vietnamese string into readings.
 * A "reading" = whitespace-separated group; alternatives within a reading are
 * joined by "|" (e.g. "TỊNH | TÍNH" = ONE reading).
 */
function splitSinoVietnameseParts(sinoVietnamese) {
    const tokens = String(sinoVietnamese ?? "")
        .split(/\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
    const ALT = new Set(["|", "/", "—", "·", "•"]);
    const readings = [];
    let cur = null;
    for (const t of tokens) {
        if (ALT.has(t)) {
            if (cur) cur += " " + t;
            continue;
        }
        if (cur && cur.endsWith("|")) {
            cur += " " + t;
        } else {
            if (cur) readings.push(cur);
            cur = t;
        }
    }
    if (cur) readings.push(cur);
    return readings;
}

export function computeHanCharacters(vocab) {
    const trad = (vocab?.hanTraditional ?? "").trim();
    const simp = (vocab?.hanSimplified ?? "").trim();
    const hk = (vocab?.hanHongKong ?? "").trim();

    const tradChars = splitHanChars(trad);
    const simpChars = splitHanChars(simp);
    const hkChars = splitHanChars(hk);
    // Ưu tiên trad; pure Cantonese (ko simp/trad) → fallback HK.
    const chars = tradChars.length > 0 ? tradChars : hkChars.length > 0 ? hkChars : simpChars;
    if (chars.length === 0) return [];

    const romanizations =
        Array.isArray(vocab?.romanization) && vocab.romanization.length > 0 ? vocab.romanization : null;
    const sources = romanizations
        ? romanizations.map((r) => ({
              pinyin: r?.pinyin ?? "",
              jyutping: r?.jyutping ?? "",
              sinoVietnamese: r?.sinoVietnamese ?? "",
          }))
        : [{ pinyin: vocab?.pinyin, jyutping: vocab?.jyutping, sinoVietnamese: vocab?.sinoVietnamese }];

    const pyByPos = chars.map(() => new Set());
    const jpByPos = chars.map(() => new Set());
    const svByPos = chars.map(() => new Set());

    for (const src of sources) {
        const pyParts = splitPinyinParts(src.pinyin);
        const jpParts = splitJyutpingParts(src.jyutping);
        const svParts = splitSinoVietnameseParts(src.sinoVietnamese);
        const svAligned =
            svParts.length > 0 && (chars.length === 1 || (chars.length > 1 && svParts.length % chars.length === 0));
        for (let i = 0; i < chars.length; i++) {
            if (pyParts[i]) pyByPos[i].add(pyParts[i]);
            if (jpParts[i]) jpByPos[i].add(jpParts[i]);
            if (svAligned) {
                if (chars.length === 1) {
                    svByPos[i].add(svParts.join(" "));
                } else {
                    const candidates = [];
                    for (let k = i; k < svParts.length; k += chars.length) candidates.push(svParts[k]);
                    if (candidates.length > 0) svByPos[i].add(candidates.join(" "));
                }
            }
        }
    }

    const joinReading = (set) => (set.size > 0 ? [...set].sort().join(" / ") : null);

    return chars.map((character, i) => {
        const simpChar = simpChars.length === chars.length ? simpChars[i] : undefined;
        return {
            sinoVietnamese: joinReading(svByPos[i]),
            hanSimplified: simpChar ?? "",
            hanTraditional: character,
            pinyin: joinReading(pyByPos[i]),
            jyutping: joinReading(jpByPos[i]),
        };
    });
}
