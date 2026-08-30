/**
 * Helper phát âm tiếng Trung bằng Web Speech API (speechSynthesis).
 * Dùng chung cho Bảng Pinyin (fallback) và Trang Bộ thủ.
 */

// Load danh sách giọng TTS (voices load bất đồng bộ qua sự kiện voiceschanged)
export function loadVoices() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return Promise.resolve([]);
    return new Promise((resolve) => {
        const got = window.speechSynthesis.getVoices();
        if (got.length > 0) {
            resolve(got);
            return;
        }
        const onVoices = () => {
            const v = window.speechSynthesis.getVoices();
            if (v.length > 0) {
                window.speechSynthesis.removeEventListener("voiceschanged", onVoices);
                resolve(v);
            }
        };
        window.speechSynthesis.addEventListener("voiceschanged", onVoices);
        // Fallback nếu sự kiện không bao giờ bắn
        setTimeout(() => {
            window.speechSynthesis.removeEventListener("voiceschanged", onVoices);
            resolve(window.speechSynthesis.getVoices());
        }, 1500);
    });
}

/**
 * Chọn giọng tiếng Trung.
 * - Mặc định (đọc hán tự): ưu tiên Google — Google 普通话/zh-CN → Google zh-CN → Google → zh-CN → zh bất kỳ
 * - `preferPinyin: true` (đọc pinyin): ưu tiên giọng Microsoft zh-CN (đọc pinyin rõ hơn),
 *   vì Google zh-CN đọc các pinyin gần giống nhau → Microsoft zh-CN → zh-CN → Microsoft → Google → zh bất kỳ
 */
export function pickZhVoice(voices, { preferPinyin = false } = {}) {
    const zh = voices.filter((v) => v.lang.toLowerCase().startsWith("zh"));
    if (zh.length === 0) return null;

    if (preferPinyin) {
        return (
            zh.find((v) => /microsoft/i.test(v.name) && v.lang.toLowerCase() === "zh-cn") ??
            zh.find((v) => v.lang.toLowerCase() === "zh-cn") ??
            zh.find((v) => /microsoft/i.test(v.name)) ??
            zh.find((v) => /google/i.test(v.name) && /普通话|mandarin|chinese/i.test(v.name)) ??
            zh[0]
        );
    }

    return (
        zh.find((v) => /google/i.test(v.name) && /普通话|mandarin|chinese/i.test(v.name)) ??
        zh.find((v) => /google/i.test(v.name) && v.lang.toLowerCase() === "zh-cn") ??
        zh.find((v) => /google/i.test(v.name)) ??
        zh.find((v) => v.lang.toLowerCase() === "zh-cn") ??
        zh[0]
    );
}

/**
 * Chọn giọng TIẾNG QUẢNG (Cantonese, zh-HK) — ưu tiên giọng Windows:
 * Microsoft Tracy (nữ) → Microsoft Danny (nam) → bất kỳ zh-HK → null nếu không có.
 * Dùng cho nút "Nghe cách đọc" của từ/ví dụ Cantonese (2026-08-25).
 */
export function pickCantoneseVoice(voices) {
    const zhHk = voices.filter((v) => {
        const lang = v.lang.toLowerCase();
        return lang === "zh-hk" || lang.startsWith("zh-hk") || /hong kong/i.test(`${v.lang} ${v.name}`);
    });
    if (zhHk.length === 0) return null;
    return (
        zhHk.find((v) => /tracy/i.test(v.name)) ??
        zhHk.find((v) => /female|nữ/i.test(v.name)) ??
        zhHk.find((v) => /danny/i.test(v.name)) ??
        zhHk[0]
    );
}

/**
 * Đọc văn bản tiếng QUẢNG (zh-HK) bằng speechSynthesis (giọng Windows Tracy/Danny).
 * @param {string} text
 * @param {{rate?: number, onend?: () => void, onerror?: () => void}} [options]
 * @returns {Promise<boolean>} true nếu đã gọi speak (có giọng zh-HK)
 */
export async function speakCantonese(text, { rate = 0.9, onend, onerror } = {}) {
    try {
        if (typeof window === "undefined" || !("speechSynthesis" in window)) {
            onerror?.();
            return false;
        }
        const voices = await loadVoices();
        const voice = pickCantoneseVoice(voices);
        if (!voice) {
            onerror?.();
            return false;
        }
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.voice = voice;
        u.lang = voice.lang ?? "zh-HK";
        u.rate = rate;
        if (onend) u.onend = onend;
        if (onerror) u.onerror = onerror;
        window.speechSynthesis.speak(u);
        return true;
    } catch {
        onerror?.();
        return false;
    }
}

/**
 * Đọc văn bản tiếng Trung bằng speechSynthesis.
 * @param {string} text
 * @param {{rate?: number, forPinyin?: boolean, onend?: () => void, onerror?: () => void}} [options]
 * @returns {Promise<boolean>} true nếu đã gọi speak
 */
export async function speak(text, { rate = 0.9, forPinyin = false, onend, onerror } = {}) {
    try {
        if (typeof window === "undefined" || !("speechSynthesis" in window)) {
            onerror?.();
            return false;
        }
        const voices = await loadVoices();
        const voice = pickZhVoice(voices, { preferPinyin: forPinyin });
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        if (voice) u.voice = voice;
        u.lang = voice?.lang ?? "zh-CN";
        u.rate = rate;
        if (onend) u.onend = onend;
        if (onerror) u.onerror = onerror;
        window.speechSynthesis.speak(u);
        return true;
    } catch {
        onerror?.();
        return false;
    }
}
