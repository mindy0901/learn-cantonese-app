import { cn } from "../lib/cn.js";
import { useLocale } from "../store/localeStore.js";
import { normalizePopularityLevel, popularityLevelTextClass } from "../lib/wordPopularity.js";

/**
 * Chip "Độ phổ biến: <mức>" ở trang chi tiết từ — DÙNG CHUNG cho cả 3 chỗ hiển thị
 * (cột Cantonese / cột Mandarin / từ chưa có jyutping).
 *
 * ⚠️ 2026-09-20: màu CHỮ đổi theo cấp để dễ nhìn (token `text-pop-1..5` trong globals.css):
 *   1 Hiếm (đỏ) → 2 Thấp (cam) → 3 Trung bình (vàng) → 4 Cao (lime) → 5 Rất cao (xanh lá).
 *   Chưa đánh giá → màu muted như cũ.
 */
export function PopularityChip({ level, className }) {
    const { t } = useLocale();
    const n = normalizePopularityLevel(level);
    const label = n ? t.wordPopularity.levels[n - 1] : t.wordPopularity.unset;
    const colorClass = popularityLevelTextClass(n);

    return (
        <span
            className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-sm font-medium",
                colorClass ?? "text-muted-foreground",
                className,
            )}
        >
            {t.wordPopularity.title}: {label}
        </span>
    );
}
