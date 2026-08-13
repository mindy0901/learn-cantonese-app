import { useRef, useCallback, useState } from "react";
import { cn } from "../lib/cn.js";
import { IconChevronDown } from "./NavIcons.jsx";

const tagChipClass =
    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border/60 bg-card text-sm font-medium focus:outline-none";

const tagChipSelectableClass =
    "inline-flex items-center gap-1 pl-2 pr-1.5 py-0.5 rounded-full border border-border/60 bg-card text-sm font-medium focus:outline-none";

const tagSelectClass =
    "rounded border border-transparent bg-transparent px-1.5 py-0 text-sm text-inherit outline-none focus:outline-none focus:ring-0 cursor-pointer appearance-none";

/** Inert text inside a tag chip — passes clicks through to parent */
const tagTextClass = "select-none pointer-events-none";

/**
 * TagInput — a chip-style multi-value input.
 * Press Enter to add, Backspace on empty to remove last, paste newlines for multiple.
 *
 * @param {string[][]} [tagOptions] — per-tag option arrays. When length > 1, tag shows a dropdown.
 * @param {number|null} [hoveredIndex] — which tag index is hovered (for cross-field highlighting).
 * @param {(idx: number) => void} [onRemoveTag] — fired when a tag is removed (so parent can sync).
 * @param {boolean} [allowEmpty] — keep empty-string tags as placeholder chips.
 */
export function TagInput({ value, onChange, className, placeholder, tagOptions, onRemoveTag, allowEmpty }) {
    const inputRef = useRef(null);
    const tags = value
        ? String(value)
              .split(/[,，/、]+/)
              .map((s) => s.trim())
              .filter((s) => allowEmpty || Boolean(s))
        : [];
    const editingRef = useRef(null);

    const addTag = useCallback(
        (tag) => {
            const t = tag.trim();
            if (!t) return;
            const next = [...tags, t].join(", ");
            onChange(next);
        },
        [tags, onChange],
    );

    const selectTagOption = useCallback(
        (idx, newVal) => {
            const next = tags.map((t, i) => (i === idx ? newVal : t)).join(", ");
            onChange(next);
        },
        [tags, onChange],
    );

    const removeTag = useCallback(
        (idx) => {
            const next = tags.filter((_, i) => i !== idx).join(", ");
            onChange(next);
            onRemoveTag?.(idx);
        },
        [tags, onChange, onRemoveTag],
    );

    const updateTag = useCallback(
        (idx, newVal) => {
            const next = tags.map((t, i) => (i === idx ? newVal.trim() : t)).join(", ");
            onChange(next);
        },
        [tags, onChange],
    );

    const handleKeyDown = useCallback(
        (e) => {
            const val = e.target.value.trim();
            if (editingRef.current != null) {
                if (e.key === "Enter") {
                    e.preventDefault();
                    updateTag(editingRef.current, val || "");
                    e.target.value = "";
                    editingRef.current = null;
                } else if (e.key === "Escape") {
                    e.target.value = "";
                    editingRef.current = null;
                }
                return;
            }
            if (e.key === "Enter" && val) {
                e.preventDefault();
                e.stopPropagation();
                addTag(val);
                e.target.value = "";
            } else if (e.key === "Backspace" && !val && tags.length > 0) {
                removeTag(tags.length - 1);
            }
        },
        [addTag, removeTag, tags, updateTag],
    );

    const handlePaste = useCallback(
        (e) => {
            const text = e.clipboardData?.getData("text") ?? "";
            if (text.includes("\n")) {
                e.preventDefault();
                const parts = text
                    .split(/\n+/)
                    .map((s) => s.trim())
                    .filter(Boolean);
                const next = [...tags, ...parts].join(", ");
                onChange(next);
            }
        },
        [tags, onChange],
    );

    const startEdit = useCallback(
        (i) => {
            editingRef.current = i;
            const inp = inputRef.current;
            if (inp) {
                inp.value = tags[i] ?? "";
                inp.focus();
            }
        },
        [tags],
    );

    return (
        <div
            className={`flex flex-wrap items-center gap-1.5 p-2 min-h-11 rounded-md border border-border bg-background focus-within:outline-none ${className ?? ""}`}
            onClick={() => inputRef.current?.focus()}
        >
            {tags.map((tag, i) => {
                const opts = tagOptions?.[i];
                const hasOptions = opts && opts.length > 1;

                if (hasOptions) {
                    return (
                        <span key={`${tag}-${i}`} className={tagChipSelectableClass}>
                            <select
                                className={tagSelectClass}
                                value={tag}
                                onChange={(e) => selectTagOption(i, e.target.value)}
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                            >
                                {opts.map((opt) => (
                                    <option key={opt} value={opt}>
                                        {opt}
                                    </option>
                                ))}
                            </select>
                            <span className={`${tagTextClass} text-muted-foreground ml-0.5 opacity-60`} aria-hidden="true">
                                <IconChevronDown size={12} />
                            </span>
                        </span>
                    );
                }
                const isEmpty = !tag;
                return (
                    <span
                        key={`${tag || "empty"}-${i}`}
                        className={cn(
                            tagChipClass,
                            isEmpty &&
                                "italic text-muted-foreground cursor-pointer hover:border-primary/25 hover:bg-primary/10",
                        )}
                        onClick={
                            isEmpty
                                ? (e) => {
                                      e.stopPropagation();
                                      startEdit(i);
                                  }
                                : undefined
                        }
                    >
                        <span className={cn(tagTextClass, isEmpty && "pointer-events-auto")}>{tag || "\u2026"}</span>
                    </span>
                );
            })}
            <input
                ref={inputRef}
                className="flex-1 min-w-20 border-0 bg-transparent outline-none text-sm p-0 leading-relaxed focus:outline-none focus:ring-0"
                placeholder={tags.length === 0 ? (placeholder ?? "") : ""}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
            />
        </div>
    );
}
