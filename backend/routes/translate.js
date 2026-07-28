const DEEPL_API_KEY = process.env.DEEPL_API_KEY;
const DEEPL_URL = "https://api-free.deepl.com/v2/translate";

import { toJyutping } from "../lib/jyutping.js";
import { toPinyin } from "../lib/pinyin.js";

/**
 * POST /translate
 * Body: { text: string, sourceLang?: string, targetLang?: string }
 * Translates text using DeepL Free API.
 */
export async function translateRoutes(fastify) {
    fastify.post("/translate", async (request, reply) => {
        const { text, sourceLang = "VI", targetLang = "EN-US" } = request.body ?? {};

        if (!text || !String(text).trim()) {
            return reply.status(400).send({ error: "Missing text" });
        }
        if (!DEEPL_API_KEY) {
            return reply.status(500).send({ error: "DeepL API key not configured" });
        }

        try {
            const params = new URLSearchParams({
                text: String(text).trim(),
                source_lang: sourceLang,
                target_lang: targetLang,
            });

            const res = await fetch(DEEPL_URL, {
                method: "POST",
                headers: {
                    Authorization: `DeepL-Auth-Key ${DEEPL_API_KEY}`,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: params.toString(),
            });

            if (!res.ok) {
                const err = await res.text();
                return reply.status(res.status).send({ error: `DeepL error: ${err}` });
            }

            const data = await res.json();
            const translated = data.translations?.[0]?.text ?? "";
            return { translated };
        } catch (err) {
            return reply.status(500).send({ error: err.message });
        }
    });

    /**
     * POST /jyutping
     * Body: { text: string }
     * Converts Chinese text to Jyutping romanization.
     */
    fastify.post("/jyutping", async (request, reply) => {
        const { text } = request.body ?? {};

        if (!text || !String(text).trim()) {
            return reply.status(400).send({ error: "Missing text" });
        }

        try {
            const jyutping = toJyutping(String(text).trim());
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
}
