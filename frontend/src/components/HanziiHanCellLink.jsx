import { useLocale } from "../store/localeStore.js";
import { hanziiWordUrl } from "../lib/hanzii.js";
import { cn } from "../lib/cn.js";

const baseClass = "inline leading-tight align-middle whitespace-nowrap";

const emphasisClasses = {
    primary: cn("font-semibold", "text-han-trad"),
    secondary: cn("font-medium", "text-han-simp"),
};

const linkClass =
    "no-underline rounded transition-[color,background-color,filter] duration-150 focus:outline-2 focus:outline-accent focus:outline-offset-2";

export function HanziiHanCellLink({ hanTraditional, displayText, emphasis = "primary", className, children }) {
    const { locale, t, fmt } = useLocale();
    const lookup = String(hanTraditional ?? "").trim();
    const text = String(displayText ?? hanTraditional ?? "").trim();
    const url = hanziiWordUrl(lookup, locale);
    const toneClass = emphasisClasses[emphasis] ?? emphasisClasses.primary;

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
