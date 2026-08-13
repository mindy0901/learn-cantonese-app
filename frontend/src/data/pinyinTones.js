/**
 * Helper thanh điệu pinyin: đánh dấu thanh, mô tả cách đọc thanh mẫu, và
 * URL phát âm (Google Translate TTS — đọc pinyin có dấu thanh).
 */

// Nguyên âm có dấu theo thanh 1–4
const TONE_VOWELS = {
    1: { a: "ā", o: "ō", e: "ē", i: "ī", u: "ū", v: "ǖ" },
    2: { a: "á", o: "ó", e: "é", i: "í", u: "ú", v: "ǘ" },
    3: { a: "ǎ", o: "ǒ", e: "ě", i: "ǐ", u: "ǔ", v: "ǚ" },
    4: { a: "à", o: "ò", e: "è", i: "ì", u: "ù", v: "ǜ" },
};

// 5 lựa chọn thanh: 1–4 + thanh nhẹ (5)
export const PINYIN_TONES = [1, 2, 3, 4, 5];

function toneVowelIndex(syllable) {
    // Ưu tiên dấu trên: a > o > e > (i/u: dấu trên chữ đứng sau) > ü
    if (syllable.includes("a")) return syllable.indexOf("a");
    if (syllable.includes("o")) return syllable.indexOf("o");
    if (syllable.includes("e")) return syllable.indexOf("e");
    const i = syllable.indexOf("i");
    const u = syllable.indexOf("u");
    if (i !== -1 && u !== -1) return Math.max(i, u);
    if (i !== -1) return i;
    if (u !== -1) return u;
    const uu = syllable.indexOf("ü");
    if (uu !== -1) return uu;
    return -1;
}

/** Thêm dấu thanh vào âm tiết. tone = 1–4; tone = 5 (nhẹ) hoặc 0 → không dấu. */
export function addTone(syllable, tone) {
    if (!syllable) return "";
    if (tone === 5 || tone === 0) return syllable;
    const idx = toneVowelIndex(syllable);
    if (idx === -1) return syllable;
    const ch = syllable[idx];
    const base = ch === "ü" ? "v" : ch;
    const marked = TONE_VOWELS[tone]?.[base];
    if (!marked) return syllable;
    return syllable.slice(0, idx) + marked + syllable.slice(idx + 1);
}

/**
 * URL file MP3 phát âm pinyin (nguồn Yabla — đầy đủ hơn nhaihsk):
 * `https://yabla.b-cdn.net/media.yabla.com/chinese_static/audio/alicia/<âm tiết ü→v><thanh>.mp3`.
 * File đã tải local về `frontend/public/audio/pinyin/` → ưu tiên local, fallback CDN nếu thiếu.
 * Cả 2 đều không có → fallback sang speechSynthesis.
 */

const PINYIN_CDN_BASE = "https://yabla.b-cdn.net/media.yabla.com/chinese_static/audio/alicia";

function pinyinKey(syllable) {
    return syllable.replace("ü", "v");
}

/** URL local (đã tải về project) */
export function pinyinLocalAudioUrl(syllable, tone) {
    return `/audio/pinyin/${pinyinKey(syllable)}${tone}.mp3`;
}

/** URL CDN Yabla (fallback) */
export function pinyinCdnAudioUrl(syllable, tone) {
    return `${PINYIN_CDN_BASE}/${pinyinKey(syllable)}${tone}.mp3`;
}

/** URL mặc định: ưu tiên local */
export function pinyinAudioUrl(syllable, tone) {
    return pinyinLocalAudioUrl(syllable, tone);
}

/**
 * Độ phủ file audio Yabla — đã kiểm tra (2026-08-11): 407/408 âm tiết có đủ 4 thanh.
 * `ei` (âm tiết đứng độc lập) KHÔNG tồn tại trong bảng chuẩn (đã xóa) nên không cần liệt kê.
 * Map: âm tiết → Set các thanh THIẾU file (hiện không còn âm tiết nào thiếu).
 */
export const PINYIN_MISSING_AUDIO_TONES = {};

/** Kiểm tra âm tiết + thanh có file MP3 không. Thanh 5 (nhẹ) hầu như không có → false. */
export function hasPinyinAudio(syllable, tone) {
    if (tone === 5) return false;
    return !PINYIN_MISSING_AUDIO_TONES[syllable]?.has(tone);
}

/** Mô tả cách đọc từng thanh mẫu (tiếng Việt). */
export const PINYIN_INITIAL_DESC = {
    Ø: "Nguyên âm đơn — đọc trực tiếp vận mẫu, không có phụ âm đầu.",
    b: "Giống 'b' tiếng Việt nhưng âm bật nhẹ, môi khép, không rung dây thanh.",
    p: "Giống 'p' bật hơi mạnh, môi khép rồi bật ra.",
    m: "Giống 'm' tiếng Việt, môi khép và rung.",
    f: "Giống 'ph' tiếng Việt — răng trên chạm môi dưới.",
    d: "Giống 'đ' tiếng Việt, đầu lưỡi chạm lợi, bật nhẹ không rung.",
    t: "Giống 't' tiếng Việt nhưng bật hơi mạnh.",
    n: "Giống 'n' tiếng Việt, đầu lưỡi chạm lợi.",
    l: "Giống 'l' tiếng Việt, đầu lưỡi chạm lợi, hơi đi ra hai bên.",
    g: "Giống 'g' tiếng Việt, cuống lưỡi chạm ngạc mềm, bật nhẹ.",
    k: "Giống 'c'/'k' tiếng Việt, cuống lưỡi chạm ngạc mềm, bật hơi mạnh.",
    h: "Giống 'h' tiếng Việt, hơi nhẹ từ cổ họng.",
    j: "Giống 'ch' tiếng Việt, mặt lưỡi chạm ngạc cứng, không bật hơi.",
    q: "Giống 'ch' tiếng Việt nhưng bật hơi mạnh.",
    x: "Giống 'x' tiếng Việt nhưng lưỡi gần khe răng, đọc nhẹ.",
    zh: "Uốn lưỡi cong lên, gần 'tr' tiếng Việt nhưng nhẹ, không rung.",
    ch: "Uốn lưỡi cong lên, giống 'tr' tiếng Việt nhưng bật hơi mạnh.",
    sh: "Uốn lưỡi cong lên, giống 's' tiếng Việt nhưng lưỡi cong.",
    r: "Uốn lưỡi, gần 'r' tiếng Việt nhưng nhẹ, không rung.",
    z: "Đầu lưỡi chạm răng, giống 'd' tiếng Việt, không rung.",
    c: "Đầu lưỡi chạm răng, bật hơi mạnh.",
    s: "Giống 'x' tiếng Việt, đầu lưỡi gần chạm răng.",
};
