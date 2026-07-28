import { cn } from "../../lib/cn.js";

/** @typedef {'primary' | 'outline' | 'ghost' | 'success' | 'danger' | 'warning' | 'google'} ButtonVariant */
/** @typedef {'sm' | 'md' | 'lg' | 'icon'} ButtonSize */

const base = cn(
    "box-border m-0 shrink-0 rounded-lg border bg-surface",
    "inline-flex items-center justify-center",
    "gap-1.5 font-medium leading-normal no-underline whitespace-nowrap shadow-sm",
    "border-transparent",
    "transition-[color,background-color,border-color,box-shadow,transform] duration-150",
    "active:enabled:scale-[0.97]",
    "focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
    "disabled:cursor-not-allowed",
);

/** Standard button heights — use Button component; md is the app default. */
export const buttonSizes = {
    sm: "h-9 min-h-9 px-4 text-sm",
    md: "h-10 min-h-10 px-5 text-sm",
    lg: "h-11 min-h-11 px-7 text-base rounded-[0.625rem]",
    icon: "size-10 min-h-10 min-w-10 shrink-0 p-0 gap-0 text-[1.25rem] leading-none",
};

const variants = {
    primary:
        "bg-accent text-white border-accent hover:enabled:bg-accent-hover hover:enabled:border-accent-hover disabled:opacity-50 disabled:shadow-none",
    outline: "bg-surface text-accent border-accent-border hover:enabled:bg-accent-bg hover:enabled:border-accent",
    ghost: "bg-surface text-text-h border-border hover:enabled:bg-bg hover:enabled:border-text-muted",
    success:
        "bg-success-bg text-success-text border-success-border hover:enabled:bg-success-bg hover:enabled:border-success-text",
    danger: "bg-red-50 text-red-700 border-red-200 hover:enabled:bg-red-100 hover:enabled:border-red-300 disabled:opacity-50 disabled:shadow-none dark:bg-red-950 dark:text-red-300 dark:border-red-800 dark:hover:enabled:bg-red-900 dark:hover:enabled:border-red-700",
    warning:
        "bg-amber-500 text-white border-amber-600 hover:enabled:bg-amber-600 disabled:opacity-50 disabled:shadow-none",
    google: "gap-2.5 bg-white text-[#1f1f1f] border-[#747775] shadow-none font-medium tracking-wide hover:enabled:bg-[#f7f8f8] hover:enabled:border-[#747775] hover:enabled:shadow-[0_1px_2px_rgb(60_64_67/30%)] dark:bg-surface dark:text-text-h dark:border-border",
};

/**
 * @param {ButtonVariant} variant
 * @param {ButtonSize} [size='md']
 * @param {string} [className]
 */
export function btnClass(variant, size = "md", className) {
    return cn(base, buttonSizes[size], variants[variant], className);
}

/** @param {'sm' | 'md'} [size] */
export function spinnerClass(size = "md") {
    return cn(
        "inline-block animate-spin rounded-full border-2 border-current border-r-transparent shrink-0",
        size === "sm" ? "size-3" : "size-3.5",
    );
}
