import { pinyin } from "pinyin-pro";
import { normalizeRomanizationPunctuation } from "./wordNormalize.js";

/** Convert Chinese text (simplified or traditional) → Hanyu Pinyin with tone marks. */
export function toPinyin(text) {
    const value = String(text ?? "").trim();
    if (!value) return "";
    return normalizeRomanizationPunctuation(
        pinyin(value, { toneType: "symbol", type: "array", traditional: true })
            .map((s) => String(s ?? "").trim())
            .filter(Boolean)
            .join(" "),
    );
}

export function pinyinSourceHan(word) {
    return (word.hanSimplified || word.hanTraditional || "").trim();
}

/** Generate pinyin from han characters. */
export function resolvePinyin(word) {
    const source = pinyinSourceHan(word);
    if (!source) return "";
    return toPinyin(source);
}
