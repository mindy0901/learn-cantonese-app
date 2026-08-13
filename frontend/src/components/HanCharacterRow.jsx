import { memo, useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { useLocale } from "../store/localeStore.js";
import { cn } from "../lib/cn.js";
import { uiCompactIconButtonClass } from "./ui/controlStyles.js";
import { HanziiHanCellLink } from "./HanziiHanCellLink.jsx";
import { hanCharacterDetailPath } from "../lib/hanCharacterRoutes.js";

const tdClass = "px-3.5 py-2.5 text-left align-middle truncate max-w-[200px]";
const tdEditClass = "px-3.5 py-2.5 text-left align-top truncate max-w-[200px]";
const rowClass = "border-b border-border";
const cellInputClass =
    "w-full min-w-20 px-2 py-1.5 border border-primary/25 rounded-md bg-card text-sm outline-none focus:border-primary";
const hanCharClass = "font-semibold leading-tight align-middle text-[calc(1em*var(--han-scale))]";

const MultiInput = memo(function MultiInput({ values, onChange, placeholder, addLabel }) {
    return (
        <div className="flex flex-col gap-1">
            {values.map((v, i) => (
                <div key={i} className="flex gap-1.5">
                    <input
                        className={cn(cellInputClass, "flex-1")}
                        value={v}
                        onChange={(e) => {
                            const next = [...values];
                            next[i] = e.target.value;
                            onChange(next);
                        }}
                        placeholder={i === 0 ? placeholder : undefined}
                    />
                    {values.length > 1 && (
                        <button
                            type="button"
                            className="flex shrink-0 size-8 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-destructive transition-colors"
                            onClick={() => onChange(values.filter((_, j) => j !== i))}
                        >
                            ×
                        </button>
                    )}
                </div>
            ))}
            <button
                type="button"
                className="self-start text-sm text-primary hover:underline"
                onClick={() => onChange([...values, ""])}
            >
                + {addLabel}
            </button>
        </div>
    );
});

export const HanCharacterRow = memo(function HanCharacterRow({ item, index, canEdit, onSave, onDelete }) {
    const { t } = useLocale();
    const [editing, setEditing] = useState(false);
    // Giữ simplified luôn (single-form: simplified === traditional, KHÔNG xóa — 2026-08-13)
    const [draftHan, setDraftHan] = useState(item.hanSimplified ?? "");
    const [draftHanTraditional, setDraftHanTraditional] = useState(item.hanTraditional ?? "");
    const initArr = (v) => (Array.isArray(v) && v.length > 0 ? [...v] : [""]);
    const [readings, setReadings] = useState(() => initArr(item.sinoVietnamese));
    const [pinyins, setPinyins] = useState(() => initArr(item.pinyin));
    const [jyutpings, setJyutpings] = useState(() => initArr(item.jyutping));

    const startEdit = (e) => {
        e.stopPropagation();
        setDraftHan(item.hanSimplified ?? "");
        setDraftHanTraditional(item.hanTraditional ?? "");
        setReadings(initArr(item.sinoVietnamese));
        setPinyins(initArr(item.pinyin));
        setJyutpings(initArr(item.jyutping));
        setEditing(true);
    };

    const cancelEdit = (e) => {
        e.stopPropagation();
        setEditing(false);
    };

    const saveEdit = (e) => {
        e.stopPropagation();
        if (!draftHan.trim() && !draftHanTraditional.trim()) return;
        const filterArr = (arr) => arr.map((r) => r.trim()).filter(Boolean);
        onSave(item, {
            hanSimplified: draftHan.trim() || undefined,
            hanTraditional: draftHanTraditional.trim() || draftHan.trim(),
            sinoVietnamese: filterArr(readings).length > 0 ? filterArr(readings) : undefined,
            pinyin: filterArr(pinyins).length > 0 ? filterArr(pinyins) : undefined,
            jyutping: filterArr(jyutpings).length > 0 ? filterArr(jyutpings) : undefined,
        });
        setEditing(false);
    };

    const stop = (e) => e.stopPropagation();
    const handleEditKeyDown = (e) => {
        if (e.key === "Escape") {
            e.preventDefault();
            cancelEdit(e);
        } else if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") {
            e.preventDefault();
            saveEdit(e);
        }
    };

    if (editing && canEdit) {
        return (
            <tr className="bg-primary/10 border-b border-border" onClick={stop} onKeyDown={handleEditKeyDown}>
                <td className="px-1.5 py-2.5 text-center text-muted-foreground text-[0.8125rem] whitespace-nowrap align-top">
                    {index + 1}
                </td>
                <td className={tdEditClass}>
                    <MultiInput
                        values={readings}
                        onChange={setReadings}
                        placeholder={t.hanCharacters.hanVietHint}
                        addLabel={t.hanCharacters.addReading || "Add"}
                    />
                </td>
                <td className={tdEditClass}>
                    <div className="flex flex-col gap-1">
                        <input
                            className={cn(cellInputClass, hanCharClass, "text-han-trad!")}
                            value={draftHanTraditional}
                            onChange={(e) => setDraftHanTraditional(e.target.value)}
                            placeholder={t.hanCharacters.tradPlaceholder}
                        />
                        <input
                            className={cn(cellInputClass, hanCharClass, "text-han-simp!")}
                            value={draftHan}
                            onChange={(e) => setDraftHan(e.target.value)}
                            placeholder={t.hanCharacters.simpPlaceholder}
                        />
                    </div>
                </td>
                <td className={tdEditClass}>
                    <MultiInput
                        values={pinyins}
                        onChange={setPinyins}
                        placeholder="pinyin"
                        addLabel={t.hanCharacters.addReading || "Add"}
                    />
                </td>
                <td className={tdEditClass}>
                    <MultiInput
                        values={jyutpings}
                        onChange={setJyutpings}
                        placeholder="jyutping"
                        addLabel={t.hanCharacters.addReading || "Add"}
                    />
                </td>
                <td className="px-0.5 py-1.5 text-center align-top whitespace-nowrap">
                    <span className="inline-flex items-center justify-center gap-1.5 align-middle">
                        <button
                            type="button"
                            className={cn(
                                uiCompactIconButtonClass,
                                "min-w-6 min-h-6 px-1.5 py-1 text-[0.9375rem] text-green-600 rounded hover:bg-background",
                            )}
                            onClick={saveEdit}
                            title={t.common.save}
                        >
                            ✓
                        </button>
                        <button
                            type="button"
                            className={cn(
                                uiCompactIconButtonClass,
                                "min-w-6 min-h-6 px-1.5 py-1 text-[0.9375rem] text-muted-foreground rounded hover:bg-background",
                            )}
                            onClick={cancelEdit}
                            title={t.common.cancel}
                        >
                            ×
                        </button>
                    </span>
                </td>
            </tr>
        );
    }

    return (
        <tr className={cn(rowClass, "hover:bg-primary/10")}>
            <td className="px-1.5 py-2.5 text-center text-muted-foreground text-[0.8125rem] whitespace-nowrap">
                {index + 1}
            </td>
            <td className={cn(tdClass, "text-foreground text-sm")}>
                {Array.isArray(item.sinoVietnamese) && item.sinoVietnamese.length > 0
                    ? item.sinoVietnamese
                          .flatMap((r) => String(r).split(/[-–—]/))
                          .map((r) => r.trim())
                          .filter(Boolean)
                          .map((r, i, arr) => (
                              <span key={i}>
                                  {i > 0 && <span className="text-muted-foreground mx-1">/</span>}
                                  {r.charAt(0).toUpperCase() + r.slice(1).toLowerCase()}
                              </span>
                          ))
                    : "—"}
            </td>
            <td className={tdClass}>
                <HanziiHanCellLink
                    hanTraditional={item.hanTraditional ?? item.hanSimplified ?? item.character}
                    displayText={item.hanTraditional ?? item.hanSimplified ?? item.character}
                    className={cn(hanCharClass, "text-han-trad")}
                />
                {item.hanSimplified && item.hanSimplified !== (item.hanTraditional ?? "") && (
                    <>
                        <span className={cn(hanCharClass, "inline align-middle text-muted-foreground")}> / </span>
                        <HanziiHanCellLink
                            hanTraditional={item.hanSimplified}
                            displayText={item.hanSimplified}
                            className={cn(hanCharClass, "text-han-simp")}
                        />
                    </>
                )}
            </td>
            <td className={cn(tdClass, "text-foreground text-sm italic")}>
                {(() => {
                    const arr = Array.isArray(item.pinyin)
                        ? item.pinyin
                        : item.pinyin
                          ? String(item.pinyin).split(/\s+/).filter(Boolean)
                          : [];
                    return arr.length > 0
                        ? arr.map((r, i) => (
                              <span key={i}>
                                  {i > 0 && <span className="text-muted-foreground mx-1">/</span>}
                                  {r}
                              </span>
                          ))
                        : "—";
                })()}
            </td>
            <td className={cn(tdClass, "text-foreground text-sm")}>
                {(() => {
                    const arr = Array.isArray(item.jyutping)
                        ? item.jyutping
                        : item.jyutping
                          ? String(item.jyutping).split(/\s+/).filter(Boolean)
                          : [];
                    return arr.length > 0
                        ? arr.map((r, i) => (
                              <span key={i}>
                                  {i > 0 && <span className="text-muted-foreground mx-1">/</span>}
                                  {r}
                              </span>
                          ))
                        : "—";
                })()}
            </td>
            <td className="px-0.5 py-1.5 text-center align-middle whitespace-nowrap" onClick={stop}>
                <span className="inline-flex items-center justify-center gap-1 align-middle">
                    {canEdit && (
                        <>
                            <button
                                type="button"
                                className={cn(
                                    uiCompactIconButtonClass,
                                    "min-w-6 min-h-6 px-1.5 py-1 text-[0.9375rem] rounded hover:bg-amber-50 hover:text-amber-600",
                                )}
                                onClick={startEdit}
                                title={t.common.edit}
                            >
                                ✎
                            </button>
                            <button
                                type="button"
                                className={cn(
                                    uiCompactIconButtonClass,
                                    "min-w-6 min-h-6 px-1.5 py-1 text-[0.9375rem] rounded hover:bg-red-50 hover:text-red-600",
                                )}
                                onClick={() => onDelete(item)}
                                title={t.common.delete}
                            >
                                ×
                            </button>
                            <Link
                                to={hanCharacterDetailPath(item.id)}
                                className="inline-flex items-center justify-center size-8 rounded-lg border border-border bg-card text-muted-foreground no-underline transition-colors duration-150 hover:border-primary/25 hover:text-primary hover:bg-primary/10"
                                title={t.hanCharacters?.viewDetail ?? "View details"}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <path d="M5 12h14" />
                                    <polyline points="12 5 19 12 12 19" />
                                </svg>
                            </Link>
                        </>
                    )}
                </span>
            </td>
        </tr>
    );
});
