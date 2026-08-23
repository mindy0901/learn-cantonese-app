import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve, dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { toPinyin } from "../lib/pinyin.js";
import { lookupJyutping } from "../lib/jyutpingLookup.js";

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

        const src = String(source || "en").toLowerCase();
        const tgt = String(target || "vi").toLowerCase();

        // Cantonese → Vietnamese: deep_translator blocks 'yue' as a source code, so
        // dispatch to a dedicated script that calls Google's gtx endpoint (sl=yue).
        const isCantonese = ["yue", "zh-yue", "cantonese", "zh-hk", "hk"].includes(src);

        try {
            const args =
                isCantonese && tgt === "vi"
                    ? [resolve(SCRIPTS_DIR, "translate_cantonese.py"), "--single", String(text).trim()]
                    : [
                          resolve(SCRIPTS_DIR, "translate_pair.py"),
                          "--single",
                          String(text).trim(),
                          "--source",
                          src,
                          "--target",
                          tgt,
                      ];
            const { stdout } = await execFileAsync(PYTHON_BIN, args, {
                timeout: 20000,
                env: { ...process.env, PYTHONIOENCODING: "utf-8" },
            });

            return { translated: stdout.trim() };
        } catch (err) {
            console.error("translate error:", err.message);
            // exit code 2 = Google rate limit → trả 429 để user biết thử lại sau (2026-08-24).
            if (err.code === 2) {
                return reply.status(429).send({ error: "Google Translate đang giới hạn (rate limit) — thử lại sau" });
            }
            return reply.status(500).send({ error: err.message });
        }
    });

    /**
     * POST /translate-google
     * Body: { text, source, target }
     * Dịch qua Google Translate "gtx" (Google web) — bypass deep_translator.
     * Dùng cho nút "Dịch từ tiếng Anh" (en → vi) trong edit page.
     */
    fastify.post("/translate-google", async (request, reply) => {
        const { text, source = "en", target = "vi" } = request.body ?? {};

        if (!text || !String(text).trim()) {
            return reply.status(400).send({ error: "Missing text" });
        }

        try {
            const { stdout } = await execFileAsync(
                PYTHON_BIN,
                [
                    resolve(SCRIPTS_DIR, "translate_google.py"),
                    "--single",
                    String(text).trim(),
                    "--source",
                    String(source),
                    "--target",
                    String(target),
                ],
                { timeout: 20000, env: { ...process.env, PYTHONIOENCODING: "utf-8" } },
            );

            return { translated: stdout.trim() };
        } catch (err) {
            console.error("translate-google error:", err.message);
            // exit code 2 = Google rate limit → trả 429 để user biết thử lại sau (2026-08-24).
            if (err.code === 2) {
                return reply.status(429).send({ error: "Google Translate đang giới hạn (rate limit) — thử lại sau" });
            }
            return reply.status(500).send({ error: err.message });
        }
    });
}
