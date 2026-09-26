/**
 * meaningPipeline.js
 * Shared meaning-resolution pipeline for the whole app.
 *
 * Flow (user requirement):
 *   1. Meanings come from the local dicts — CVDICT (Vietnamese) + CEDICT (English).
 *   2. If the dicts return a COMPLETE vi–en pair → use it.
 *   3. If the pair is INCOMPLETE (either side missing) → the WHOLE pair is
 *      re-translated via the app's translate pipeline (deep-translator), keyed
 *      on the Han text.
 * Bank (existing) meanings always win when provided (user-curated data).
 *
 * Used by the OCR suggestion route AND by backend/sync-meanings.mjs so the whole
 * app shares one pipeline.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { lookupDictMeanings } from "./meaningsLookup.js";
import { capitalizeSentences } from "./wordNormalize.js";
import { translateHanzi, translateEnglishToVietnamese } from "./hanziTranslate.js";

const execFileAsync = promisify(execFile);
const PYTHON_BIN = "/opt/translate-venv/bin/python3";

/** Max entries auto-translated per batch (keeps requests fast). */
export const MAX_TRANSLATE = 12;
/** Concurrent Google-Translate workers. */
export const TRANSLATE_CONCURRENCY = 2;
/** Delay between translate attempts (ms) — throttles the free Google endpoint. */
const TRANSLATE_DELAY_MS = Number(process.env.TRANSLATE_DELAY_MS) || 1500;
/** Retries per text when the free endpoint rate-limits / fails. */
const TRANSLATE_RETRIES = 3;

async function translateOnce(script, text) {
    const { stdout } = await execFileAsync(PYTHON_BIN, [`/app/scripts/${script}`, "--single", text], {
        timeout: 15000,
    });
    return stdout.trim();
}

/**
 * Translate a single text via the existing Python Google-Translate helper,
 * throttled + retried to survive the free endpoint's rate limits.
 */
export async function translateViaPython(script, text) {
    for (let attempt = 0; attempt < TRANSLATE_RETRIES; attempt++) {
        try {
            const result = await translateOnce(script, text);
            if (result) return result;
        } catch (err) {
            console.error(`${script} error for "${text}" (attempt ${attempt + 1}):`, err.message);
        }
        if (attempt < TRANSLATE_RETRIES - 1) {
            await new Promise((r) => setTimeout(r, TRANSLATE_DELAY_MS * (attempt + 1)));
        }
    }
    return "";
}

/**
 * Step 1 (sync): fill meanings from CVDICT + CEDICT. Provided bank meanings win.
 * @param {{ hanTraditional?: string|null, hanSimplified?: string|null, vietMeanings?: string, engMeanings?: string }} w
 * @returns {{ vietMeanings: string, engMeanings: string, complete: boolean }}
 */
export function applyDictMeanings({ hanTraditional, hanSimplified, vietMeanings = "", engMeanings = "" }) {
    const dict = lookupDictMeanings(hanSimplified, hanTraditional);
    const vi = String(vietMeanings || "").trim() || capitalizeSentences(dict.vi);
    const en = String(engMeanings || "").trim() || capitalizeSentences(dict.en);
    return { vietMeanings: vi, engMeanings: en, complete: Boolean(vi && en) };
}

/**
 * Step 2 (async): for entries with an incomplete vi–en pair, re-translate the
 * WHOLE pair via the translate pipeline. Mutates entries in place.
 * @param {Array<{ vietMeanings: string, engMeanings: string, hanTraditional: string }>} entries
 * @param {number} [limit] max entries to translate (default MAX_TRANSLATE for OCR requests)
 */
export async function enrichMissingMeanings(entries, limit = MAX_TRANSLATE) {
    const targets = entries.filter((e) => !e.vietMeanings || !e.engMeanings).slice(0, limit);
    if (!targets.length) return;

    let cursor = 0;
    const runWorker = async () => {
        while (cursor < targets.length) {
            const idx = cursor++;
            const s = targets[idx];
            const [vi, en] = await Promise.all([
                translateViaPython("translate_vietnamese.py", s.hanTraditional),
                translateViaPython("translate_english.py", s.hanTraditional),
            ]);
            if (vi) s.vietMeanings = capitalizeSentences(vi);
            if (en) s.engMeanings = capitalizeSentences(en);
        }
    };
    await Promise.all(Array.from({ length: Math.min(TRANSLATE_CONCURRENCY, targets.length) }, runWorker));
}

