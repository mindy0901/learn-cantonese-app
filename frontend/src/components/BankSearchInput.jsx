import { memo, useCallback, useRef, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "../lib/cn.js";
import { Input } from "./shadcn/input.jsx";

export const BankSearchInput = memo(function BankSearchInput({
    id,
    onSearch,
    onChange,
    placeholder,
    className,
    initialValue = "",
    autoFocus = false,
}) {
    const [value, setValue] = useState(initialValue);
    const inputRef = useRef(null);

    const handleChange = useCallback(
        (e) => {
            const v = e.target.value;
            setValue(v);
            onChange?.(v);
        },
        [onChange],
    );

    const triggerSearch = useCallback(() => {
        onSearch?.(value.trim());
    }, [onSearch, value]);

    const handleKeyDown = useCallback(
        (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                triggerSearch();
            }
        },
        [triggerSearch],
    );

    return (
        <div className={cn("relative w-full min-w-0 shrink-0", className)}>
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
                ref={inputRef}
                id={id}
                type="search"
                className="pl-8"
                placeholder={placeholder}
                value={value}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                autoComplete="off"
                autoFocus={autoFocus}
            />
        </div>
    );
});
