// Bảng màu TAG (2026-09-27) — admin bấm CHẤM MÀU → hiện bảng màu để chọn.
// ⚠️ CHỈ dùng tông 500 → 900 (KHÔNG có màu nhạt 100–400, KHÔNG có màu đen).
// 10 SẮC GỐC × 5 TÔNG = 50 màu; hiển thị theo HÀNG = 1 sắc (Đỏ 500…900, Xanh dương 500…900…)
// để dễ tra. (Bỏ dải Xám vì tông đậm của xám bị coi là màu đen.)
// ⚠️ BE (`backend/lib/prismaServiceSplit.js`) chấp nhận MỌI mã #rrggbb nên đổi bảng màu ở đây
// KHÔNG cần sửa BE (BE chỉ có list `TAG_DEFAULT_COLORS` để gán màu mặc định khi tạo tag).

/** Tông (cột) — chỉ 500 (sáng vừa) → 900 (đậm). */
export const TAG_SHADES = [500, 600, 700, 800, 900];

/** Sắc gốc (hàng) — mỗi sắc 5 màu theo thứ tự 500 → 900. */
export const TAG_HUES = [
    { name: "Đỏ", shades: ["#ef4444", "#dc2626", "#b91c1c", "#991b1b", "#7f1d1d"] },
    { name: "Cam", shades: ["#f97316", "#ea580c", "#c2410c", "#9a3412", "#7c2d12"] },
    { name: "Vàng", shades: ["#f59e0b", "#d97706", "#b45309", "#92400e", "#78350f"] },
    { name: "Lục", shades: ["#84cc16", "#65a30d", "#4d7c0f", "#3f6212", "#365314"] },
    { name: "Xanh lá", shades: ["#22c55e", "#16a34a", "#15803d", "#166534", "#14532d"] },
    { name: "Ngọc", shades: ["#14b8a6", "#0d9488", "#0f766e", "#115e59", "#134e4a"] },
    { name: "Xanh dương", shades: ["#3b82f6", "#2563eb", "#1d4ed8", "#1e40af", "#1e3a8a"] },
    { name: "Chàm", shades: ["#6366f1", "#4f46e5", "#4338ca", "#3730a3", "#312e81"] },
    { name: "Tím", shades: ["#8b5cf6", "#7c3aed", "#6d28d9", "#5b21b6", "#4c1d95"] },
    { name: "Hồng", shades: ["#ec4899", "#db2777", "#be185d", "#9d174d", "#831843"] },
];

/** Hàng = SẮC, cột = TÔNG (500→900) → panel 10 hàng × 5 cột. */
export const TAG_COLOR_ROWS = TAG_HUES.map((h) => [...h.shades]);

export const TAG_COLORS = TAG_COLOR_ROWS.flat();

// Nhãn cho từng mã màu: "Đỏ 500", "Xanh dương 700"… (dùng cho tooltip/aria-label).
const COLORS_BY_LABEL = new Map();
for (const hue of TAG_HUES) {
    hue.shades.forEach((hex, shadeIdx) => COLORS_BY_LABEL.set(hex, `${hue.name} ${TAG_SHADES[shadeIdx]}`));
}

export function tagColorLabel(color) {
    return COLORS_BY_LABEL.get(color) ?? color;
}

/** Màu của 1 tag (tag object từ API có `color`; chưa set → xanh dương 500). */
export function tagColor(tag) {
    if (!tag) return "#3b82f6";
    return tag.color || "#3b82f6";
}

/** Màu nền (nhạt) + viền (đậm vừa) suy ra từ màu chính — dùng cho chip. */
export function tagChipStyle(color) {
    const c = color || "#3b82f6";
    return { color: c, background: `${c}1f`, borderColor: `${c}59` };
}
