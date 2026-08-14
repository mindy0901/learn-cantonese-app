import { PlusCircle } from "lucide-react";
import { useLocale } from "../store/localeStore.js";
import { cn } from "../lib/cn.js";
import { Button } from "./shadcn/button.jsx";
import { Badge } from "./shadcn/badge.jsx";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "./shadcn/dropdown-menu.jsx";

/**
 * Faceted filter kiểu shadcn data-table (DataTableFacetedFilter).
 * Column filter value = mảng các giá trị được chọn; column phải có filterFn
 * kiểu multi (kiểm tra membership). Reset → setFilterValue(undefined).
 */
export function DataTableFacetedFilter({ column, title, options, className }) {
    const { t } = useLocale();
    const selectedValues = new Set(column?.getFilterValue?.());
    const facets = column?.getFacetedUniqueValues?.();

    return (
        <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" className={cn("h-7", className)} />}>
                <PlusCircle className="size-3.5" aria-hidden="true" />
                {title}
                {selectedValues?.size > 0 && (
                    <Badge variant="secondary" className="rounded-full px-1.5">
                        {selectedValues.size}
                    </Badge>
                )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-44">
                {options.length > 0 && (
                    <>
                        {options.map((option) => {
                            const isSelected = selectedValues.has(option.value);
                            const count = facets?.get(option.value);
                            return (
                                <DropdownMenuCheckboxItem
                                    key={option.value}
                                    checked={isSelected}
                                    onCheckedChange={(checked) => {
                                        if (checked) selectedValues.add(option.value);
                                        else selectedValues.delete(option.value);
                                        const filterValues = Array.from(selectedValues);
                                        column?.setFilterValue(filterValues.length ? filterValues : undefined);
                                    }}
                                >
                                    {option.icon}
                                    {option.dot && (
                                        <span
                                            className="size-2 rounded-full shrink-0"
                                            style={{ background: option.dot }}
                                            aria-hidden="true"
                                        />
                                    )}
                                    {option.label}
                                    {count !== undefined && (
                                        <span className="ml-auto text-muted-foreground tabular-nums">{count}</span>
                                    )}
                                </DropdownMenuCheckboxItem>
                            );
                        })}
                        <DropdownMenuSeparator />
                    </>
                )}
                <DropdownMenuItem
                    className="justify-center text-center"
                    disabled={selectedValues?.size === 0}
                    onClick={() => column?.setFilterValue(undefined)}
                >
                    {t.common.clear}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
