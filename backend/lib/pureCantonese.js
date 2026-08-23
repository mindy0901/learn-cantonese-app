/**
 * Pipeline nhận diện từ PURE CANTONESE (2026-08-17).
 *
 * Kết hợp 3 tín hiệu (có thể độc lập, OR với nhau):
 *   A. `char`    — chứa ký tự thuần Cantonese (danh sách lib/cantoneseChars.js).
 *   B. `cedict`  — từ điển chuẩn CEDICT đánh dấu "(Cantonese)" cho hán tự này
 *                  (vd 喺 = "to be at, in or on (Cantonese)", 冇 = "to not have (Cantonese)").
 *   C. `no-pinyin` — có jyutping nhưng pinyin-pro KHÔNG đọc được hán tự thật
 *                  (echo nguyên chữ / trả chữ Hán) → không có âm Mandarin.
 *
 * ⚠️ (2026-08-17) Đã thử tín hiệu `dict-cross` (wordshk ∩ ¬CEDICT) để tự bắt 一於/點解
 *  nhưng BỎ: CEDICT/CVDICT không liệt kê các từ Mandarin phổ biến (一千/一百/一本...)
 *  → "không có trong từ điển Mandarin" KHÔNG chứng minh là từ thuần Quảng → false positive
 *  hàng loạt. Các từ cụm chỉ dùng trong Quảng (一於/點解/邊度/而家/第時) được xử lý bằng
 *  blocklist cụm từ thủ công `CANTONESE_ONLY_WORDS` (lib/cantoneseChars.js).
 *
 * Nguồn dict: backend/data/CEDICT.json (Mandarin–English, có chú thích "(Cantonese)").
 */
import { readFileSync } from "node:fs";
import { containsCantoneseOnlyChar, CANTONESE_ONLY_WORDS } from "./cantoneseChars.js";
import { toPinyin } from "./pinyin.js";

/** Regex khớp chú thích CÁCH DÙNG Cantonese trong gloss CEDICT.
 *  Chỉ match marker sử dụng (không phải "về Cantonese"):
 *   - "(Cantonese)" / "(Cant.)"  → vd 喺 "to be at, in or on (Cantonese)"
 *   - "Cantonese particle/slang..."  → vd 咗 "Cantonese particle equivalent to 了"
 *  KHÔNG match: "Cantonese language" (广东话/粤语), "via Cantonese" (按揭),
 *  "originally Cantonese" (吹水), "Cantonese cuisine/opera" → tránh false positive
 *  với từ Mandarin vẫn dùng để NÓI về Cantonese. */
const CANTONESE_USAGE_RE =
    /\(c(?:ant\.?|antonese)\)|^cantonese (?:particle|slang|dialect|colloquial|vulgar|usage|loan|word)/i;

let cedictIndex = null;
/** Lazy-load CEDICT: Map<hán tự, entries[]> — chỉ load 1 lần.
 *  ⚠️ Index CẢ `s` (giản) lẫn `t` (phồn) — không dùng `s || t` (chỉ lấy s). */
function getCedict() {
    if (cedictIndex) return cedictIndex;
    const raw = JSON.parse(readFileSync(new URL("../data/CEDICT.json", import.meta.url), "utf8"));
    const byHan = new Map();
    for (const entry of raw) {
        const hans = [...new Set([String(entry?.s ?? "").trim(), String(entry?.t ?? "").trim()].filter(Boolean))];
        for (const han of hans) {
            if (!byHan.has(han)) byHan.set(han, []);
            byHan.get(han).push(entry);
        }
    }
    cedictIndex = byHan;
    return cedictIndex;
}

/** True khi CEDICT đánh dấu hán tự này là CÁCH DÙNG Cantonese.
 *  Chữ đơn (1 ký tự) chỉ coi là Cantonese khi MỌI entry đều là usage Cantonese
 *  (vd 基 có 基礎/基因 → không flag; 喺 chỉ "(Cantonese)" → flag). */
export function cedictHasCantoneseMarker(han) {
    const entries = getCedict().get(han);
    if (!entries || entries.length === 0) return false;
    const glosses = (e) => (Array.isArray(e?.en) ? e.en : []).map((g) => String(g));
    const hasUsage = entries.some((e) => glosses(e).some((g) => CANTONESE_USAGE_RE.test(g)));
    if (!hasUsage) return false;
    if ([...han].length === 1) {
        const hasNonUsage = entries.some((e) => glosses(e).some((g) => !CANTONESE_USAGE_RE.test(g)));
        if (hasNonUsage) return false;
    }
    return true;
}

/** Regex khớp ký tự Hán (marker) trong chuỗi pinyin — dùng \p{Script=Han}
 *  để bắt cả ký tự ngoài BMP (vd 𠮶 U+20BB6). */
const HAN_IN_PINYIN_RE = /\p{Script=Han}/u;

/**
 * Nhận diện 1 từ (vocab) có phải pure Cantonese hay không.
 *
 * @param {object} vocab { hanziSimplified, hanziTraditionalHk|hanziTraditional, jyutping }
 * @returns {{ isPureCantonese: boolean, signals: string[] }}
 */
export function detectPureCantonese(vocab) {
    const signals = [];
    const simp = String(vocab?.hanziSimplified ?? "").trim();
    const hk = String(vocab?.hanziTraditionalHk ?? vocab?.hanziTraditional ?? "").trim();
    const hanTexts = [...new Set([simp, hk].filter(Boolean))];
    const jp = String(vocab?.jyutping ?? "").trim();

    // A — chứa ký tự thuần Cantonese (blocklist) HOẶC cụm từ thuần Cantonese
    //     (vd 一於, 點解 — chữ bình thường nhưng cụm từ chỉ dùng trong Cantonese).
    if (hanTexts.some((h) => containsCantoneseOnlyChar(h) || CANTONESE_ONLY_WORDS.has(h))) signals.push("char");

    // B — CEDICT đánh dấu (Cantonese).
    if (hanTexts.some((h) => cedictHasCantoneseMarker(h))) signals.push("cedict");

    // C — check pinyin trên CỘT CANTONESE (HK) — nối 2 form (simp+hk) là SAI:
    //     pinyin-pro đọc lặp 2 lần, kết quả vẫn ra âm thật. Chỉ cần cột HK (chứa
    //     chữ thuần Quảng) là đủ: pinyin-pro không đọc được → trả " - "/marker Hán.
    if (jp && hk) {
        const freshPy = toPinyin(hk);
        if (freshPy.trim() === "-" || HAN_IN_PINYIN_RE.test(freshPy)) signals.push("no-pinyin");
    }

    return { isPureCantonese: signals.length > 0, signals };
}
