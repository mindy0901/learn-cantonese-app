/** ⚠️ 2026-09-05: Độ phổ biến lưu thẳng 5 mức (DB cột `popularity_level`):
 *   1 = Hiếm · 2 = Thấp · 3 = Trung bình · 4 = Cao · 5 = Rất cao.
 *   Không còn percentile theo từng bank (cơ chế số cũ đã bỏ).
 *   Labels nằm trong i18n `wordPopularity.levels` (index = level - 1). */

export const POPULARITY_LEVELS = [1, 2, 3, 4, 5];
export const POPULARITY_LEVEL_MIN = 1;
export const POPULARITY_LEVEL_MAX = 5;

/** Chuẩn hóa level → int 1..5; null/0/nằm ngoài khoảng → null (chưa đánh giá). */
export function normalizePopularityLevel(value) {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    if (!Number.isInteger(n) || n < POPULARITY_LEVEL_MIN || n > POPULARITY_LEVEL_MAX) return null;
    return n;
}

/** ⚠️ 2026-09-20: class MÀU CHỮ theo cấp độ phổ biến (token trong globals.css: `text-pop-1..5`).
 *  1 Hiếm (đỏ) → 2 Thấp (cam) → 3 Trung bình (vàng) → 4 Cao (lime) → 5 Rất cao (xanh lá).
 *  Level null/không hợp lệ → null (caller tự chọn màu muted). */
export const POPULARITY_LEVEL_TEXT_CLASS = {
    1: "text-pop-1",
    2: "text-pop-2",
    3: "text-pop-3",
    4: "text-pop-4",
    5: "text-pop-5",
};

export function popularityLevelTextClass(value) {
    const n = normalizePopularityLevel(value);
    return n ? POPULARITY_LEVEL_TEXT_CLASS[n] : null;
}

/** Nhãn i18n của level (levels[level-1]) — null nếu chưa đánh giá. */
export function popularityLevelIndex(value) {
    const n = normalizePopularityLevel(value);
    return n ? n - 1 : null;
}
