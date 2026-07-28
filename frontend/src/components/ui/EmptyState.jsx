import { cn } from "../../lib/cn.js";

const iconWrapperClass =
    "flex items-center justify-center size-16 rounded-2xl bg-accent-bg text-accent mb-2";

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
                "flex flex-col items-center justify-center text-center py-14 px-6",
                className,
            )}
        >
            {icon && <div className={iconWrapperClass}>{icon}</div>}
            <h3 className="text-base font-semibold text-text-h mt-2 mb-1">{title}</h3>
            {description && (
                <p className="text-sm text-text-muted max-w-sm mb-4">{description}</p>
            )}
            {action && <div className="mt-1">{action}</div>}
        </div>
    );
}
