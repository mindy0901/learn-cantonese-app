/**
 * hanziTranslate.js — pipeline dịch HÁN TỰ → vi/en RIÊNG CHO SCAN (2026-09-27).
 *
 * Thứ tự nguồn (giống tinh thần `/api/translate`):
 *   1. **deep_translator (Google)** — qua Python script có sẵn (`--single`, source zh-CN),
 *      chất lượng tốt hơn → ưu tiên.
 *   2. **LibreTranslate** (self-hosted, Argos) — FALLBACK khi Google lỗi/rate-limit/bị chặn
 *      (deep_translator ném GoogleRateLimitError / GoogleBlockedError / trả rỗng).
 *
 * ⚠️ LibreTranslate self-hosted chỉ có model `zh-Hans` (đã verify: `/languages` →
 * `zh-Hans target=en,vi`; gửi `zh-Hant` bị **400**) ⇒ phải đưa **giản thể** cho LibreTranslate.
 * Hán tự của scan là phồn thể (HK) → convert trad→simp bằng OpenCC (lazy, cache converter).
 *
 * Read-only, không ghi DB. Dùng bởi `meaningPipeline.enrichMeaningsFromHanzi` (scan OCR).
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { libreTranslate } from "./libretranslate.js";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = resolve(__dirname, "..", "scripts");

// Python venv trong container (giống meaningPipeline.js) — override bằng env nếu cần.
const PYTHON_BIN = process.env.TRANSLATE_PYTHON_BIN || "/opt/translate-venv/bin/python3";
const GOOGLE_TIMEOUT_MS = 15000;
/** Số lần thử Google trước khi fallback LibreTranslate. */
const GOOGLE_ATTEMPTS = 2;
const RETRY_DELAY_MS = 1200;

// ⚠️ 2026-09-27: CIRCUIT BREAKER cho Google. Endpoint free (`translate_a/single?client=gtx`)
// bị throttle THEO IP → hay trả **429 + trang "Sorry..."** (đã verify bằng request thô: STATUS 429).
// Khi gặp 429/rate-limit: tắt Google trong `GOOGLE_DOWN_MS` (đi thẳng LibreTranslate) để
// (a) scan không chậm vì retry vô ích, (b) KHÔNG làm nặng thêm penalty của IP.
const GOOGLE_DOWN_MS = Number(process.env.HANZI_GOOGLE_DOWN_MS) || 120000;
let googleDownUntil = 0;

/** Lỗi Google có phải do throttle/block? (đọc stderr của script Python) */
function isGoogleThrottled(err) {
    const s = `${err?.stderr ?? ""} ${err?.message ?? ""}`.toLowerCase();
    return s.includes("rate limit") || s.includes("429") || s.includes("too many");
}

/** LibreTranslate target/source codes (model self-hosted chỉ có zh-Hans). */
const LT_SOURCE = "zh-Hans";

/** script Python theo target (đã có sẵn, dùng chế độ `--single`). */
const GOOGLE_SCRIPT = {
    vi: "translate_vietnamese.py",
    en: "translate_english.py",
};

/** Lazy OpenCC hk→cn converter (giản thể cho LibreTranslate). */
let simpConverter = null;
async function toSimplified(text) {
    if (!simpConverter) {
        const { Converter } = await import("opencc-js");
        simpConverter = Converter({ from: "hk", to: "cn" });
    }
    return simpConverter(text);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Google (deep_translator) — trả "" khi lỗi/rỗng (KHÔNG ném để còn fallback). */
async function googleTranslate(text, target) {
    const script = GOOGLE_SCRIPT[target];
    if (!script) return "";
    // Circuit breaker: Google vừa 429 → bỏ qua luôn, đi thẳng LibreTranslate.
    if (Date.now() < googleDownUntil) return "";
    for (let attempt = 0; attempt < GOOGLE_ATTEMPTS; attempt++) {
        try {
            const { stdout } = await execFileAsync(PYTHON_BIN, [resolve(SCRIPTS_DIR, script), "--single", text], {
                timeout: GOOGLE_TIMEOUT_MS,
            });
            const out = String(stdout ?? "").trim();
            if (out) return out;
        } catch (err) {
            console.warn(`hanziTranslate: google(${target}) lỗi "${text}": ${err.message}`);
            if (isGoogleThrottled(err)) {
                googleDownUntil = Date.now() + GOOGLE_DOWN_MS;
                console.warn(
                    `hanziTranslate: Google bị throttle (429) → tạm bỏ qua ${Math.round(GOOGLE_DOWN_MS / 1000)}s, dùng LibreTranslate.`,
                );
                return ""; // không retry — tránh làm nặng penalty
            }
        }
        if (attempt < GOOGLE_ATTEMPTS - 1) await sleep(RETRY_DELAY_MS * (attempt + 1));
    }
    return "";
}

/**
 * Dịch 1 chuỗi Hán tự → `vi` | `en`: Google trước, LibreTranslate fallback.
 * @param {string} hanText Hán tự (phồn thể/giản thể đều được — LT tự convert sang giản thể)
 * @param {"vi"|"en"} target
 * @returns {Promise<{ text: string, source: "google"|"libretranslate"|null }>}
 */
export async function translateHanzi(hanText, target) {
    const text = String(hanText ?? "").trim();
    if (!text) return { text: "", source: null };

    const google = await googleTranslate(text, target);
    if (google) return { text: google, source: "google" };

    // Fallback: LibreTranslate (zh-Hans → vi/en). Convert giản thể trước.
    try {
        const simplified = await toSimplified(text);
        const out = String(await libreTranslate(simplified || text, LT_SOURCE, target)).trim();
        if (out) return { text: out, source: "libretranslate" };
    } catch (err) {
        console.warn(`hanziTranslate: libreTranslate(${target}) lỗi "${text}": ${err.message}`);
    }
    return { text: "", source: null };
}

/**
 * Dịch 1 chuỗi Hán tự → CẢ cặp vi + en (song song).
 * @param {string} hanText
 * @returns {Promise<{ vi: {text:string,source:string|null}, en: {text:string,source:string|null} }>}
 */
export async function translateHanziPair(hanText) {
    const [vi, en] = await Promise.all([translateHanzi(hanText, "vi"), translateHanzi(hanText, "en")]);
    return { vi, en };
}

/**
 * 2-HOP fallback: khi dịch thẳng Hán tự → vi thất bại (Google 429 + LibreTranslate lỗi)
 * nhưng đã có bản EN (từ dict hoặc LT) → dịch tiếp **en → vi** bằng LibreTranslate.
 * (LibreTranslate self-hosted: `en target=vi` có sẵn.) Trả "" khi không dịch được.
 */
export async function translateEnglishToVietnamese(text) {
    const s = String(text ?? "").trim();
    if (!s) return "";
    // Chỉ lấy nghĩa đầu tiên nếu chuỗi là danh sách "a; b; c" (dịch cả chuỗi dễ nhiễu).
    const first = s.split(";")[0].trim() || s;
    try {
        return String(await libreTranslate(first, "en", "vi")).trim();
    } catch (err) {
        console.warn(`hanziTranslate: en→vi lỗi "${first}": ${err.message}`);
        return "";
    }
}