/** Concurrent workers cho pipeline dịch của SCAN (LibreTranslate self-hosted chịu được nhiều
 *  request hơn Google) — đảm bảo scan nhiều cụm vẫn xong trong vài giây. */
const SCAN_TRANSLATE_CONCURRENCY = Number(process.env.SCAN_TRANSLATE_CONCURRENCY) || 4;

/**
 * ⚠️ 2026-09-27: PIPELINE RIÊNG CHO SCAN OCR — dịch thẳng từ HÁN TỰ bằng
 * `hanziTranslate.translateHanzi` (deep_translator/Google → **LibreTranslate fallback**),
 * cho CẢ vi + en.
 *
 * Khác `enrichMissingMeanings` (Google-only, ghi đè cả cặp):
 *  - chỉ DỊCH BÊN CÒN THIẾU (giữ nguyên bên đã có từ CVDICT/CEDICT hoặc bank),
 *  - mỗi bên có fallback LibreTranslate khi Google 429/bị chặn.
 * @param {Array<{ vietMeanings?: string, engMeanings?: string, hanTraditional?: string }>} entries
 * @param {number} [limit] số entry tối đa dịch mỗi request — MẶC ĐỊNH **KHÔNG GIỚI HẠN**
 *   (⚠️ 2026-09-27 fix: trước đây dùng MAX_TRANSLATE=12 ⇒ scan >12 cụm bị bỏ trống vi/en).
 */
export async function enrichMeaningsFromHanzi(entries, limit = Number.POSITIVE_INFINITY) {
    const targets = entries.filter((e) => !e.vietMeanings || !e.engMeanings).slice(0, limit);
    if (!targets.length) return;

    let cursor = 0;
    const runWorker = async () => {
        while (cursor < targets.length) {
            const s = targets[cursor++];
            const han = s.hanTraditional || s.hanziTraditionalHk || "";
            if (!han) continue;
            const [vi, en] = await Promise.all([
                s.vietMeanings ? null : translateHanzi(han, "vi"),
                s.engMeanings ? null : translateHanzi(han, "en"),
            ]);
            if (vi?.text) s.vietMeanings = capitalizeSentences(vi.text);
            if (en?.text) s.engMeanings = capitalizeSentences(en.text);
            // 2-HOP: vi vẫn thiếu nhưng đã có EN → dịch tiếp en→vi (LibreTranslate).
            let twoHop = "";
            if (!s.vietMeanings && s.engMeanings) {
                twoHop = await translateEnglishToVietnamese(s.engMeanings);
                if (twoHop) s.vietMeanings = capitalizeSentences(twoHop);
            }
            if (vi?.text || en?.text || twoHop) {
                // Chỉ log (KHÔNG thêm field vào suggestion — tránh lọt vào payload tạo từ).
                console.log(
                    `[scan-translate] ${han} → vi="${s.vietMeanings}" (${vi?.source ?? (twoHop ? "lt:en→vi" : "-")}) · en="${s.engMeanings}" (${en?.source ?? "-"})`,
                );
            } else {
                console.warn(`[scan-translate] ${han} → KHÔNG dịch được vi/en`);
            }
        }
    };
    await Promise.all(Array.from({ length: Math.min(SCAN_TRANSLATE_CONCURRENCY, targets.length) }, runWorker));
}

/**
 * One-stop helper: dict fill, then translate fallback for incomplete pairs.
 * Returns the final vi–en pair without mutating the input.
 */
export async function resolveMeanings({ hanTraditional, hanSimplified, vietMeanings = "", engMeanings = "" }) {
    const entry = {
        hanTraditional,
        hanSimplified,
        vietMeanings: String(vietMeanings || "").trim(),
        engMeanings: String(engMeanings || "").trim(),
    };
    const dict = applyDictMeanings(entry);
    if (dict.complete) return dict;
    await enrichMissingMeanings([dict]);
    return {
        vietMeanings: dict.vietMeanings,
        engMeanings: dict.engMeanings,
        complete: Boolean(dict.vietMeanings && dict.engMeanings),
    };
}
