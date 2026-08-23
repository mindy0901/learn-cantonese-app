/**
 * cantoToMandarin.js — Dịch từ CANTONESE → SIMPLIFIED MANDARIN (2026-08-17).
 *
 * Dùng Google gtx (như `/api/translate-google`):
 *   1. Direct: yue → zh-CN.
 *   2. Nếu kết quả KHÔNG phải chữ Trung (vd 的士 → "taxi" — Google miss) → FALLBACK
 *      cầu zh-TW: yue → zh-TW (計程車) → zh-CN (出租车). Đây là "cầu" user đề xuất.
 *
 * Chỉ dùng fallback khi direct không ra chữ Hán (tránh làm hỏng từ direct đúng,
 * vd 傾偈 direct=聊天 đúng, nhưng via TW lại thành 傾訴 sai nghĩa).
 */

const GTX = "https://translate.googleapis.com/translate_a/single";

/** Gọi Google gtx, trả chuỗi dịch (hoặc "" khi lỗi). */
export async function gtxTranslate(text, source, target) {
    try {
        const url = `${GTX}?client=gtx&sl=${source}&tl=${target}&dt=t&q=${encodeURIComponent(String(text ?? ""))}`;
        const resp = await fetch(url, { timeout: 20000 });
        if (!resp.ok) return "";
        const data = await resp.json();
        return (data[0] || []).map((seg) => (seg && seg[0]) || "").join("");
    } catch {
        return "";
    }
}

const HAN_RE = /\p{Script=Han}/u;

/** True khi kết quả có chữ Hán (đủ "ra chữ Trung", không phải "taxi"/rỗng). */
function hasHan(s) {
    return HAN_RE.test(String(s ?? "").trim());
}

/**
 * Cantonese → Simplified Mandarin (có fallback cầu zh-TW).
 * @returns {string} chuỗi simp; rỗng nếu cả 2 hướng đều fail.
 */
export async function translateCantoneseToSimplified(text) {
    // 1. Direct yue → zh-CN
    const direct = await gtxTranslate(text, "yue", "zh-CN");
    if (hasHan(direct)) return direct;

    // 2. Fallback cầu zh-TW: yue → zh-TW → zh-CN
    const tw = await gtxTranslate(text, "yue", "zh-TW");
    if (hasHan(tw)) {
        const cn = await gtxTranslate(tw, "zh-TW", "zh-CN");
        if (hasHan(cn)) return cn;
    }
    return direct || "";
}
