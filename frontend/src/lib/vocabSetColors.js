// Palette màu cho các "bộ từ vựng" (2026-09-02) — dùng chung VocabularySetPicker + VocabularySetsManager.
export const SET_COLORS = ["#7c3aed", "#0ea5e9", "#16a34a", "#f59e0b", "#ef4444", "#8b5cf6"];

export function randomSetColor() {
    return SET_COLORS[Math.floor(Math.random() * SET_COLORS.length)];
}

export function nextSetColor(color) {
    const idx = SET_COLORS.indexOf(color);
    return SET_COLORS[(idx + 1) % SET_COLORS.length] ?? SET_COLORS[0];
}
