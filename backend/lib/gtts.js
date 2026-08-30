/**
 * gTTS (Google Translate TTS) — gọi endpoint translate_tts trực tiếp.
 * - Cantonese: lang="yue" (mặc định)
 * - Mandarin giản thể: lang="zh-CN"
 * Chạy server-side → mọi user nghe được (không cần giọng local). (2026-08-25)
 *
 * Endpoint: https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=<lang>&q=<text>
 * Trả về MP3 (~7KB/1 từ). Text >100 ký tự Google cắt — chia nhỏ theo câu rồi nối MP3.
 */
const GOOGLE_TTS = "https://translate.google.com/translate_tts";
const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const MAX_CHARS = 100;

/** Chia text thành đoạn ≤ MAX_CHARS theo dấu câu. */
function chunkText(text) {
    const clean = String(text ?? "").trim();
    if (!clean) return [];
    if (clean.length <= MAX_CHARS) return [clean];
    const parts = [];
    let buf = "";
    for (const seg of clean.split(/(?<=[。！？!?；;，,])/)) {
        if ((buf + seg).length > MAX_CHARS && buf) {
            parts.push(buf);
            buf = seg;
        } else {
            buf += seg;
        }
    }
    if (buf) parts.push(buf);
    return parts;
}

async function fetchTtsChunk(text, lang) {
    const url = `${GOOGLE_TTS}?ie=UTF-8&client=tw-ob&tl=${lang}&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`gTTS ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) throw new Error("gTTS empty");
    return buf;
}

/**
 * Sinh MP3 tiếng theo lang (yue = Cantonese, zh-CN = Mandarin giản thể).
 * @param {string} text
 * @param {string} [lang] "yue" | "zh-CN" (mặc định "yue")
 * @returns {Promise<Buffer>} MP3 buffer
 */
export async function synthesizeMp3(text, lang = "yue") {
    const chunks = chunkText(text);
    if (chunks.length === 0) throw new Error("empty text");
    const bufs = [];
    for (const c of chunks) {
        bufs.push(await fetchTtsChunk(c, lang));
    }
    // MP3 nối tiếp nhau được (trình phát xử lý tuần tự) — đủ tốt cho TTS.
    return Buffer.concat(bufs);
}

/** Backward-compat: alias cho Cantonese. */
export async function synthesizeCantoneseMp3(text) {
    return synthesizeMp3(text, "yue");
}
