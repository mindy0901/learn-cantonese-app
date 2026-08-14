import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useLocale } from "../store/localeStore.js";
import { cn } from "../lib/cn.js";
import { Button } from "./shadcn/button.jsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./shadcn/select.jsx";

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];

/**
 * Pagination kiểu shadcn data-table: số dòng mỗi trang + điều hướng trang.
 * Hoàn toàn dùng API native của TanStack (firstPage/previousPage/nextPage/lastPage).
 */
export function DataTablePagination({ table, showSelection = true, className }) {
    const { t, fmt } = useLocale();
    const pageSize = table.state.pagination.pageSize;

    return (
        <div className={cn("flex flex-wrap items-center justify-between gap-2 px-2", className)}>
            <div className="flex-1 text-sm text-muted-foreground">
                {showSelection &&
                    fmt(t.pagination.selectedCount, {
                        selected: table.getFilteredSelectedRowModel().rows.length,
                        total: table.getFilteredRowModel().rows.length,
                    })}
            </div>
            <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{t.pagination.rowsPerPage}</p>
                    <Select value={String(pageSize)} onValueChange={(value) => table.setPageSize(Number(value))}>
                        <SelectTrigger aria-label={t.pagination.rowsPerPage} className="h-8 w-16">
                            <SelectValue>{pageSize}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            {PAGE_SIZE_OPTIONS.map((size) => (
                                <SelectItem key={size} value={String(size)}>
                                    {size}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="text-sm font-medium">
                    {fmt(t.pagination.pageOf, {
                        page: table.state.pagination.pageIndex + 1,
                        totalPages: table.getPageCount(),
                    })}
                </div>
                <div className="flex items-center gap-1">
                    <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => table.firstPage()}
                        disabled={!table.getCanPreviousPage()}
                        aria-label={t.pagination.first}
                    >
                        <ChevronsLeft className="size-4" aria-hidden="true" />
                    </Button>
                    <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => table.previousPage()}
                        disabled={!table.getCanPreviousPage()}
                        aria-label={t.pagination.prev}
                    >
                        <ChevronLeft className="size-4" aria-hidden="true" />
                    </Button>
                    <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => table.nextPage()}
                        disabled={!table.getCanNextPage()}
                        aria-label={t.pagination.next}
                    >
                        <ChevronRight className="size-4" aria-hidden="true" />
                    </Button>
                    <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => table.lastPage()}
                        disabled={!table.getCanNextPage()}
                        aria-label={t.pagination.last}
                    >
                        <ChevronsRight className="size-4" aria-hidden="true" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
