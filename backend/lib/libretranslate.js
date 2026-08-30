/**
 * libretranslate.js — Client cho LibreTranslate (self-hosted, không rate-limit).
 * Dùng làm FALLBACK khi deep_translator (Google) bị block trong pipeline `/api/translate`.
 * (2026-08-24 — thay thế Google gtx vì gtx cũng bị Google block.)
 *
 * LibreTranslate (Argos) hỗ trợ: en, vi, zh (zh-Hans / zh-Hant). KHÔNG hỗ trợ yue.
 * Endpoint: POST /translate  body { q, source, target } → { translatedText }.
 */

const LT_BASE = process.env.LIBRETRANSLATE_URL || "http://libretranslate:5000";

// ⚠️ Fail-fast: LibreTranslate (gunicorn sync worker) hay crash/hang sau nhiều request → nếu
// để timeout dài (25s) mỗi job fallback tốn 25s → full sync "check rất chậm". Giảm còn 6s +
// circuit breaker: sau 1 lần lỗi, bỏ qua hẳn LibreTranslate 30s (trả lỗi ngay, job bị skip). (2026-08-25)
const LT_TIMEOUT_MS = 6000;
const CIRCUIT_DOWN_MS = 30000;
let libretranslateDownUntil = 0;

// Map mã code hay dùng (kể cả lowercase từ route) → mã LibreTranslate (zh → simplified).
const CODE_MAP = {
    zh: "zh-Hans",
    "zh-cn": "zh-Hans",
    "zh-hans": "zh-Hans",
    "zh-tw": "zh-Hant",
    "zh-hant": "zh-Hant",
    "zh-hk": "zh-Hant",
};

function normalizeCode(code) {
    const k = String(code ?? "")
        .trim()
        .toLowerCase();
    return CODE_MAP[k] ?? k;
}

/**
 * Dịch qua LibreTranslate.
 * @param {string} text
 * @param {string} source mã ngôn ngữ nguồn (en/vi/zh...)
 * @param {string} target mã ngôn ngữ đích
 * @returns {Promise<string>} bản dịch (trim)
 * @throws khi LibreTranslate lỗi (service down / thiếu model / cặp ngôn ngữ không hỗ trợ)
 */
export async function libreTranslate(text, source, target) {
    const src = normalizeCode(source);
    const tgt = normalizeCode(target);
    if (!src || !tgt) throw new Error(`LibreTranslate: thiếu mã ngôn ngữ (${source}->${target})`);

    // Circuit breaker: LibreTranslate vừa lỗi → bỏ qua ngay (không gọi lại) cho tới khi hết window.
    if (Date.now() < libretranslateDownUntil) {
        throw new Error("LibreTranslate đang down (circuit breaker)");
    }

    try {
        const resp = await fetch(`${LT_BASE}/translate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ q: String(text ?? ""), source: src, target: tgt }),
            signal: AbortSignal.timeout(LT_TIMEOUT_MS),
        });
        if (!resp.ok) {
            libretranslateDownUntil = Date.now() + CIRCUIT_DOWN_MS;
            throw new Error(`LibreTranslate HTTP ${resp.status} (${src}->${tgt})`);
        }
        const data = await resp.json();
        const out = String(data?.translatedText ?? "").trim();
        // Dịch thành công → mở lại circuit (đã hết lỗi).
        libretranslateDownUntil = 0;
        return out;
    } catch (err) {
        // Timeout/network lỗi → đánh dấu down, lần sau bỏ qua nhanh.
        libretranslateDownUntil = Date.now() + CIRCUIT_DOWN_MS;
        throw err;
    }
}
