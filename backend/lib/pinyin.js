import { pinyin } from "pinyin-pro";
import { normalizeRomanizationPunctuation } from "./wordNormalize.js";
import { isCantoneseOnlyChar } from "./cantoneseChars.js";

/** Regex khớp chữ Hán (marker) còn sót trong output pinyin → không đủ âm.
 *  Dùng \p{Script=Han} để bắt cả ký tự ngoài BMP (vd 𠮶 U+20BB6). */
const HAN_MARKER_RE = /\p{Script=Han}/u;

/** Thanh 3 → thanh 2 (đổi nguyên âm mang thanh). */
const TONE3_TO_TONE2 = { ǎ: "á", ě: "é", ǐ: "í", ǒ: "ó", ǔ: "ú", ǚ: "ǘ" };
const TONE3_RE = /[ǎěǐǒǔǚ]/;

/**
 * Áp dụng BIẾN ÂM THANH 3 (三声变调): hai âm tiết thanh 3 liền nhau → âm tiết
 * trước đọc thanh 2 (vd "你好" nǐ hǎo → "ní hǎo"; "了解" liǎo jiě → "liáo jiě").
 * Run ≥3 thanh 3 liên tiếp → mọi âm tiết trừ âm CUỐI đổi thanh 2 (vd "我也想"
 * wǒ yě xiǎng → "wó yé xiǎng", cách đọc phổ biến 2+2+3).
 * pinyin-pro `toneSandhi` KHÔNG xử lý quy tắc này (chỉ 一/不) → tự thêm. (2026-08-23)
 */
export function applyThirdToneSandhi(pinyinStr) {
    const s = String(pinyinStr ?? "");
    if (!s) return s;
    const tokens = s.split(" ");
    const flip = (i) => {
        tokens[i] = tokens[i].replace(/[ǎěǐǒǔǚ]/g, (ch) => TONE3_TO_TONE2[ch]);
    };
    let runStart = -1;
    for (let i = 0; i <= tokens.length; i++) {
        const isTone3 = i < tokens.length && TONE3_RE.test(tokens[i]);
        if (isTone3) {
            if (runStart === -1) runStart = i;
        } else if (runStart !== -1) {
            // Mọi âm tiết trong run TRỪ âm cuối → thanh 2 (run dài 1 → không đổi).
            for (let j = runStart; j < i - 1; j++) flip(j);
            runStart = -1;
        }
    }
    return tokens.join(" ");
}

/** Convert Chinese text (simplified or traditional) → Hanyu Pinyin with tone marks.
 *  `toneSandhi: true` → áp dụng BIẾN ĐIỆU thanh cho 一/不 (vd "一名" = yì míng,
 *  "不是" = bú shì) — theo đúng phát âm Mandarin thực tế.
 *
 *  KHÔNG ĐỦ ÂM → " - " (2026-08-17): nếu pinyin-pro không đọc được đủ mọi ký tự
 *  (ký tự thuần Cantonese trong `cantoneseChars.js`, hoặc pinyin-pro echo nguyên
 *  chữ), trả " - " — đánh dấu "không có âm Mandarin" thay vì đoán bừa (vd trước
 *  đây 喺→"xí", 唔→"wú"). */
export function toPinyin(text) {
    const value = String(text ?? "").trim();
    if (!value) return "";
    const chars = [...value];
    const raw = pinyin(value, { toneType: "symbol", type: "array", traditional: true, toneSandhi: true });
    const joined = (() => {
        if (raw.length === chars.length) {
            const out = chars.map((ch, i) => {
                const s = String(raw[i] ?? "").trim();
                // Thuần Cantonese HOẶC pinyin-pro echo (ko có âm) → giữ chữ Hán làm marker.
                if (isCantoneseOnlyChar(ch) || !s || s === ch) return ch;
                return s;
            });
            return out.join(" ");
        }
        return raw
            .map((s) => String(s ?? "").trim())
            .filter(Boolean)
            .join(" ");
    })();
    // Còn sót chữ Hán (marker) → pinyin không đủ → " - ".
    if (HAN_MARKER_RE.test(joined)) return " - ";
    // 三声变调 (3+3 → 2+3) — pinyin-pro toneSandhi không xử lý. (2026-08-23)
    return normalizeRomanizationPunctuation(applyThirdToneSandhi(joined));
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
