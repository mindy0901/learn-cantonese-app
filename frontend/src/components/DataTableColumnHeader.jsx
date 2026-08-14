import { ArrowDown, ArrowUp, ChevronsUpDown, EyeOff } from "lucide-react";
import { useLocale } from "../store/localeStore.js";
import { cn } from "../lib/cn.js";
import { Button } from "./shadcn/button.jsx";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "./shadcn/dropdown-menu.jsx";

/**
 * Header cột có thể sort + ẩn (Reusable Components — Column header của shadcn
 * data-table). Click → dropdown: Sắp xếp tăng/giảm, Ẩn cột.
 */
export function DataTableColumnHeader({ column, title, className }) {
    const { t } = useLocale();

    if (!column.getCanSort()) {
        return <div className={cn("whitespace-nowrap", className)}>{title}</div>;
    }

    return (
        <div className={cn("flex items-center whitespace-nowrap", className)}>
            <DropdownMenu>
                <DropdownMenuTrigger
                    render={<Button variant="ghost" size="sm" className="-ml-2 h-8 data-[state=open]:bg-accent" />}
                >
                    <span>{title}</span>
                    {column.getIsSorted() === "desc" ? (
                        <ArrowDown className="ml-1 size-3.5" aria-hidden="true" />
                    ) : column.getIsSorted() === "asc" ? (
                        <ArrowUp className="ml-1 size-3.5" aria-hidden="true" />
                    ) : (
                        <ChevronsUpDown className="ml-1 size-3.5 text-muted-foreground/50" aria-hidden="true" />
                    )}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                    <DropdownMenuGroup>
                        <DropdownMenuLabel>{t.sort.sortBy}</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => column.toggleSorting(false)}>
                            <ArrowUp className="size-3.5 text-muted-foreground/70" aria-hidden="true" />
                            {t.sort.asc}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => column.toggleSorting(true)}>
                            <ArrowDown className="size-3.5 text-muted-foreground/70" aria-hidden="true" />
                            {t.sort.desc}
                        </DropdownMenuItem>
                        {column.getCanHide() && (
                            <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => column.toggleVisibility(false)}>
                                    <EyeOff className="size-3.5 text-muted-foreground/70" aria-hidden="true" />
                                    {t.sort.hide}
                                </DropdownMenuItem>
                            </>
                        )}
                    </DropdownMenuGroup>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
