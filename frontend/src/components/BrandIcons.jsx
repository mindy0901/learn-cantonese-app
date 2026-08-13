import { cn } from "../lib/cn.js";

/** Hanzii — logo gấu trúc chính thức. */
export function HanziiIcon({ className }) {
    return (
        <img
            src="/brand/hanzii-logo.webp"
            alt="Hanzii"
            width={20}
            height={20}
            className={cn("block size-5 shrink-0 rounded-sm select-none", className)}
        />
    );
}

/** JyutDict — icon đỏ chính thức. */
export function JyutDictIcon({ className }) {
    return (
        <img
            src="/brand/jyutdict-icon.svg"
            alt="JyutDict"
            width={20}
            height={20}
            className={cn("block size-5 shrink-0 rounded-sm select-none", className)}
        />
    );
}
