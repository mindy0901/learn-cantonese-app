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
            const av = type === "pinyin" ? a.pinyin : a.jyutping;
            const bv = type === "pinyin" ? b.pinyin : b.jyutping;
            return comparePinyinTone(av, bv);
        });
        return next;
    }, [rows, type]);

    const updateRow = (index, patch) => {
        const next = sortedRows.map((r, i) => (i === index ? { ...r, ...patch } : r));
        onChange(next);
    };

    const removeRow = (index) => {
        if (sortedRows.length <= 1) return;
        onChange(sortedRows.filter((_, i) => i !== index));
    };

    const addRow = () => {
        onChange([
            ...sortedRows,
            {
                id: undefined,
                type,
                sinoVietnamese: "",
                pinyin: "",
                jyutping: "",
                meanings: [],
            },
        ]);
    };

    const valueLabel = type === "pinyin" ? t.wordBank.colPinyin : t.wordBank.colJyutping;
    const valueClass = type === "pinyin" ? "text-pinyin" : "text-jyutping";
    const value = (r) => (type === "pinyin" ? (r.pinyin ?? "") : (r.jyutping ?? ""));

    return (
        <div className="flex flex-col gap-2">
            {/* Header + add button on the right */}
            <div className="mb-1 flex items-center justify-between gap-2">
                <div className="grid flex-1 grid-cols-2 gap-2">
                    <p className="wd-sub m-0 font-semibold uppercase tracking-wide text-primary-foreground text-center text-xs">
                        {t.wordBank.colSinoVietnamese}
                    </p>
                    <p className="wd-sub m-0 font-semibold uppercase tracking-wide text-primary-foreground text-center text-xs">
                        {valueLabel}
                    </p>
                </div>
                <Button
                    type="button"
                    size="icon-sm"
                    className="bg-primary text-primary-foreground border-primary hover:enabled:bg-primary/90"
                    onClick={addRow}
                    title={t.wordBank.addRow}
                >
                    <IconPlus />
                </Button>
            </div>

            {/* Rows */}
            {sortedRows.length === 0 ? (
                <div className="flex justify-center py-2">
                    <Button
                        type="button"
                        size="sm"
                        className="bg-primary text-primary-foreground border-primary hover:enabled:bg-primary/90"
                        onClick={addRow}
                    >
                        <IconPlus />
                        {t.wordBank.addRow}
                    </Button>
                </div>
            ) : (
                <div className="flex flex-col gap-2">
                    {sortedRows.map((r, i) => {
                        const isActive = activeId ? r.id === activeId : i === 0;
                        return (
                            <div
                                key={r.id ?? `row-${i}`}
                                className={cn(
                                    "grid items-center gap-2 rounded-lg border px-2 py-1.5 transition-colors",
                                    "grid-cols-[1fr_1fr_auto]",
                                    isActive ? "border-primary/60 bg-primary/10" : "border-border/60 bg-background/40",
                                )}
                            >
                                <Input
                                    className="h-9 border-0 text-center font-semibold text-viet focus-visible:ring-0"
                                    value={r.sinoVietnamese ?? ""}
                                    onChange={(e) => updateRow(i, { sinoVietnamese: e.target.value })}
                                    placeholder="Hán-Việt"
                                    aria-label={t.wordBank.colSinoVietnamese}
                                />
                                <Input
                                    className={cn("h-9 border-0 text-center focus-visible:ring-0", valueClass)}
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
                                <Button
                                    type="button"
                                    size="icon-sm"
                                    variant="ghost"
                                    className="text-muted-foreground hover:text-destructive"
                                    onClick={() => removeRow(i)}
                                    disabled={sortedRows.length <= 1}
                                    title={t.wordBank.deleteRow}
                                >
                                    <IconClose />
                                </Button>
                            </div>
                        );
                    })}
                </div>
            )}
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
    className,
}) {
    return (
        <div
            className={cn(
                "w-full rounded-xl border border-border/80 bg-card/80 px-4 py-4 flex flex-col gap-6",
                className,
            )}
        >
            <div className="flex flex-col gap-2">
                <p className="wd-sub m-0 font-semibold text-primary-foreground text-sm">
                    Mandarin <span className="text-muted-foreground font-normal">· Pinyin</span>
                </p>
                <ReadingRows type="pinyin" rows={pinyinReadings} activeId={activePinyinId} onChange={onPinyinChange} />
            </div>
            <div className="border-t border-border/60" />
            <div className="flex flex-col gap-2">
                <p className="wd-sub m-0 font-semibold text-primary-foreground text-sm">
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
    );
}
