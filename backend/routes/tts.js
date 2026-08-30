/**
 * Route TTS (gTTS Google Translate TTS — server-side).
 * POST /api/tts  { text, lang? }  ->  { url, cached }
 * - lang: "yue" (Cantonese, mặc định) | "zh-CN" (Mandarin giản thể)
 * Flow:
 *   - Case 2: đã có MP3 trên R2 (key theo lang+text) → trả URL ngay (cached).
 *   - Case 1: chưa có → gTTS sinh MP3 → upload R2 → trả URL (cached=false).
 * Cache theo md5(lang|text) — cùng text+lang dùng chung 1 file (content-addressed).
 */
import crypto from "node:crypto";
import { R2_CONFIGURED, R2_PUBLIC_BASE, r2Head, uploadBufferToR2 } from "../lib/r2.js";
import { synthesizeMp3 } from "../lib/gtts.js";

const LANG_PREFIX = { yue: "cantonese-tts", "zh-CN": "mandarin-tts", "zh-cn": "mandarin-tts" };

export async function ttsRoutes(fastify) {
    fastify.post("/tts", async (request, reply) => {
        const { text, lang } = request.body ?? {};
        const t = String(text ?? "").trim();
        if (!t) return reply.status(400).send({ error: "Missing text" });

        const l = String(lang ?? "yue");
        // Cache: md5(text) — cùng text dùng chung 1 file. Prefix riêng theo ngôn ngữ:
        // cantonese-tts (yue) / mandarin-tts (zh-CN).
        const prefix = LANG_PREFIX[l] ?? "cantonese-tts";
        const key = `${prefix}/${crypto.createHash("md5").update(t).digest("hex")}.mp3`;
        const publicUrl = R2_CONFIGURED ? `${R2_PUBLIC_BASE || ""}/${key}` : null;

        try {
            // Case 2: cache R2.
            if (R2_CONFIGURED) {
                const head = await r2Head(key).catch(() => null);
                if (head && head.ok) return { url: publicUrl, cached: true };
            }

            // Case 1: sinh + upload.
            const mp3 = await synthesizeMp3(t, l);
            let url = null;
            if (R2_CONFIGURED) {
                url = await uploadBufferToR2(key, mp3, "audio/mpeg");
            }
            return { url: url || null, cached: false };
        } catch (err) {
            return reply.status(502).send({ error: `tts: ${err.message}` });
        }
    });
}
