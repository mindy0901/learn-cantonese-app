const HANZII_HL = {
    "zh-CN": "zh-CN",
    "zh-TW": "zh-TW",
};

export function hanziiHl(locale) {
    // Mặc định mở Hanzii tiếng Việt (kể cả khi app dùng en) — chỉ giữ zh cho tiếng Trung
    return HANZII_HL[locale] ?? "vi";
}

export function hanziiWordUrl(hanTraditional, locale) {
    const query = String(hanTraditional ?? "").trim();
    if (!query) return null;
    const hl = hanziiHl(locale);
    return `https://hanzii.net/search/word/${encodeURIComponent(query)}?hl=${encodeURIComponent(hl)}`;
}

export function hanziiHomeUrl(locale) {
    return `https://hanzii.net/?hl=${encodeURIComponent(hanziiHl(locale))}`;
}
