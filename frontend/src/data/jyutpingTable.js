/**
 * Bảng Jyutping (bộ gõ LSHK) — dữ liệu lấy từ Open Cantonese
 * https://opencantonese.org/books/cantonese-life-1/pronunciation-guide/jyutping-chart
 *
 * Audio: https://opencantonese.org/files/cantonese-life-1/jpc/{initial|final|tone}-NN-<name>.mp3
 */

/* ── Thanh mẫu (19) ── */
export const JYUTPING_INITIALS = [
    { initial: "b", audio: 1 },
    { initial: "p", audio: 2 },
    { initial: "m", audio: 3 },
    { initial: "f", audio: 4 },
    { initial: "d", audio: 5 },
    { initial: "t", audio: 6 },
    { initial: "n", audio: 7 },
    { initial: "l", audio: 8 },
    { initial: "g", audio: 9 },
    { initial: "k", audio: 10 },
    { initial: "ng", audio: 11 },
    { initial: "h", audio: 12 },
    { initial: "gw", audio: 13 },
    { initial: "kw", audio: 14 },
    { initial: "w", audio: 15 },
    { initial: "z", audio: 16 },
    { initial: "c", audio: 17 },
    { initial: "s", audio: 18 },
    { initial: "j", audio: 19 },
];

/**
 * Grid thanh mẫu — bố cục 5×5 như Open Cantonese
 * (cột 1 = Unaspirated, cột 2 = Aspirated, còn lại m/n/ng…).
 * Ô = null → ô trống.
 */
export const JYUTPING_INITIAL_GRID = [
    ["b", "p", "m", "f", null],
    ["d", "t", "n", null, "l"],
    ["g", "k", "ng", "h", null],
    ["gw", "kw", null, null, "w"],
    ["z", "c", null, "s", "j"],
];

/* ── Cột vận mẫu: 9 nguyên âm + cột âm mũi (m/ng) ── */
export const JYUTPING_FINAL_COLS = ["aa", "a", "e", "i", "o", "u", "eo", "oe", "yu", ""];

/**
 * Vận mẫu (finals) — mỗi hàng theo vận đuôi (coda).
 * Ô = tên vận mẫu hoặc null (không tồn tại).
 * Các nguyên âm độc lập (aa a e i o u eo oe yu) KHÔNG nằm trong bảng data —
 * chúng là header cột (title top), click header để nghe.
 * Cột cuối (index 9) = âm mũi độc lập m / ng (không có header).
 */
export const JYUTPING_FINALS = [
    { coda: "-i", finals: ["aai", "ai", "ei", null, "oi", "ui", "eoi", null, null, null] },
    { coda: "-u", finals: ["aau", "au", "eu", "iu", "ou", null, null, null, null, null] },
    { coda: "-m", finals: ["aam", "am", "em", "im", null, null, null, null, null, "m"] },
    { coda: "-n", finals: ["aan", "an", null, "in", "on", "un", "eon", null, "yun", null] },
    { coda: "-ng", finals: ["aang", "ang", "eng", "ing", "ong", "ung", null, "oeng", null, "ng"] },
    { coda: "-p", finals: ["aap", "ap", "ep", "ip", null, null, null, null, null, null] },
    { coda: "-t", finals: ["aat", "at", "et", "it", "ot", "ut", "eot", "oet", "yut", null] },
    { coda: "-k", finals: ["aak", "ak", "ek", "ik", "ok", "uk", null, "oek", null, null] },
];

/* ── Số thứ tự audio cho từng vận mẫu (theo Open Cantonese) ── */
export const JYUTPING_FINAL_AUDIO = {
    aa: 1,
    a: 2,
    e: 3,
    i: 4,
    o: 5,
    u: 6,
    eo: 7,
    oe: 8,
    yu: 9,
    aai: 10,
    ai: 11,
    ei: 12,
    oi: 13,
    ui: 14,
    eoi: 15,
    aau: 16,
    au: 17,
    eu: 18,
    iu: 19,
    ou: 20,
    aam: 21,
    am: 22,
    em: 23,
    im: 24,
    m: 25,
    aan: 26,
    an: 27,
    in: 28,
    on: 29,
    un: 30,
    eon: 31,
    yun: 32,
    aang: 33,
    ang: 34,
    eng: 35,
    ing: 36,
    ong: 37,
    ung: 38,
    oeng: 39,
    ng: 40,
    aap: 41,
    ap: 42,
    ep: 43,
    ip: 44,
    aat: 45,
    at: 46,
    et: 47,
    it: 48,
    ot: 49,
    ut: 50,
    eot: 51,
    oet: 52,
    yut: 53,
    aak: 54,
    ak: 55,
    ek: 56,
    ik: 57,
    ok: 58,
    uk: 59,
    oek: 60,
};

const pad2 = (n) => String(n).padStart(2, "0");

const JYUTPING_CDN_BASE = "https://opencantonese.org/files/cantonese-life-1/jpc";

/** URL local (đã tải về `frontend/public/audio/jyutping/`) */
export function jyutpingInitialLocalUrl(initial) {
    const idx = JYUTPING_INITIALS.find((x) => x.initial === initial)?.audio;
    if (!idx) return null;
    return `/audio/jyutping/initial-${pad2(idx)}-${initial}.mp3`;
}

/** URL CDN Open Cantonese (fallback) */
export function jyutpingInitialCdnUrl(initial) {
    const idx = JYUTPING_INITIALS.find((x) => x.initial === initial)?.audio;
    if (!idx) return null;
    return `${JYUTPING_CDN_BASE}/initial-${pad2(idx)}-${initial}.mp3`;
}

/** URL audio thanh mẫu (mặc định: local) */
export function jyutpingInitialAudioUrl(initial) {
    return jyutpingInitialLocalUrl(initial);
}

/** URL local vận mẫu — null nếu không có audio */
export function jyutpingFinalLocalUrl(final) {
    const idx = JYUTPING_FINAL_AUDIO[final];
    if (!idx) return null;
    return `/audio/jyutping/final-${pad2(idx)}-${final}.mp3`;
}

/** URL CDN vận mẫu — null nếu không có audio */
export function jyutpingFinalCdnUrl(final) {
    const idx = JYUTPING_FINAL_AUDIO[final];
    if (!idx) return null;
    return `${JYUTPING_CDN_BASE}/final-${pad2(idx)}-${final}.mp3`;
}

/** URL audio vận mẫu (mặc định: local) */
export function jyutpingFinalAudioUrl(final) {
    return jyutpingFinalLocalUrl(final);
}

/** URL local thanh điệu */
export function jyutpingToneLocalUrl(tone) {
    return `/audio/jyutping/tone-${pad2(tone)}.mp3`;
}

/** URL CDN thanh điệu */
export function jyutpingToneCdnUrl(tone) {
    return `${JYUTPING_CDN_BASE}/tone-${pad2(tone)}.mp3`;
}

/** URL audio thanh điệu (mặc định: local) */
export function jyutpingToneAudioUrl(tone) {
    return jyutpingToneLocalUrl(tone);
}

/* ── 6 Thanh điệu ── */
export const JYUTPING_TONES = [1, 2, 3, 4, 5, 6];
