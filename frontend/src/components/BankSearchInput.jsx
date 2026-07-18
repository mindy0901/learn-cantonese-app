import { memo, useCallback, useRef, useState } from "react";
import { cn } from "../lib/cn.js";
import { bankSearchInputClass } from "./ui/bankToolbarStyles.js";

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
        <div className={cn(bankSearchInputClass, "flex items-center gap-2", className)}>
            <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0 text-text-muted"
                aria-hidden="true"
            >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
                ref={inputRef}
                id={id}
                type="search"
                className="flex-1 min-w-0 border-0 bg-transparent p-0 text-sm leading-5 text-text-h outline-none placeholder:text-text-muted"
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
