import { cn } from "../lib/cn.js";
import { useLocale } from "../store/localeStore.js";

/** Badge YSK — đánh dấu từ THUẦN CANTONESE (không có âm Mandarin thật).
 *  Màu cyan (giữ design cũ 2026-08-16). Tooltip = tên đầy đủ. */
export function YskBadge({ className }) {
    const { t } = useLocale();
    return (
        <span
            title={t.wordBank.pureCantoneseBadgeTitle}
            className={cn(
                "inline-flex shrink-0 items-center justify-center rounded-full border px-4 py-2 text-sm font-semibold leading-none text-cyan-700",
                "border-cyan-200 bg-cyan-50 dark:border-cyan-800 dark:bg-cyan-950 dark:text-cyan-300",
                className,
            )}
        >
            {t.wordBank.pureCantoneseBadge}
        </span>
    );
}
