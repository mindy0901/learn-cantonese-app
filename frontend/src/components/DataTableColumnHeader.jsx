import { ArrowDown, ArrowUp, Check, ChevronsUpDown, EyeOff } from "lucide-react";
import { Fragment } from "react";
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
 *
 * `altSorts` (tuỳ chọn): thêm nhóm sort PHỤ trên cột khác — mỗi item:
 * `{ id, label, ascLabel, descLabel, sorted, onSort(desc) }`
 * (vd cột "Chữ Hán" cho phép sort theo SỐ LƯỢNG hán tự qua cột ẩn `hanLen`).
 */
export function DataTableColumnHeader({ column, title, className, centered, altSorts }) {
    const { t } = useLocale();

    if (!column.getCanSort()) {
        return <div className={cn("whitespace-nowrap", centered && "text-center", className)}>{title}</div>;
    }

    // Cột có sort PHỤ đang bật (vd "Chữ Hán" → Số chữ Hán) → hiện mũi tên theo sort phụ.
    const sorted = column.getIsSorted() || altSorts?.find((alt) => alt.sorted)?.sorted || false;

    return (
        <div className={cn("flex items-center whitespace-nowrap", centered && "justify-center", className)}>
            <DropdownMenu>
                <DropdownMenuTrigger
                    render={
                        <Button
                            variant="ghost"
                            size="sm"
                            className={cn("h-8 data-[state=open]:bg-accent", !centered && "-ml-2")}
                        />
                    }
                >
                    <span>{title}</span>
                    {sorted === "desc" ? (
                        <ArrowDown className="ml-1 size-3.5" aria-hidden="true" />
                    ) : sorted === "asc" ? (
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
                        {altSorts?.map((alt) => (
                            <Fragment key={alt.id}>
                                <DropdownMenuSeparator />
                                <DropdownMenuLabel>{alt.label}</DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => alt.onSort(false)}>
                                    <ArrowUp className="size-3.5 text-muted-foreground/70" aria-hidden="true" />
                                    {alt.ascLabel}
                                    {alt.sorted === "asc" && <Check className="ml-auto size-3.5" aria-hidden="true" />}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => alt.onSort(true)}>
                                    <ArrowDown className="size-3.5 text-muted-foreground/70" aria-hidden="true" />
                                    {alt.descLabel}
                                    {alt.sorted === "desc" && <Check className="ml-auto size-3.5" aria-hidden="true" />}
                                </DropdownMenuItem>
                            </Fragment>
                        ))}
                    </DropdownMenuGroup>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
