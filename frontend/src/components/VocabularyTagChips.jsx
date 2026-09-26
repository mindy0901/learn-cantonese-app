import { tagColor, tagChipStyle } from "../lib/tagColors.js";

/**
 * Chip các TAG đã gắn cho từ (2026-09-27) — hiển thị cùng hàng với chip "Độ phổ biến".
 * Màu mỗi tag = random ổn định theo id tag (`tagColor`).
 */
export function VocabularyTagChips({ tags, className }) {
    if (!Array.isArray(tags) || tags.length === 0) return null;
    return (
        <>
            {tags.map((tag) => (
                <span
                    key={tag.id}
                    className={
                        "inline-flex h-9 items-center rounded-full border px-3 text-sm font-medium " + (className ?? "")
                    }
                    style={tagChipStyle(tagColor(tag))}
                    title={tag.name}
                >
                    {tag.name}
                </span>
            ))}
        </>
    );
}
