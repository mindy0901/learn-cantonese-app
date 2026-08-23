import { useState } from "react";
import { cn } from "../lib/cn.js";
import { Button } from "./shadcn/button.jsx";
import { Badge } from "./shadcn/badge.jsx";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "./shadcn/collapsible.jsx";
import { ChevronDown } from "lucide-react";

/**
 * Collapsible group chung cho meanings — dùng ở cả detail (WordDetailContent) và edit (WordEditFields).
 *
 * Header: `[badge roman] [title] (count) [chevron] [actions]`
 * - `title`: ReactNode — span (detail) hoặc Input (edit).
 * - `actions`: ReactNode phải — nút Xóa nhóm (edit) hoặc undefined (detail).
 * - `titleAsTrigger`: `true` = cả header là trigger để gấp/mở (detail, title tĩnh);
 *   `false` = chỉ chevron là trigger (edit, title là Input cần bấm để sửa).
 * - Nội dung indent `pl-5 pt-2.5` (khớp detail).
 */
export function MeaningGroup({
    romanLabel,
    category,
    titleElement,
    count,
    children,
    actions,
    titleAsTrigger = true,
    className,
    romanWidth,
}) {
    const [open, setOpen] = useState(true);
    const title = titleElement ?? <span className="text-xl font-semibold text-foreground">{category}</span>;
    const romanBadge = (
        <Badge variant="outline" className="shrink-0 rounded-md px-1.5 text-lg text-viet">
            {romanLabel}
        </Badge>
    );
    const headerBits = (
        <>
            {romanWidth ? (
                // Counter nhóm nằm trên line (giống Hanzii — 2026-08-22): cell width cố định, bg che line.
                <div className={`relative z-10 flex ${romanWidth} items-center justify-center rounded-md bg-card`}>
                    {romanBadge}
                </div>
            ) : (
                romanBadge
            )}
            {title}
            <span className="shrink-0 text-xl text-foreground">({count})</span>
        </>
    );
    return (
        <Collapsible open={open} onOpenChange={setOpen} className={cn("flex flex-col", className)}>
            <div className={cn("flex items-center justify-between gap-2", !titleAsTrigger && "px-3 pt-2.5")}>
                {titleAsTrigger ? (
                    <CollapsibleTrigger
                        render={
                            <Button
                                type="button"
                                variant="ghost"
                                className="h-auto w-fit gap-1 px-0 py-0 text-lg bg-transparent hover:bg-transparent dark:hover:bg-transparent aria-expanded:bg-transparent dark:aria-expanded:bg-transparent"
                            />
                        }
                        aria-label="Toggle details"
                    >
                        {headerBits}
                        <ChevronDown
                            className={cn("transition-transform text-foreground size-5", open ? "" : "-rotate-90")}
                        />
                    </CollapsibleTrigger>
                ) : (
                    <>
                        <div className="flex min-w-0 items-center gap-2 text-lg">
                            {headerBits}
                            <CollapsibleTrigger
                                render={
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="rounded-full text-foreground bg-transparent hover:bg-transparent dark:hover:bg-transparent aria-expanded:bg-transparent dark:aria-expanded:bg-transparent"
                                    />
                                }
                                aria-label="Toggle details"
                            >
                                <ChevronDown className={cn("transition-transform size-5", open ? "" : "-rotate-90")} />
                            </CollapsibleTrigger>
                        </div>
                        {actions}
                    </>
                )}
            </div>
            <CollapsibleContent className={cn("flex flex-col gap-4 pl-5 pt-2.5", !titleAsTrigger && "pr-3 pb-3")}>
                {children}
            </CollapsibleContent>
        </Collapsible>
    );
}
