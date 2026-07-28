/** Marks a word as intentionally having no Sino-Vietnamese reading (e.g. pure Cantonese). */
export const SINO_VIETNAMESE_NONE = "#";

export function isSinoVietnameseNone(sinoVietnamese) {
    const text = String(sinoVietnamese ?? "").trim();
    if (!text) return false;
    if (text === SINO_VIETNAMESE_NONE) return true;
    const tokens = text.split(/\s+/).filter(Boolean);
    return tokens.length > 0 && tokens.every((token) => /^_+$/.test(token));
}
