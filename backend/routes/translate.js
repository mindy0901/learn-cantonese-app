import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { toPinyin } from "../lib/pinyin.js";

const execFileAsync = promisify(execFile);
const PYTHON_BIN = "/opt/pycantonese-venv/bin/python3";
const JYUTPING_SCRIPT = "/app/scripts/jyutping.py";

async function toJyutping(text) {
    try {
        const { stdout } = await execFileAsync(PYTHON_BIN, [JYUTPING_SCRIPT, text], {
            timeout: 10000,
        });
        return stdout.trim();
    } catch (err) {
        console.error("pycantonese error:", err.message);
        return "";
    }
}

export async function translateRoutes(fastify) {
    /**

        if (!text || !String(text).trim()) {
            return reply.status(400).send({ error: "Missing text" });
        }

        try {
            const jyutping = await toJyutping(String(text).trim());
            return { jyutping };
        } catch (err) {
            return reply.status(500).send({ error: err.message });
        }
    });

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
}
