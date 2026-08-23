/**
 * openccHK.js — OpenCC HK phrase-aware conversion (2026-08-17).
 *
 * opencc-js chỉ hỗ trợ s2hk (cấp CHỮ), KHÔNG có HKPhrases → thiếu `s2hkp`.
 * Real OpenCC (native `opencc` npm) không chạy được trong container (thiếu GLIBCXX_3.4.32).
 * Giải pháp: opencc-js + đúng file `HKPhrases.txt` chính thức (Apache-2.0, từ BYVoid/OpenCC)
 * → cho kết quả y hệt s2hkp (s2hk + HKPhrases).
 *
 * - `s2hkp(text)`: giản thể → phồn thể HK (kèm cụm từ HK: 服务器→伺服器, 弗吉尼亚→維珍尼亞...)
 * - `hk2s(text)`: phồn thể HK → giản thể (đảo chiều)
 * - `s2hk(text)`: giản thể → phồn thể HK (chỉ chữ, như cũ)
 */
import { readFileSync } from "node:fs";
import { Converter } from "opencc-js";

// ── Load HKPhrases.txt: key(giản thể) → value(HK phồn). Sort longest-first để match cụm dài trước. ──
const hkPhrases = [];
{
    const raw = readFileSync(new URL("../data/HKPhrases.txt", import.meta.url), "utf8");
    for (const line of raw.split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith("#")) continue;
        const parts = t.split("\t");
        if (parts.length < 2) continue;
        const key = parts[0].trim();
        const val = parts[1].trim().split(/\s+/)[0];
        if (key && val) hkPhrases.push([key, val]);
    }
    hkPhrases.sort((a, b) => b[0].length - a[0].length);
}

const _s2hk = Converter({ from: "cn", to: "hk" });
const _hk2s = Converter({ from: "hk", to: "cn" });
const _hk2t = Converter({ from: "hk", to: "t" });

/** Giản thể → phồn thể HK (chỉ chữ). */
export function s2hk(text) {
    return _s2hk(String(text ?? ""));
}

/** Phồn thể HK → giản thể. */
export function hk2s(text) {
    return _hk2s(String(text ?? ""));
}

/** Phồn thể HK → phồn thể chuẩn (traditional). */
export function hk2t(text) {
    return _hk2t(String(text ?? ""));
}

/** s2hkp: giản thể → phồn thể HK kèm cụm từ HK.
 *  ⚠️ Key HKPhrases.txt là PHỒN THỂ (vd 服務器→伺服器) → phải s2hk TRƯỚC (ra phồn)
 *  rồi mới áp HKPhrases. (2026-08-17 — từng làm ngược, cụm không khớp) */
export function s2hkp(text) {
    let out = _s2hk(String(text ?? ""));
    for (const [k, v] of hkPhrases) {
        out = out.split(k).join(v);
    }
    return out;
}
