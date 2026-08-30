import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve, dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { toPinyin } from "../lib/pinyin.js";
import { lookupJyutping } from "../lib/jyutpingLookup.js";
import { libreTranslate } from "../lib/libretranslate.js";

const execFileAsync = promisify(execFile);
const __translate_dirname = dirname(fileURLToPath(import.meta.url));
// Python binary: env override > Windows native (ưu tiên project venv nếu có, fallback `python`
// trong PATH) > docker (venv tại /opt/translate-venv). Scripts luôn nằm cạnh backend → chạy được
// cả docker (/app/scripts) lẫn native (resolve theo module này).
const PROJECT_VENV_PY = resolve(__translate_dirname, "..", "..", ".venv", "Scripts", "python.exe");
const PYTHON_BIN =
    process.env.TRANSLATE_PYTHON_BIN ||
    (process.platform === "win32"
        ? existsSync(PROJECT_VENV_PY)
            ? PROJECT_VENV_PY
            : "python"
        : "/opt/translate-venv/bin/python3");
const SCRIPTS_DIR = resolve(__translate_dirname, "..", "scripts");

// Exit code từ translate_pair.py → lý do Google (để UI hiển thị + log rõ ràng). (2026-08-26)
const GOOGLE_FAIL_REASON = {
    2: "rate_limit", // HTTP 429 thật
    3: "blocked", // Google chặn, trả rỗng/HTML challenge (KHÔNG phải 429)
    4: "error", // network/timeout/SSL...
};

// Probe mã HTTP thực tế của Google (gtx) — vì Google chặn ở tầng IP nên mã ít đổi → cache
// 5 phút, chỉ gọi khi Google thất bại. (2026-08-26 — user muốn UI hiển thị "Google + mã code"
// thay vì text "Google bị chặn".)
const GOOGLE_PROBE_URL = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=vi&dt=t&q=probe";
const GOOGLE_PROBE_TTL_MS = 5 * 60 * 1000;
let googleProbeCache = { code: null, at: 0 };
async function probeGoogleStatus() {
    if (googleProbeCache.code != null && Date.now() - googleProbeCache.at < GOOGLE_PROBE_TTL_MS) {
        return googleProbeCache.code;
    }
    try {
        const resp = await fetch(GOOGLE_PROBE_URL, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
            signal: AbortSignal.timeout(8000),
        });
        googleProbeCache = { code: resp.status, at: Date.now() };
    } catch {
        googleProbeCache = { code: 0, at: Date.now() };
    }
    return googleProbeCache.code;
}

