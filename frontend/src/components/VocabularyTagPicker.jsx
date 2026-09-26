import { Fragment, useEffect, useMemo, useState } from "react";
import { useLocale } from "../store/localeStore.js";
import { useTags, useAppStore } from "../store/appStore.js";
import { useIsAdmin } from "../store/authStore.js";
import { api } from "../lib/api.js";
import { tagColor, TAG_COLOR_ROWS, tagColorLabel } from "../lib/tagColors.js";
import { Button } from "./shadcn/button.jsx";
import { DropdownMenuItem, DropdownMenuSeparator } from "./shadcn/dropdown-menu.jsx";
import { IconPlus } from "./NavIcons.jsx";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { toast } from "./shadcn/toast.jsx";

// ⚠️ 2026-09-27: cache module-level tag ids theo vocabId — mở lại dropdown (hoặc vào lại từ trong
// cùng phiên) hiển thị ✓ + số tag NGAY, không chờ API. vocabId là uuid toàn cục nên không cần key lang.
const tagIdCache = new Map();
// Listener để chip/hook (useVocabularyTags) cập nhật ngay khi gắn/gỡ tag trong dropdown.
const tagCountListeners = new Set();

function publishTagIds(vocabId, ids) {
    tagIdCache.set(vocabId, new Set(ids));
    for (const fn of tagCountListeners) fn(vocabId);
}

/**
 * Hook lấy DANH SÁCH TAG đã gắn cho 1 từ (chip ở hàng "Độ phổ biến" + icon header).
 * `enabled=false` → [] và không gọi API. Kết quả cache trong `tagIdCache` nên hiển thị NGAY
 * khi vào lại từ trong cùng phiên; picker gắn/gỡ tag → chip cập nhật luôn (qua listener).
 */
export function useVocabularyTags(lang, vocabId, enabled = true) {
    const catalogue = useTags();
    const [ids, setIds] = useState(() => Array.from(tagIdCache.get(vocabId) ?? []));
    useEffect(() => {
        if (!enabled || !vocabId) {
            setIds([]);
            return;
        }
        // Nạp catalogue tag (idempotent, store tự dedupe) để map id → tên.
        useAppStore
            .getState()
            .fetchTags()
            .catch(() => {});
        const sync = (changedId) => {
            if (changedId === vocabId) setIds(Array.from(tagIdCache.get(vocabId) ?? []));
        };
        tagCountListeners.add(sync);
        if (tagIdCache.has(vocabId)) setIds(Array.from(tagIdCache.get(vocabId)));
        let alive = true;
        api.fetchVocabularyTags(lang, vocabId)
            .then((res) => {
                if (alive) publishTagIds(vocabId, res?.tagIds ?? []);
            })
            .catch(() => {});
        return () => {
            alive = false;
            tagCountListeners.delete(sync);
        };
    }, [lang, vocabId, enabled]);
    // Sắp theo thứ tự catalogue (BE order by name asc).
    const idSet = useMemo(() => new Set(ids), [ids]);
    // ⚠️ 2026-09-27: catalogue (store) sắp theo SỐ TỪ GIẢM DẦN — nhưng CHIP ở trang chi tiết sắp
    // theo TÊN cho ổn định, dễ đọc (không đổi thứ tự khi số lượng từ thay đổi).
    return useMemo(
        () =>
            catalogue
                .filter((tag) => idSet.has(tag.id))
                .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? ""), "vi")),
        [catalogue, idSet],
    );
}

/**
 * Tag dùng chung (catalogue toàn app, CHỈ admin tạo/xóa + gắn cho từ) — 2026-09-27.
 * Nội dung dropdown ở header trang chi tiết từ (pattern giống VocabularySetPicker).
 *
 * Props:
 *  - vocabId: id từ đang xét (uuid — unique toàn cục)
 *  - lang: "mandarin" | "cantonese"
 */
