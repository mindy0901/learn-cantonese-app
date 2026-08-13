import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { toPinyin } from "../lib/pinyin.js";
import { lookupJyutping } from "../lib/jyutpingLookup.js";

const execFileAsync = promisify(execFile);
const PYTHON_BIN = "/opt/translate-venv/bin/python3";

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
                ["/app/scripts/translate_vietnamese.py", "--single", String(text).trim()],
                { timeout: 15000 },
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
                ["/app/scripts/translate_english.py", "--single", String(text).trim()],
                { timeout: 15000 },
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

        try {
            const { stdout } = await execFileAsync(
                PYTHON_BIN,
                ["/app/scripts/translate_pair.py", "--single", String(text).trim(), "--source", src, "--target", tgt],
                { timeout: 20000 },
            );

            return { translated: stdout.trim() };
        } catch (err) {
            console.error("translate error:", err.message);
            return reply.status(500).send({ error: err.message });
        }
    });
}
