import { cn } from "../lib/cn.js";
import { Spinner } from "./shadcn/spinner.jsx";

export function BtnSpinner({ size } = {}) {
    const sizeClass = size === "sm" ? "size-3" : "size-4";
    return <Spinner className={sizeClass} aria-hidden="true" />;
}

export function LoadingButton({ loading = false, loadingText, children, className, disabled, ...props }) {
    return (
        <button
            type="button"
            className={cn(className, loading && "cursor-wait")}
            disabled={disabled || loading}
            aria-busy={loading || undefined}
            {...props}
        >
            {loading ? (
                <>
                    <BtnSpinner />
                    {loadingText ?? children}
                </>
            ) : (
                children
            )}
        </button>
    );
}