export function VocabularyTagPicker({ vocabId, lang }) {
    const { t } = useLocale();
    const tags = useTags();
    const isAdmin = useIsAdmin();
    // Seed từ cache → ✓ hiển thị ngay khi mở lại (không nhấp nháy).
    const [tagIds, setTagIds] = useState(() => new Set(tagIdCache.get(vocabId) ?? []));
    // ⚠️ 2026-09-27: CHỈ dùng để biết catalogue đã nạp chưa (lần đầu mở trong phiên).
    // KHÔNG chặn render danh sách chờ `fetchVocabularyTags` — trước đây làm dropdown “như đang loading”.
    const [catalogueReady, setCatalogueReady] = useState(() => useAppStore.getState().tags.length > 0);
    const [search, setSearch] = useState("");
    const [newTagName, setNewTagName] = useState("");
    const [busy, setBusy] = useState(false);
    // Đổi tên tag inline: id tag đang sửa + giá trị đang gõ (2026-09-27).
    const [renamingId, setRenamingId] = useState(null);
    const [renameValue, setRenameValue] = useState("");
    // Id tag đang MỞ bảng màu (bấm chấm màu).
    const [paletteTagId, setPaletteTagId] = useState(null);

    const valid = lang === "mandarin" || lang === "cantonese" ? lang : "cantonese";

    // Nạp catalogue tag (store cache) + tag đang gắn cho từ này.
    useEffect(() => {
        let alive = true;
        // Nạp catalogue (store tự cache, gọi lại gần như tức thì) + tag của từ ở BACKGROUND.
        useAppStore
            .getState()
            .fetchTags()
            .then(() => {
                if (alive) setCatalogueReady(true);
            })
            .catch(() => {
                if (alive) setCatalogueReady(true);
            });
        api.fetchVocabularyTags(valid, vocabId)
            .then((res) => {
                if (!alive) return;
                setTagIds(new Set(res?.tagIds ?? []));
            })
            .catch(() => {});
        return () => {
            alive = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [vocabId, valid]);

    // Đồng bộ cache + báo cho icon header mỗi khi tập tag của từ thay đổi.
    useEffect(() => {
        publishTagIds(vocabId, tagIds);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tagIds]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return tags;
        return tags.filter((tag) => tag.name.toLowerCase().includes(q));
    }, [tags, search]);

    // Gắn / gỡ tag cho từ (admin). Cập nhật lạc quan local + store đếm lại số từ.
    // ⚠️ 2026-09-27: KHÔNG toast khi gắn/gỡ (user yêu cầu — toast làm chậm thao tác gắn nhanh),
    // và KHÔNG chặn bằng `busy` để bấm liên tiếp nhiều tag được ngay (mỗi tag độc lập).
    const handleToggle = (tag) => {
        const next = !tagIds.has(tag.id);
        const prevIds = tagIds;
        setTagIds((prev) => {
            const copy = new Set(prev);
            if (next) copy.add(tag.id);
            else copy.delete(tag.id);
            return copy;
        });
        useAppStore
            .getState()
            .setVocabularyTag(valid, vocabId, tag.id, next)
            .catch((err) => {
                // Rollback local (store đã rollback số đếm) + báo lỗi (chỉ khi THẤT BẠI).
                setTagIds(prevIds);
                toast.add({ type: "error", title: err?.message ?? t.common.error, duration: 3000 });
            });
    };

    const handleCreate = (e) => {
        e.preventDefault();
        const name = newTagName.trim();
        if (!name || busy) return;
        setBusy(true);
        useAppStore
            .getState()
            .createTag(name)
            .then((created) => {
                setNewTagName("");
                toast.add({
                    type: "success",
                    title: t.tags.created.replace("{name}", created.name),
                    duration: 2000,
                });
            })
            .catch(() => {})
            .finally(() => setBusy(false));
    };

    const handleDelete = (e, tag) => {
        e.stopPropagation();
        if (busy) return;
        if (!window.confirm(t.tags.deleteConfirm.replace("{name}", tag.name))) return;
        setBusy(true);
        // ⚠️ 2026-09-27: OPTIMISTIC — gỡ tag khỏi từ NGAY (không chờ round-trip), store cũng đã
        // gỡ tag khỏi catalogue ngay. Lỗi → khôi phục + báo toast (trước đây `.catch(() => {})` im lặng
        // nên tag “còn mãi” mà không biết vì sao).
        const prevIds = tagIds;
        setTagIds((prev) => {
            const copy = new Set(prev);
            copy.delete(tag.id);
            return copy;
        });
        useAppStore
            .getState()
            .deleteTag(tag.id)
            .then(() => {
                toast.add({
                    type: "info",
                    title: t.tags.deleted.replace("{name}", tag.name),
                    duration: 2000,
                });
            })
            .catch((err) => {
                setTagIds(prevIds);
                toast.add({ type: "error", title: err?.message ?? t.common.error, duration: 3000 });
            })
            .finally(() => setBusy(false));
    };

    // ⚠️ 2026-09-27: bấm CHẤM MÀU → mở BẢNG MÀU (36 ô) ngay dưới dòng tag để chọn màu.
    // (Không dùng popover rời vì Base UI Menu tự đóng khi click ra ngoài menu → panel nằm TRONG menu.)
    const togglePalette = (e, tag) => {
        e.stopPropagation();
        setPaletteTagId((cur) => (cur === tag.id ? null : tag.id));
    };

    const handlePickColor = (e, tag, color) => {
        e.stopPropagation();
        setPaletteTagId(null);
        if (busy || color === tag.color) return;
        useAppStore
            .getState()
            .updateTag(tag.id, { color })
            .catch((err) => {
                toast.add({ type: "error", title: err?.message ?? t.common.error, duration: 3000 });
            });
    };

    // Mở chế độ đổi tên cho 1 tag (input được BE chuẩn hóa Title Case khi lưu).
    const startRename = (e, tag) => {
        e.stopPropagation();
        setNewTagName("");
        setRenamingId(tag.id);
        setRenameValue(tag.name);
    };

    const handleRename = (e, tag) => {
        e.preventDefault();
        const name = renameValue.trim();
        if (!name || busy) return;
        if (name === tag.name) {
            setRenamingId(null);
            return;
        }
        setBusy(true);
        // Đóng form ngay (optimistic — store cập nhật tên tức thì, rollback nếu API lỗi).
        setRenamingId(null);
        useAppStore
            .getState()
            .updateTag(tag.id, { name })
            .then((saved) => {
                toast.add({
                    type: "success",
                    title: t.tags.renamed.replace("{name}", saved?.name ?? name),
                    duration: 2000,
                });
            })
            .catch((err) => {
                toast.add({ type: "error", title: err?.message ?? t.common.error, duration: 3000 });
            })
            .finally(() => setBusy(false));
    };

    return (
        <>
            {tags.length > 6 && (
                <div className="px-2 pb-1 pt-1.5">
                    {/* ⚠️ Base UI Menu có typeahead — phải stopPropagation keydown/pointer trên input
                        (Escape vẫn bubble để đóng menu). */}
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t.tags.findPlaceholder}
                        onKeyDown={(e) => {
                            if (e.key !== "Escape") e.stopPropagation();
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full min-w-0 rounded-md border border-border bg-background px-2 py-1 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
                    />
                </div>
            )}
            {!catalogueReady && tags.length === 0 ? (
                <p className="px-3 py-2 text-xs italic text-muted-foreground">…</p>
            ) : tags.length === 0 ? (
                <p className="px-3 py-2 text-xs italic text-muted-foreground">{t.tags.empty}</p>
            ) : filtered.length === 0 ? (
                <p className="px-3 py-2 text-xs italic text-muted-foreground">{t.tags.noMatch}</p>
            ) : (
                filtered.map((tag) => {
                    const tagged = tagIds.has(tag.id);
                    const color = tagColor(tag);
                    // Đang đổi tên tag này → thay hẳn row bằng form input.
                    if (renamingId === tag.id) {
                        return (
                            <form
                                key={tag.id}
                                onSubmit={(e) => handleRename(e, tag)}
                                className="flex items-center gap-2 px-2 py-1.5"
                            >
                                <input
                                    autoFocus
                                    value={renameValue}
                                    onChange={(e) => setRenameValue(e.target.value)}
                                    onKeyDown={(e) => {
                                        // Escape đóng luôn menu (Base UI) — quay lại chế độ thường.
                                        if (e.key === "Escape") setRenamingId(null);
                                        e.stopPropagation();
                                    }}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-full min-w-0 rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
                                />
                                <Button
                                    type="submit"
                                    variant="ghost"
                                    size="icon"
                                    className="size-6 shrink-0 cursor-pointer"
                                    title={t.common.save}
                                >
                                    <Check size={16} />
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="size-6 shrink-0 cursor-pointer"
                                    title={t.common.cancel}
                                    onClick={() => setRenamingId(null)}
                                >
                                    <X size={16} />
                                </Button>
                            </form>
                        );
                    }
                    return (
                        <Fragment key={tag.id}>
                            <DropdownMenuItem
                                className="cursor-pointer"
                                // ⚠️ 2026-09-27: KHÔNG đóng menu khi bấm tag → gắn/gỡ được NHIỀU tag
                                // liên tiếp, xong thì bấm ra ngoài (hoặc Esc) để tắt dropdown.
                                closeOnClick={false}
                                // Mọi user ĐỌC được tag, nhưng CHỈ admin mới gắn/gỡ.
                                disabled={!isAdmin}
                                onClick={() => handleToggle(tag)}
                            >
                                {/* ⚠️ 2026-09-27: CHỈ 1 CHẤM DUY NHẤT mỗi dòng — chấm mang CẢ 2 thông tin:
                                màu tag (viền/nền) + đã gắn hay chưa (đặc = đã gắn, rỗng = chưa).
                                Bấm chấm → MỞ BẢNG MÀU (36 ô). (Đã bỏ ô checkbox vuông vì bị “dư 1 dot”.) */}
                                {isAdmin ? (
                                    <button
                                        type="button"
                                        title={t.tags.changeColor}
                                        aria-label={`${t.tags.changeColor}: ${tag.name}`}
                                        aria-expanded={paletteTagId === tag.id}
                                        className={
                                            "size-3.5 shrink-0 rounded-full border-2 transition-transform hover:scale-125 focus:outline-none " +
                                            (paletteTagId === tag.id
                                                ? "ring-2 ring-foreground/40 ring-offset-1 ring-offset-background"
                                                : "")
                                        }
                                        style={
                                            tagged
                                                ? { background: color, borderColor: color }
                                                : { background: "transparent", borderColor: color }
                                        }
                                        onClick={(e) => togglePalette(e, tag)}
                                        onPointerDown={(e) => e.stopPropagation()}
                                    />
                                ) : (
                                    <span
                                        className="size-3.5 shrink-0 rounded-full border-2"
                                        style={
                                            tagged
                                                ? { background: color, borderColor: color }
                                                : { background: "transparent", borderColor: color }
                                        }
                                    />
                                )}
                                <span className="min-w-0 flex-1 truncate" style={{ color }}>
                                    {tag.name}
                                </span>
                                <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                                    {tag.vocabularyCount ?? 0}
                                </span>
                                {isAdmin && (
                                    <>
                                        <button
                                            type="button"
                                            title={t.tags.renameTag}
                                            aria-label={`${t.tags.renameTag}: ${tag.name}`}
                                            className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground focus:outline-none"
                                            onClick={(e) => startRename(e, tag)}
                                            onPointerDown={(e) => e.stopPropagation()}
                                        >
                                            <Pencil className="size-3.5" />
                                        </button>
                                        <button
                                            type="button"
                                            title={t.tags.deleteTag}
                                            aria-label={`${t.tags.deleteTag}: ${tag.name}`}
                                            className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-destructive focus:outline-none"
                                            onClick={(e) => handleDelete(e, tag)}
                                            onPointerDown={(e) => e.stopPropagation()}
                                        >
                                            <Trash2 className="size-3.5" />
                                        </button>
                                    </>
                                )}
                            </DropdownMenuItem>
                            {/* ⚠️ 2026-09-27: BẢNG MÀU — 10 HÀNG (sắc gốc: Đỏ/Cam/Vàng/Lục/Xanh lá/Ngọc/
                                Xanh dương/Chàm/Tím/Hồng) × 5 CỘT (tông 500→900). Chọn ô → lưu màu cho tag. */}
                            {paletteTagId === tag.id && (
                                <div
                                    className="flex flex-col gap-2 px-3 pb-2 pt-1"
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    {TAG_COLOR_ROWS.map((row, rowIdx) => (
                                        <div key={rowIdx} className="grid grid-cols-5 gap-2">
                                            {row.map((c) => (
                                                <button
                                                    key={c}
                                                    type="button"
                                                    title={`${tagColorLabel(c)} (${c})`}
                                                    aria-label={`${t.tags.pickColor} ${tagColorLabel(c)}`}
                                                    className={
                                                        "size-5 rounded-full transition-transform hover:scale-110 focus:outline-none " +
                                                        (c === color
                                                            ? "ring-2 ring-foreground ring-offset-1 ring-offset-background"
                                                            : "ring-1 ring-foreground/15 ring-inset")
                                                    }
                                                    style={{ background: c }}
                                                    onClick={(e) => handlePickColor(e, tag, c)}
                                                    onPointerDown={(e) => e.stopPropagation()}
                                                />
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Fragment>
                    );
                })
            )}
            {isAdmin && (
                <>
                    <DropdownMenuSeparator />
                    <form onSubmit={handleCreate} className="flex items-center gap-2 px-2 py-1.5">
                        <input
                            value={newTagName}
                            onChange={(e) => setNewTagName(e.target.value)}
                            placeholder={t.tags.newPlaceholder}
                            onKeyDown={(e) => {
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
                            title={t.tags.addTag}
                        >
                            <IconPlus size={16} />
                        </Button>
                    </form>
                </>
            )}
        </>
    );
}
