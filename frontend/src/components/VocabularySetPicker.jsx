import { useEffect, useState } from "react";
import { useLocale } from "../store/localeStore.js";
import { useVocabularySets, useAppActions } from "../store/appStore.js";
import { Button } from "./shadcn/button.jsx";
import { DropdownMenuItem, DropdownMenuSeparator } from "./shadcn/dropdown-menu.jsx";
import { IconPlus } from "./NavIcons.jsx";
import { randomSetColor, nextSetColor } from "../lib/vocabSetColors.js";

/**
 * Nội dung chọn "bộ từ vựng" cho 1 từ — DÙNG CHUNG giữa dropdown ở trang table (RowActionsCell)
 * và icon header trang detail (2026-09-02). Đảm bảo 2 chỗ hiển thị giống hệt nhau.
 *
 * Props:
 *  - vocabId: id từ đang xét (uuid — unique toàn cục)
 *  - lang: "mandarin" | "cantonese" — quyết định join table nào
 *  - onToggle(set, inSet): tuỳ chọn — báo về set vừa bật/tắt (để cha tô màu bookmark theo bộ vừa thêm)
 */
export function VocabularySetPicker({ vocabId, lang, onToggle }) {
    const { t } = useLocale();
    const sets = useVocabularySets();
    const {
        fetchVocabularySets,
        createVocabularySet,
        updateVocabularySet,
        addVocabularyToSet,
        removeVocabularyFromSet,
    } = useAppActions();
    const [newSetName, setNewSetName] = useState("");

    // Lazy fetch danh sách bộ khi mở (nếu chưa có) — idempotent (store dedupe concurrent).
    useEffect(() => {
        if (sets.length === 0) fetchVocabularySets().catch(() => {});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const valid = lang === "mandarin" || lang === "cantonese" ? lang : "cantonese";
    // ⚠️ 2026-09-02: tạo bộ mới với màu RANDOM từ palette (SET_COLORS) — không phải màu mặc định.
    const handleCreateSet = (e) => {
        e.preventDefault();
        const name = newSetName.trim();
        if (!name) return;
        createVocabularySet({ name, color: randomSetColor() })
            .then(() => setNewSetName(""))
            .catch(() => {});
    };
    // ⚠️ 2026-09-02: click chấm màu → đổi sang màu KẾ TIẾP trong palette (user đổi được màu bộ).
    // stopPropagation để không vô tình toggle membership (DropdownMenuItem onClick).
    const handleCycleColor = (e, set) => {
        e.stopPropagation();
        updateVocabularySet(set.id, { color: nextSetColor(set.color) }).catch(() => {});
    };

    return (
        <>
            {sets.length === 0 ? (
                <p className="px-3 py-2 text-xs italic text-muted-foreground">{t.vocabSets.empty}</p>
            ) : (
                sets.map((set) => {
                    const idKey = valid === "mandarin" ? "mandarinVocabularyIds" : "cantoneseVocabularyIds";
                    const inSet = (set[idKey] ?? []).includes(vocabId);
                    return (
                        <DropdownMenuItem
                            key={set.id}
                            className="cursor-pointer"
                            onClick={() => {
                                // 2026-09-20: báo cho cha biết bộ vừa bật/tắt (tô màu icon bookmark).
                                onToggle?.(set, !inSet);
                                return inSet
                                    ? removeVocabularyFromSet(set.id, vocabId, valid).catch(() => {})
                                    : addVocabularyToSet(set.id, vocabId, valid).catch(() => {});
                            }}
                        >
                            {/* ⚠️ 2026-09-02: chấm màu click để đổi màu kế tiếp */}
                            <button
                                type="button"
                                title={t.vocabSets.changeColor}
                                aria-label={t.vocabSets.changeColor}
                                className="size-2.5 shrink-0 rounded-full transition-transform hover:scale-125 focus:outline-none"
                                style={{ background: set.color || "#7c3aed" }}
                                onClick={(e) => handleCycleColor(e, set)}
                                onPointerDown={(e) => e.stopPropagation()}
                            />
                            <span className="min-w-0 flex-1 truncate">{set.name}</span>
                            {inSet && <span className="shrink-0 text-muted-foreground">✓</span>}
                        </DropdownMenuItem>
                    );
                })
            )}
            <DropdownMenuSeparator />
            {/* ⚠️ 2026-09-02: Base UI Menu có typeahead — gõ phím bị menu nuốt (điều hướng item
                thay vì nhập text). Phải stopPropagation keydown/pointer trên input để gõ được. */}
            <form onSubmit={handleCreateSet} className="flex items-center gap-2 px-2 py-1.5">
                <input
                    value={newSetName}
                    onChange={(e) => setNewSetName(e.target.value)}
                    placeholder={t.vocabSets.newPlaceholder}
                    onKeyDown={(e) => {
                        // ⚠️ 2026-09-17: Escape KHÔNG chặn — phải bubble để Base UI đóng menu
                        // (focus đang ở input → trước đây bấm Escape không thoát được menu).
                        if (e.key !== "Escape") e.stopPropagation();
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full min-w-0 rounded-md border border-border bg-background px-2 py-1 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
                />
                <Button
                    type="submit"
                    variant="ghost"
                    size="icon"
                    className="size-6 shrink-0 cursor-pointer"
                    title={t.vocabSets.addSet}
                >
                    <IconPlus size={16} />
                </Button>
            </form>
        </>
    );
}
