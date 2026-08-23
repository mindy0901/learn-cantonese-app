import { useState } from "react";
import { cn } from "../lib/cn.js";
import { Button } from "./shadcn/button.jsx";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "./shadcn/collapsible.jsx";
import { ChevronDown } from "lucide-react";

/**
 * Collapsible chung cho danh sách ví dụ — dùng chung ở trang detail (WordDetailContent)
 * và trang edit (WordEditFields), đảm bảo hành vi & style nhất quán.
 *
 * - Mặc định gấp gọn; truyền `defaultOpen` hoặc điều khiển qua `open`/`onOpenChange` để mở sẵn.
 * - `label`: tiêu đề cạnh chevron (VD "Ví dụ (8)").
 * - Chevron xoay theo trạng thái: đóng → chỉ phải, mở → chỉ xuống.
 */
export function MeaningExamples({ label, children, defaultOpen = false, open: openProp, onOpenChange, headerExtra }) {
    const [internalOpen, setInternalOpen] = useState(defaultOpen);
    const isControlled = openProp !== undefined;
    const open = isControlled ? openProp : internalOpen;
    const setOpen = (next) => (isControlled ? onOpenChange?.(next) : setInternalOpen(next));

    return (
        <Collapsible open={open} onOpenChange={setOpen} className="flex w-full flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
                <CollapsibleTrigger
                    render={
                        <Button
                            type="button"
                            variant="ghost"
                            className="h-auto w-fit gap-1 px-0 py-0 bg-transparent hover:bg-transparent dark:hover:bg-transparent aria-expanded:bg-transparent dark:aria-expanded:bg-transparent"
                        />
                    }
                    aria-label="Toggle details"
                >
                    {/* Title ví dụ: luôn muted (2026-08-22) */}
                    <h4 className="text-sm font-semibold text-muted-foreground">{label}</h4>
                    <ChevronDown
                        className={cn("text-muted-foreground transition-transform", open ? "" : "-rotate-90")}
                    />
                    <span className="sr-only">Toggle details</span>
                </CollapsibleTrigger>
                {/* Các control bổ sung trong header (VD select-all examples của meaning — 2026-08-22) */}
                {headerExtra}
            </div>
            <CollapsibleContent>
                <div className="flex flex-col gap-2">{children}</div>
            </CollapsibleContent>
        </Collapsible>
    );
}
