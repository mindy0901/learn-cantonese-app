import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, XIcon } from "lucide-react";
import { useLocale } from "../store/localeStore.js";
import { useMandarinVocabularies, useCantoneseVocabularies } from "../store/appStore.js";
import { useDebouncedValue } from "../hooks/useDebouncedValue.js";
import { SEARCH_DEBOUNCE_MS } from "../lib/timing.js";
import { languageRoutePrefix } from "../lib/wordRoutes.js";
import { cn } from "../lib/cn.js";
import { Input } from "./shadcn/input.jsx";

const MAX_RESULTS = 15;

/** Chuẩn hóa chuỗi để so khớp: lowercase + bỏ khoảng trắng (chỉ dùng cho so sánh, không đổi dữ liệu). */
const norm = (s) =>
    String(s ?? "")
        .toLowerCase()
        .replace(/\s+/g, "");

/**
 * Thanh tìm kiếm HÁN TỰ trên header (sau navbar).
 * - Chỉ tìm theo hán tự (giản/phồn/HK) — substring match ("có chứa").
 * - Debounce 300ms (SEARCH_DEBOUNCE_MS) — rule toàn app.
 * - Tìm CẢ 2 kho: Mandarin + Cantonese, click → mở detail đúng ngôn ngữ.
 * (2026-08-23)
 */
export const HeaderSearch = memo(function HeaderSearch({ className }) {
    const { t } = useLocale();
    const navigate = useNavigate();
    const mandarinVocabularies = useMandarinVocabularies();
    const cantoneseVocabularies = useCantoneseVocabularies();

    const [query, setQuery] = useState("");
    const [open, setOpen] = useState(false);
    const debounced = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
    const rootRef = useRef(null);

    // Debounce đang chạy (user vừa gõ, chưa áp dụng) → hiện trạng thái "Đang tìm…".
    const searching = query.trim() !== "" && query !== debounced;

    const results = useMemo(() => {
        const q = norm(debounced);
        if (!q) return [];
        const hits = [];
        for (const v of mandarinVocabularies) {
            const s = norm(v.hanSimplified);
            const tr = norm(v.hanTraditional);
            if ((s && s.includes(q)) || (tr && tr.includes(q))) {
                const han = v.hanSimplified || v.hanTraditional || "";
                hits.push({
                    id: v.id,
                    lang: "mandarin",
                    v,
                    han,
                    romanization: v.pinyin,
                    exact: s === q || tr === q,
                    hanLen: Array.from(han || "").length,
                });
            }
        }
        for (const v of cantoneseVocabularies) {
            const hk = norm(v.hanHongKong);
            const tr = norm(v.hanTraditional);
            if ((hk && hk.includes(q)) || (tr && tr.includes(q))) {
                const han = v.hanHongKong || v.hanTraditional || "";
                hits.push({
                    id: v.id,
                    lang: "cantonese",
                    v,
                    han,
                    romanization: v.jyutping,
                    exact: hk === q || tr === q,
                    hanLen: Array.from(han || "").length,
                });
            }
        }
        // ⚠️ Sort (2026-08-23): kết quả CHÍNH XÁC (han == query) lên trước, rồi theo
        // số lượng hán từ NHIỀU → ÍT (dài trước). Giới hạn MAX_RESULTS sau khi sort.
        hits.sort((a, b) => {
            if (a.exact !== b.exact) return a.exact ? -1 : 1;
            return b.hanLen - a.hanLen;
        });
        return hits.slice(0, MAX_RESULTS);
    }, [debounced, mandarinVocabularies, cantoneseVocabularies]);

    const hasQuery = query.trim() !== "";
    const showDropdown = open && hasQuery && !searching;

    // Đóng khi bấm ra ngoài (hoặc blur / Escape).
    useEffect(() => {
        if (!open) return;
        const onPointerDown = (e) => {
            if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener("mousedown", onPointerDown);
        return () => document.removeEventListener("mousedown", onPointerDown);
    }, [open]);

    const handleNavigate = useCallback(
        (item) => {
            if (!item.han) return;
            navigate(`/${languageRoutePrefix(item.lang)}/vocabulary/${encodeURIComponent(item.han)}`);
            setOpen(false);
            setQuery("");
        },
        [navigate],
    );

    return (
        <div ref={rootRef} className={cn("relative w-full max-w-xl", className)}>
            <div className="relative">
                <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                    type="search"
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setOpen(true);
                    }}
                    onFocus={() => setOpen(true)}
                    onKeyDown={(e) => {
                        if (e.key === "Escape") setOpen(false);
                    }}
                    placeholder={t.headerSearch?.placeholder ?? "Tìm hán tự…"}
                    aria-label={t.headerSearch?.placeholder ?? "Tìm hán tự…"}
                    className="h-9 w-full rounded-4xl border border-input bg-input/30 pr-8 pl-8 text-base placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm"
                />
                {hasQuery && (
                    <button
                        type="button"
                        onClick={() => {
                            setQuery("");
                            setOpen(false);
                        }}
                        aria-label={t.common?.clear ?? "Đặt lại"}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                        <XIcon className="size-3.5" aria-hidden="true" />
                    </button>
                )}
            </div>

            {showDropdown && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl ring-1 ring-foreground/5">
                    {results.length === 0 ? (
                        <p className="px-4 py-3 text-sm text-muted-foreground">
                            {t.headerSearch?.noResults ?? "Không tìm thấy hán tự nào"}
                        </p>
                    ) : (
                        <ul className="max-h-80 overflow-y-auto p-1" role="listbox">
                            {results.map((item) => {
                                const isMandarin = item.lang === "mandarin";
                                return (
                                    <li key={`${item.lang}:${item.id}`} role="option">
                                        <button
                                            type="button"
                                            onClick={() => handleNavigate(item)}
                                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors hover:bg-muted"
                                        >
                                            <span
                                                className={cn(
                                                    "whitespace-nowrap text-base font-medium",
                                                    isMandarin ? "text-han-simp" : "text-han-trad",
                                                )}
                                            >
                                                {item.han || "-"}
                                            </span>
                                            {item.romanization && (
                                                <span
                                                    className={cn(
                                                        "whitespace-nowrap text-sm",
                                                        isMandarin ? "text-pinyin" : "text-jyutping",
                                                    )}
                                                >
                                                    {item.romanization}
                                                </span>
                                            )}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            )}

            {open && hasQuery && searching && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-2xl border border-border bg-popover p-3 text-sm text-muted-foreground shadow-2xl ring-1 ring-foreground/5">
                    {t.headerSearch?.searching ?? "Đang tìm…"}
                </div>
            )}
        </div>
    );
});
