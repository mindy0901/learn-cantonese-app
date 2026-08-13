import { cn } from "../../lib/cn.js";

const iconWrapperClass = "flex items-center justify-center size-16 rounded-2xl bg-primary/10 text-primary mb-2";

/**
 * EmptyState — hiển thị khi không có dữ liệu.
 * @param {object} props
 * @param {React.ReactNode} props.icon - SVG icon component
 * @param {string} props.title - Tiêu đề chính
 * @param {string} [props.description] - Mô tả phụ
 * @param {React.ReactNode} [props.action] - Nút hành động (thường là Link hoặc button)
 * @param {string} [props.className]
 */
export function EmptyState({ icon, title, description, action, className }) {
    return (
        <div
            className={cn(
                "flex w-full flex-col items-center justify-center text-center rounded-2xl border-2 border-dashed border-border/70 bg-card px-6 py-20",
                "bg-[repeating-linear-gradient(45deg,transparent,transparent_14px,rgba(148,163,184,0.14)_14px,rgba(148,163,184,0.14)_28px)]",
                className,
            )}
        >
            {icon && <div className={iconWrapperClass}>{icon}</div>}
            <h3 className="text-base font-semibold text-foreground mt-2 mb-1">{title}</h3>
            {description && <p className="text-sm text-muted-foreground max-w-sm mb-4">{description}</p>}
            {action && <div className="mt-1">{action}</div>}
        </div>
    );
}
