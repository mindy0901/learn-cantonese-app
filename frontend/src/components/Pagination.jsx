import { cn } from "../lib/cn.js";
import { Button } from "./shadcn/button.jsx";
import { useLocale } from "../store/localeStore.js";
import { getPaginationRange } from "../lib/pagination.js";

export function Pagination({
    page,
    totalPages,
    total,
    startIndex,
    pageSize,
    onPageChange,
    reserveSpace = false,
    compact = false,
}) {
    const { t, fmt } = useLocale();

    if (totalPages <= 1 && !reserveSpace) return null;

    if (totalPages <= 1) {
        return <div className="invisible pointer-events-none mt-3 py-2" aria-hidden="true" />;
    }

    const from = total === 0 ? 0 : startIndex + 1;
    const to = Math.min(startIndex + pageSize, total);
    const pageNumbers = getPaginationRange(page, totalPages, compact ? 0 : 1);

    return (
        <nav className="mt-3 flex flex-wrap items-center justify-between gap-3 py-2" aria-label={t.pagination.label}>
            <p className="m-0 text-[0.8125rem] text-muted-foreground">
                {fmt(t.pagination.showing, { from, to, total })}
            </p>
            <div className="flex flex-wrap items-center justify-end gap-1.5">
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => onPageChange(page - 1)}
                >
                    {t.pagination.prev}
                </Button>
                <div
                    className="flex items-center gap-1"
                    role="group"
                    aria-label={fmt(t.pagination.pageOf, { page, totalPages })}
                >
                    {pageNumbers.map((item, index) =>
                        item === "ellipsis" ? (
                            <span
                                key={`ellipsis-${index}`}
                                className="px-0.5 text-[0.8125rem] leading-none text-muted-foreground select-none"
                                aria-hidden="true"
                            >
                                …
                            </span>
                        ) : (
                            <Button
                                key={item}
                                type="button"
                                variant="ghost"
                                size="sm"
                                className={cn(
                                    "min-w-9 px-3 tabular-nums",
                                    item === page && "bg-primary text-primary-foreground hover:bg-primary",
                                )}
                                aria-label={fmt(t.pagination.goToPage, { page: item })}
                                aria-current={item === page ? "page" : undefined}
                                disabled={item === page}
                                onClick={() => onPageChange(item)}
                            >
                                {item}
                            </Button>
                        ),
                    )}
                </div>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => onPageChange(page + 1)}
                >
                    {t.pagination.next}
                </Button>
            </div>
        </nav>
    );
}
