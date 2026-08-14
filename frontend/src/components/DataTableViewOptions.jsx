import { SlidersHorizontal } from "lucide-react";
import { useLocale } from "../store/localeStore.js";
import { Button } from "./shadcn/button.jsx";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "./shadcn/dropdown-menu.jsx";

/**
 * Column toggle (Reusable Components — Column toggle của shadcn data-table).
 * Ẩn/hiện cột; bỏ qua các cột helper (meta.hidden: true).
 */
export function DataTableViewOptions({ table }) {
    const { t } = useLocale();
    const columns = table.getAllColumns().filter((column) => column.getCanHide() && !column.columnDef.meta?.hidden);

    if (columns.length === 0) return null;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="min-w-28" />}>
                <SlidersHorizontal className="size-3.5" aria-hidden="true" />
                {t.wordBank.columns}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                    <DropdownMenuLabel>{t.wordBank.columns}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {columns.map((column) => (
                        <DropdownMenuCheckboxItem
                            key={column.id}
                            checked={column.getIsVisible()}
                            onCheckedChange={(value) => column.toggleVisibility(!!value)}
                        >
                            {column.columnDef.meta?.label ?? column.id}
                        </DropdownMenuCheckboxItem>
                    ))}
                </DropdownMenuGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