export async function translateRoutes(fastify) {
    /**
     * POST /pinyin
     * Body: { text: string }
     * Converts Chinese text to Hanyu Pinyin with tone marks.
     */
    fastify.post("/pinyin", async (request, reply) => {
        const { text } = request.body ?? {};

        if (!text || !String(text).trim()) {
            return reply.status(400).send({ error: "Missing text" });
        }

        try {
            const pinyin = toPinyin(String(text).trim());
            return { pinyin };
        } catch (err) {
            return reply.status(500).send({ error: err.message });
        }
    });

    /**
     * POST /s2t
     * Body: { text: string }
     * Converts Chinese text from Simplified to Traditional (OpenCC s2t — standard
     * traditional, same config as update-mandarin-traditional-s2t.mjs). (2026-08-22)
     */
    fastify.post("/s2t", async (request, reply) => {
        const { text } = request.body ?? {};

        if (!text || !String(text).trim()) {
            return reply.status(400).send({ error: "Missing text" });
        }

        try {
            const { Converter } = await import("opencc-js");
            const toTrad = Converter({ from: "cn", to: "t" });
            return { traditional: toTrad(String(text).trim()) };
        } catch (err) {
            return reply.status(500).send({ error: err.message });
        }
    });

    /**
     * POST /jyutping
     * Body: { text: string }
     * Converts Chinese text to Jyutping. CC-Canto full-word match first (context-
     * accurate), then to-jyutping fallback (context-aware full-word).
     */
    fastify.post("/jyutping", async (request, reply) => {
        const { text } = request.body ?? {};

        if (!text || !String(text).trim()) {
            return reply.status(400).send({ error: "Missing text" });
        }
        const input = String(text).trim();

        try {
            // 1. cantowords (words.hk) full-word — highest priority
            // 2. CC-Canto full-word
            // 3. Fallback: to-jyutping (context-aware full-word)
            return { jyutping: lookupJyutping(input) };
        } catch (err) {
            console.error("jyutping error:", err.message);
            return reply.status(500).send({ error: err.message });
        }
    });

    /**
     * POST /translate-vietnamese
     * Body: { text: string }
     * Translates Chinese (simplified) text to Vietnamese using Google Translate.
     */
    fastify.post("/translate-vietnamese", async (request, reply) => {
        const { text } = request.body ?? {};

        if (!text || !String(text).trim()) {
            return reply.status(400).send({ error: "Missing text" });
        }

        try {
            const { stdout } = await execFileAsync(
                PYTHON_BIN,
                [resolve(SCRIPTS_DIR, "translate_vietnamese.py"), "--single", String(text).trim()],
                { timeout: 15000, env: { ...process.env, PYTHONIOENCODING: "utf-8" } },
            );

            // Parse output: just the translated text
            const translated = stdout.trim();

            return { translated };
        } catch (err) {
            console.error("translate-vietnamese error:", err.message);
            return reply.status(500).send({ error: err.message });
        }
    });

    /**
     * POST /translate-english
     * Body: { text: string }
     * Translates Chinese (simplified) text to English using Google Translate.
     */
    fastify.post("/translate-english", async (request, reply) => {
        const { text } = request.body ?? {};

        if (!text || !String(text).trim()) {
            return reply.status(400).send({ error: "Missing text" });
        }

        try {
            const { stdout } = await execFileAsync(
                PYTHON_BIN,
                [resolve(SCRIPTS_DIR, "translate_english.py"), "--single", String(text).trim()],
                { timeout: 15000, env: { ...process.env, PYTHONIOENCODING: "utf-8" } },
            );

            // Parse output: just the translated text
            const translated = stdout.trim();

            return { translated };
        } catch (err) {
            console.error("translate-english error:", err.message);
            return reply.status(500).send({ error: err.message });
        }
    });

    /**
     * POST /translate
     * Body: { text: string, source: string, target: string }
     * Translates text between an arbitrary language pair via the same pipeline
     * (deep-translator fallback chain). Used by the meaning sync (vi <-> en).
     */
    fastify.post("/translate", async (request, reply) => {
        const { text, source, target } = request.body ?? {};

        if (!text || !String(text).trim()) {
            return reply.status(400).send({ error: "Missing text" });
        }

        // Giữ nguyên case (deep_translator cần "zh-CN", "en", "vi" đúng case); LibreTranslate
        // tự normalize (zh-CN → zh-Hans) ở libretranslate.js.
        const src = String(source || "en");
        const tgt = String(target || "vi");

        // Fallback: LibreTranslate (self-hosted, không rate-limit) — dùng khi deep_translator
        // (Google) không dịch được. Argos engine có model en/vi/zh → không phụ thuộc Google.
        // (2026-08-24 — thay thế gtx vì gtx cũng bị Google block.) reason = lý do Google lỗi
        // (rate_limit | blocked | error) — 2026-08-26 phân biệt để UI hiển thị đúng nguyên nhân.
        const runLibreFallback = async (reason = null, googleCode = null) => {
            try {
                const translated = await libreTranslate(String(text).trim(), src, tgt);
                return { translated, source: "libretranslate", reason, googleCode };
            } catch (ltErr) {
                console.error("translate LibreTranslate fallback error:", ltErr.message);
                // LibreTranslate lỗi (service down / thiếu model / cặp ngôn ngữ) → 500:
                // job bị skip (giống network error), sync vẫn chạy tiếp các job khác.
                return reply.status(500).send({ error: ltErr.message, reason, googleCode });
            }
        };

        try {
            const { stdout } = await execFileAsync(
                PYTHON_BIN,
                [
                    resolve(SCRIPTS_DIR, "translate_pair.py"),
                    "--single",
                    String(text).trim(),
                    "--source",
                    src,
                    "--target",
                    tgt,
                ],
                { timeout: 20000, env: { ...process.env, PYTHONIOENCODING: "utf-8" } },
            );

            return { translated: stdout.trim(), source: "google" };
        } catch (err) {
            console.error("translate error:", err.message);
            // Phân biệt lý do Google lỗi (2026-08-26):
            //   exit 2 = HTTP 429 thật (rate limit) | 3 = Google chặn (trả rỗng/HTML challenge)
            //   | 4 = lỗi khác (network/timeout). stderr chứa message gốc từ translate_utils.py.
            const reason = GOOGLE_FAIL_REASON[err.code] ?? null;
            if (reason) {
                const detail = String(err?.stderr ?? "").trim();
                console.error(`translate Google ${reason} (code=${err.code}): ${detail || err.message}`);
                const googleCode = await probeGoogleStatus();
                return runLibreFallback(reason, googleCode);
            }
            return reply.status(500).send({ error: err.message });
        }
    });
}
