import { cn } from "../../lib/cn.js";

const skeletonBase = cn(
    "animate-pulse rounded-md bg-border/60",
    "dark:bg-border/40",
);

/** Một dòng skeleton đơn */
export function SkeletonLine({ className, width = "100%" }) {
    return (
        <div
            className={cn(skeletonBase, "h-4", className)}
            style={{ width }}
        />
    );
}

/** Một khối skeleton (block) */
export function SkeletonBlock({ className, height = "6rem" }) {
    return (
        <div
            className={cn(skeletonBase, className)}
            style={{ height }}
        />
    );
}

/** Skeleton cho table — hiển thị N dòng */
export function SkeletonTable({ rows = 8, className }) {
    return (
        <div className={cn("flex flex-col gap-2", className)}>
            {/* Header */}
            <div className="flex gap-4 px-5 py-3">
                <SkeletonLine width="5%" />
                <SkeletonLine width="15%" />
                <SkeletonLine width="20%" />
                <SkeletonLine width="20%" />
                <SkeletonLine width="12%" />
                <SkeletonLine width="28%" />
            </div>
            {/* Rows */}
            {Array.from({ length: rows }, (_, i) => (
                <div key={i} className="flex gap-4 px-5 py-2.5 border-t border-border/40">
                    <SkeletonLine width="5%" />
                    <SkeletonLine width="15%" />
                    <SkeletonLine width="20%" />
                    <SkeletonLine width="20%" />
                    <SkeletonLine width="12%" />
                    <SkeletonLine width="28%" />
                </div>
            ))}
        </div>
    );
}

/** Skeleton cho card list — hiển thị N card */
export function SkeletonCardList({ cards = 4, className }) {
    return (
        <div className={cn("flex flex-col gap-3", className)}>
            {Array.from({ length: cards }, (_, i) => (
                <div key={i} className="rounded-lg border border-border/60 bg-card p-5 flex flex-col gap-3">
                    <SkeletonLine width="60%" className="h-5" />
                    <SkeletonLine width="40%" />
                    <div className="flex gap-2 mt-1">
                        <SkeletonBlock height="2rem" className="w-20 rounded-full" />
                        <SkeletonBlock height="2rem" className="w-16 rounded-full" />
                    </div>
                </div>
            ))}
        </div>
    );
}

/** Skeleton cho stats panel — grid các khối */
export function SkeletonStats({ stats = 4, className }) {
    return (
        <div className={cn("grid grid-cols-2 sm:grid-cols-4 gap-3", className)}>
            {Array.from({ length: stats }, (_, i) => (
                <div key={i} className="rounded-xl border border-border/60 bg-card p-4 flex flex-col gap-2">
                    <SkeletonLine width="40%" className="h-3" />
                    <SkeletonLine width="70%" className="h-7" />
                </div>
            ))}
        </div>
    );
}
