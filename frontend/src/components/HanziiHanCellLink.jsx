import { useLocale } from "../store/localeStore.js";
import { hanziiWordUrl } from "../lib/hanzii.js";
import { hanPopularityClass } from "../lib/wordPopularity.js";
import { cn } from "../lib/cn.js";

const baseClass = "inline leading-tight align-middle whitespace-nowrap";

const emphasisClasses = {
    primary: (popularity) => {
        const popClass = hanPopularityClass(popularity);
        return cn("font-semibold", popClass || "text-han");
    },
    secondary: (popularity) => {
        const popClass = hanPopularityClass(popularity);
        return cn("font-medium", popClass || "text-han/50");
    },
};

const popularityHover =
    "[&.han-popularity--lvl-0]:hover:text-inherit [&.han-popularity--lvl-0]:hover:brightness-110 [&.han-popularity--lvl-0]:hover:bg-[color-mix(in_srgb,currentColor_14%,transparent)] [&.han-popularity--lvl-1]:hover:text-inherit [&.han-popularity--lvl-1]:hover:brightness-110 [&.han-popularity--lvl-1]:hover:bg-[color-mix(in_srgb,currentColor_14%,transparent)] [&.han-popularity--lvl-2]:hover:text-inherit [&.han-popularity--lvl-2]:hover:brightness-110 [&.han-popularity--lvl-2]:hover:bg-[color-mix(in_srgb,currentColor_14%,transparent)] [&.han-popularity--lvl-3]:hover:text-inherit [&.han-popularity--lvl-3]:hover:brightness-110 [&.han-popularity--lvl-3]:hover:bg-[color-mix(in_srgb,currentColor_14%,transparent)]";

const linkHoverPrimary = cn("hover:text-accent hover:bg-accent/10", popularityHover);

const linkHoverSecondary = cn(
    "cursor-pointer hover:bg-accent/8",
    popularityHover,
    "hover:text-han/75 [&.han-popularity--lvl-0]:hover:text-inherit [&.han-popularity--lvl-1]:hover:text-inherit [&.han-popularity--lvl-2]:hover:text-inherit [&.han-popularity--lvl-3]:hover:text-inherit",
);

const linkClass =
    "no-underline rounded transition-[color,background-color,filter] duration-150 focus:outline-2 focus:outline-accent focus:outline-offset-2";

export function HanziiHanCellLink({
    hanTraditional,
    displayText,
    popularity,
    emphasis = "primary",
    className,
    children,
}) {
    const { locale, t, fmt } = useLocale();
    const lookup = String(hanTraditional ?? "").trim();
    const text = String(displayText ?? hanTraditional ?? "").trim();
    const url = hanziiWordUrl(lookup, locale);
    const toneClass = emphasisClasses[emphasis]?.(popularity) ?? emphasisClasses.primary(popularity);

    if (!text && !children) return "—";

    const label = fmt(t.wordDetail.openHanzii, { hanTraditional: lookup || text });

    if (!url) {
        return <span className={cn(baseClass, toneClass, className)}>{children || text}</span>;
    }

    return (
        <a
            href={url}
            className={cn(
                baseClass,
                toneClass,
                linkClass,
                "hover:opacity-80 transition-opacity duration-150",
                className,
            )}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title={label}
            aria-label={label}
        >
            {children || text}
        </a>
    );
}
