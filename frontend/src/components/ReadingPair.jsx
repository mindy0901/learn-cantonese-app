import { cn } from "../lib/cn.js";

/**
 * Renders a `left | right` reading pair (e.g. pinyin | jyutping) using a
 * `1fr_auto_1fr` grid so the "|" separator is ALWAYS centered between the two
 * columns, regardless of how long each side is.
 *
 * Usage:
 *   <ReadingPair
 *     left={word.pinyin}
 *     right={word.jyutping}
 *     leftClass="text-pinyin"
 *     rightClass="text-jyutping"
 *     fallbackClass="italic text-muted-foreground"
 *   />
 *
 * Left/right labels are both required to show the "|"; if only one side has a
 * value it renders centered on its own without the separator.
 */
export function ReadingPair({
    left,
    right,
    leftClass,
    rightClass,
    containerClass,
    fallback = "-",
    fallbackClass = "italic text-muted-foreground",
}) {
    const hasLeft = left !== undefined && left !== null && left !== "";
    const hasRight = right !== undefined && right !== null && right !== "";
    if (!hasLeft && !hasRight) return null;

    return (
        <div className={cn("grid grid-cols-[1fr_auto_1fr] items-center gap-2 w-full max-w-md mx-auto", containerClass)}>
            <span className={cn("text-right min-w-0 whitespace-nowrap", leftClass)}>
                {hasLeft ? left : <span className={fallbackClass}>{fallback}</span>}
            </span>
            <span aria-hidden="true" className="w-px h-6 self-center bg-foreground/50" />
            <span className={cn("text-left min-w-0 whitespace-nowrap", rightClass)}>
                {hasRight ? right : <span className={fallbackClass}>{fallback}</span>}
            </span>
        </div>
    );
}
