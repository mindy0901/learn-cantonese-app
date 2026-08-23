import { useMemo } from "react";
import { useLocale } from "../store/localeStore.js";
import { cn } from "../lib/cn.js";
import { comparePinyinTone } from "../lib/pinyinSort.js";
import { Button } from "./shadcn/button.jsx";
import { Input } from "./shadcn/input.jsx";
import { IconPlus, IconClose } from "./NavIcons.jsx";

/**
 * Dynamic reading table for edit mode — 2 section riêng:
 *   - Mandarin (Pinyin):    mỗi row = Hán-Việt | Pinyin
 *   - Cantonese (Jyutping): mỗi row = Hán-Việt | Jyutping
 *
 * Mỗi entry mang đúng 1 reading với `type` ("pinyin" | "jyutping"), khớp DB model.
 */
function ReadingRows({ type, rows, activeId, onChange }) {
    const { t } = useLocale();
    const sortedRows = useMemo(() => {
        const next = [...rows];
        next.sort((a, b) => {
            const av = String(type === "pinyin" ? a.pinyin : (a.jyutping ?? "")).trim();
            const bv = String(type === "pinyin" ? b.pinyin : (b.jyutping ?? "")).trim();
            // Row rỗng (mới thêm, chưa điền phiên âm) luôn xuống CUỐI.
            if (!av && !bv) return 0;
            if (!av) return 1;
            if (!bv) return -1;
            return comparePinyinTone(av, bv);
        });
        return next;
    }, [rows, type]);

    const valueLabel = type === "pinyin" ? t.wordBank.colPinyin : t.wordBank.colJyutping;
    const addRowLabel = type === "pinyin" ? t.wordBank.addRowPinyin : t.wordBank.addRowJyutping;
    const valueClass = type === "pinyin" ? "text-muted-foreground" : "text-jyutping";
    const value = (r) => (type === "pinyin" ? (r.pinyin ?? "") : (r.jyutping ?? ""));

    const updateRow = (index, patch) => {
        const next = sortedRows.map((r, i) => (i === index ? { ...r, ...patch } : r));
        onChange(next);
    };

    const removeRow = (index) => {
        onChange(sortedRows.filter((_, i) => i !== index));
    };

    const addRow = () => {
        // Reading mới chưa có id DB → gán _tempId ổn định để chip/switch định danh đúng.
        const tempId =
            typeof crypto !== "undefined" && crypto.randomUUID
                ? crypto.randomUUID()
                : `new-${Date.now()}-${Math.random()}`;
        // 2026-08-21: tự điền sẵn text mặc định (sino N / pinyin N | jyutping N) — user ghi đè
        // sau; số tăng dần theo thứ tự row trong section.
        const n = sortedRows.length + 1;
        const defaultSino = `sino ${n}`;
        const defaultRom = type === "pinyin" ? `pinyin ${n}` : `jyutping ${n}`;
        onChange([
            ...sortedRows,
            {
                id: undefined,
                _tempId: tempId,
                type,
                sinoVietnamese: defaultSino,
                pinyin: type === "pinyin" ? defaultRom : "",
                jyutping: type === "jyutping" ? defaultRom : "",
                meanings: [],
            },
        ]);
    };

    return (
        <div className="flex flex-col gap-2">
            {/* Header labels — CHỈ hiện khi có ≥1 row (2026-08-22); cùng lưới 3 cột + px-2
                 + border với row (1fr auto 1fr) để title căn đúng theo input bên dưới;
                 spacer khớp nút Xóa (size-7) ở giữa. */}
            {sortedRows.length > 0 && (
                <div className="mb-1 grid grid-cols-[1fr_auto_1fr] gap-2 border border-transparent px-2">
                    <p className="m-0 font-semibold uppercase tracking-wide text-viet text-center text-xl">
                        {t.wordBank.colSinoVietnamese}
                    </p>
                    <span aria-hidden="true" className="size-7 shrink-0" />
                    <p className="m-0 font-semibold uppercase tracking-wide text-viet text-center text-xl">
                        {valueLabel}
                    </p>
                </div>
            )}

            {/* Rows — mặc định KHÔNG hiện field; nhấn "+" mới tạo field điền phiên âm */}
            {sortedRows.length > 0 && (
                <div className="flex flex-col gap-2">
                    {sortedRows.map((r, i) => {
                        const isActive = activeId ? r.id === activeId || r._tempId === activeId : i === 0;
                        return (
                            <div
                                key={r._tempId ?? r.id ?? `row-${i}`}
                                className={cn(
                                    "grid items-center gap-2 rounded-lg border px-2 py-1.5 transition-colors",
                                    "grid-cols-[1fr_auto_1fr]",
                                    isActive ? "border-primary/60 bg-primary/10" : "border-border/60 bg-background/40",
                                )}
                            >
                                <Input
                                    className="h-9 border-0 text-center font-semibold text-muted-foreground text-lg! focus-visible:ring-0"
                                    value={r.sinoVietnamese ?? ""}
                                    onChange={(e) => updateRow(i, { sinoVietnamese: e.target.value })}
                                    placeholder="Hán-Việt"
                                    aria-label={t.wordBank.colSinoVietnamese}
                                />
                                <Button
                                    type="button"
                                    size="icon-sm"
                                    variant="ghost"
                                    className="text-muted-foreground hover:text-destructive"
                                    onClick={() => removeRow(i)}
                                    title={t.wordBank.deleteRow}
                                >
                                    <IconClose />
                                </Button>
                                <Input
                                    className={cn("h-9 border-0 text-center text-lg! focus-visible:ring-0", valueClass)}
                                    value={value(r)}
                                    onChange={(e) =>
                                        updateRow(
                                            i,
                                            type === "pinyin"
                                                ? { pinyin: e.target.value }
                                                : { jyutping: e.target.value },
                                        )
                                    }
                                    placeholder={valueLabel}
                                    aria-label={valueLabel}
                                />
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Add button dưới cặp sino-phiên âm — luôn cho thêm dòng liên tục */}
            <Button
                type="button"
                className="h-8 gap-1.5 self-center bg-primary text-primary-foreground border-primary hover:enabled:bg-primary/90"
                onClick={addRow}
                title={addRowLabel}
            >
                <IconPlus data-icon="inline-start" />
                {addRowLabel}
            </Button>
        </div>
    );
}

export function PronunciationEditor({
    pinyinReadings = [],
    jyutpingReadings = [],
    activePinyinId,
    activeJyutpingId,
    onPinyinChange,
    onJyutpingChange,
    column,
    className,
}) {
    // `column` = "pinyin" | "jyutping" → render chỉ 1 cột không shell
    // (dùng trong layout 2 container trái/phải tách biệt, giống view mode).
    if (column === "pinyin") {
        return (
            <div className={cn("w-full flex flex-col gap-2", className)}>
                <ReadingRows type="pinyin" rows={pinyinReadings} activeId={activePinyinId} onChange={onPinyinChange} />
            </div>
        );
    }
    if (column === "jyutping") {
        return (
            <div className={cn("w-full flex flex-col gap-2", className)}>
                <ReadingRows
                    type="jyutping"
                    rows={jyutpingReadings}
                    activeId={activeJyutpingId}
                    onChange={onJyutpingChange}
                />
            </div>
        );
    }
    return (
        <div className={cn("w-full rounded-xl bg-card/80 px-4 py-4", className)}>
            <div className="w-full grid gap-6 items-start grid-cols-1 lg:grid-cols-2">
                <div className="flex flex-col gap-2">
                    <p className="wd-sub m-0 font-semibold text-foreground text-sm">
                        Mandarin <span className="text-muted-foreground font-normal">· Pinyin</span>
                    </p>
                    <ReadingRows
                        type="pinyin"
                        rows={pinyinReadings}
                        activeId={activePinyinId}
                        onChange={onPinyinChange}
                    />
                </div>
                <div className="flex flex-col gap-2">
                    <p className="wd-sub m-0 font-semibold text-foreground text-sm">
                        Cantonese <span className="text-muted-foreground font-normal">· Jyutping</span>
                    </p>
                    <ReadingRows
                        type="jyutping"
                        rows={jyutpingReadings}
                        activeId={activeJyutpingId}
                        onChange={onJyutpingChange}
                    />
                </div>
            </div>
        </div>
    );
}
