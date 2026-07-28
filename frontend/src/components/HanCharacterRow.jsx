import { memo, useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { useLocale } from "../store/localeStore.js";
import { cn } from "../lib/cn.js";
import { uiCompactIconButtonClass } from "./ui/controlStyles.js";
import { HanziiHanCellLink } from "./HanziiHanCellLink.jsx";
import { hanPopularityClass, normalizePopularity } from "../lib/wordPopularity.js";
import { hanCharacterDetailPath } from "../lib/hanCharacterRoutes.js";

const tdClass = "px-3.5 py-2.5 text-left align-middle truncate max-w-[200px]";
const tdEditClass = "px-3.5 py-2.5 text-left align-top truncate max-w-[200px]";
const rowClass = "border-b border-border";
const cellInputClass =
    "w-full min-w-20 px-2 py-1.5 border border-accent-border rounded-md bg-surface text-sm outline-none focus:border-accent";
const hanCharClass = "font-semibold leading-tight align-middle text-[calc(1em*var(--han-scale))] text-han";

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
                            className="flex shrink-0 size-8 items-center justify-center rounded text-text-muted hover:bg-bg hover:text-error-text transition-colors"
                            onClick={() => onChange(values.filter((_, j) => j !== i))}
                        >
                            ×
                        </button>
                    )}
                </div>
            ))}
            <button
                type="button"
                className="self-start text-sm text-accent hover:underline"
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
    const [draftHan, setDraftHan] = useState(item.hanSimplified ?? item.character);
    const initArr = (v) => (Array.isArray(v) && v.length > 0 ? [...v] : [""]);
    const [readings, setReadings] = useState(() => initArr(item.sinoVietnamese));
    const [pinyins, setPinyins] = useState(() => initArr(item.pinyin));
    const [jyutpings, setJyutpings] = useState(() => initArr(item.jyutping));
    const [draftPopularity, setDraftPopularity] = useState(() => normalizePopularity(item.popularity));

    const startEdit = (e) => {
        e.stopPropagation();
        setDraftHan(item.hanSimplified ?? item.character);
        setReadings(initArr(item.sinoVietnamese));
        setPinyins(initArr(item.pinyin));
        setJyutpings(initArr(item.jyutping));
        setDraftPopularity(normalizePopularity(item.popularity));
        setEditing(true);
    };

    const cancelEdit = (e) => {
        e.stopPropagation();
        setEditing(false);
    };

    const saveEdit = (e) => {
        e.stopPropagation();
        if (!draftHan.trim()) return;
        const filterArr = (arr) => arr.map((r) => r.trim()).filter(Boolean);
        onSave(item, {
            hanSimplified: draftHan.trim(),
            sinoVietnamese: filterArr(readings).length > 0 ? filterArr(readings) : undefined,
            pinyin: filterArr(pinyins).length > 0 ? filterArr(pinyins) : undefined,
            jyutping: filterArr(jyutpings).length > 0 ? filterArr(jyutpings) : undefined,
            popularity: draftPopularity,
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
            <tr className="bg-accent-bg border-b border-border" onClick={stop} onKeyDown={handleEditKeyDown}>
                <td className="px-1.5 py-2.5 text-center text-text-muted text-[0.8125rem] whitespace-nowrap align-top">
                    {index + 1}
                </td>
                <td className={tdEditClass}>
                    <input
                        className={cn(cellInputClass, hanCharClass, "!text-red-600 dark:!text-red-400")}
                        value={draftHan}
                        onChange={(e) => setDraftHan(e.target.value)}
                    />
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
                <td className={tdEditClass}>
                    <select
                        className={cn(cellInputClass, "text-center")}
                        value={draftPopularity ?? ""}
                        onChange={(e) => {
                            const v = e.target.value;
                            setDraftPopularity(v === "" ? null : Number(v));
                        }}
                    >
                        <option value="">—</option>
                        {[0, 1, 2, 3, 4].map((n) => (
                            <option key={n} value={n}>
                                {t.wordPopularity.levels[n]}
                            </option>
                        ))}
                    </select>
                </td>
                <td className="px-0.5 py-1.5 text-center align-top whitespace-nowrap">
                    <span className="inline-flex items-center justify-center gap-1.5 align-middle">
                        <button
                            type="button"
                            className={cn(
                                uiCompactIconButtonClass,
                                "min-w-6 min-h-6 px-1.5 py-1 text-[0.9375rem] text-green-600 rounded hover:bg-bg",
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
                                "min-w-6 min-h-6 px-1.5 py-1 text-[0.9375rem] text-text-muted rounded hover:bg-bg",
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

    const toggleImportant = (e) => {
        e.stopPropagation();
        onSave(item, { important: !item.important });
    };

    const toggleMastered = (e) => {
        e.stopPropagation();
        onSave(item, { mastered: !item.mastered });
    };

    return (
        <tr className={cn(rowClass, "hover:bg-accent-bg")}>
            <td className="px-1.5 py-2.5 text-center text-text-muted text-[0.8125rem] whitespace-nowrap">
                {index + 1}
            </td>
            <td className={tdClass}>
                <HanziiHanCellLink
                    hanTraditional={item.hanSimplified ?? item.character}
                    displayText={item.hanSimplified ?? item.character}
                    popularity={item.popularity}
                    className={cn(hanCharClass, "text-red-600 dark:text-red-400")}
                />
                {item.hanTraditional && item.hanTraditional !== (item.hanSimplified ?? item.character) && (
                    <>
                        <span className={cn(hanCharClass, "inline align-middle text-red-600 dark:text-red-400")}>
                            {" "}
                            /{" "}
                        </span>
                        <HanziiHanCellLink
                            hanTraditional={item.hanTraditional}
                            displayText={item.hanTraditional}
                            className={cn(hanCharClass, "text-red-600 dark:text-red-400")}
                        />
                    </>
                )}
            </td>
            <td className={cn(tdClass, "text-text-h text-sm")}>
                {Array.isArray(item.sinoVietnamese) && item.sinoVietnamese.length > 0
                    ? item.sinoVietnamese
                          .flatMap((r) => String(r).split(/[-–—]/))
                          .map((r) => r.trim())
                          .filter(Boolean)
                          .map((r, i, arr) => (
                              <span key={i}>
                                  {i > 0 && <span className="text-text-muted mx-1">/</span>}
                                  {r.charAt(0).toUpperCase() + r.slice(1).toLowerCase()}
                              </span>
                          ))
                    : "—"}
            </td>
            <td className={cn(tdClass, "text-text-h text-sm italic")}>
                {(() => {
                    const arr = Array.isArray(item.pinyin)
                        ? item.pinyin
                        : item.pinyin
                          ? String(item.pinyin).split(/\s+/).filter(Boolean)
                          : [];
                    return arr.length > 0
                        ? arr.map((r, i) => (
                              <span key={i}>
                                  {i > 0 && <span className="text-text-muted mx-1">/</span>}
                                  {r}
                              </span>
                          ))
                        : "—";
                })()}
            </td>
            <td className={cn(tdClass, "text-text-h text-sm")}>
                {(() => {
                    const arr = Array.isArray(item.jyutping)
                        ? item.jyutping
                        : item.jyutping
                          ? String(item.jyutping).split(/\s+/).filter(Boolean)
                          : [];
                    return arr.length > 0
                        ? arr.map((r, i) => (
                              <span key={i}>
                                  {i > 0 && <span className="text-text-muted mx-1">/</span>}
                                  {r}
                              </span>
                          ))
                        : "—";
                })()}
            </td>
            <td className="px-1.5 py-1 text-center align-middle min-w-[100px]" onClick={stop}>
                {(() => {
                    const lvl = normalizePopularity(item.popularity);
                    if (lvl === null) return <span className="text-text-muted text-sm">—</span>;
                    const cls = hanPopularityClass(lvl);
                    return <span className={cn("text-sm font-semibold", cls)}>{t.wordPopularity.levels[lvl]}</span>;
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
                                    "min-w-6 min-h-6 px-1.5 py-1 text-[0.9375rem] rounded hover:bg-bg",
                                    item.important ? "text-yellow-500" : "text-text-muted",
                                )}
                                onClick={toggleImportant}
                                title={
                                    item.important
                                        ? t.common.unimportant || "Bỏ quan trọng"
                                        : t.common.important || "Quan trọng"
                                }
                            >
                                ★
                            </button>
                            <button
                                type="button"
                                className={cn(
                                    uiCompactIconButtonClass,
                                    "min-w-6 min-h-6 px-1.5 py-1 text-[0.9375rem] rounded hover:bg-bg",
                                    item.mastered ? "text-green-500" : "text-text-muted",
                                )}
                                onClick={toggleMastered}
                                title={
                                    item.mastered
                                        ? t.common.unmastered || "Bỏ đã thuộc"
                                        : t.common.mastered || "Đã thuộc"
                                }
                            >
                                ✓
                            </button>
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
                                className="inline-flex items-center justify-center size-8 rounded-lg border border-border bg-surface text-text-muted no-underline transition-colors duration-150 hover:border-accent-border hover:text-accent hover:bg-accent/10"
                                title={t.hanCharacters?.viewDetail ?? "Xem chi tiết"}
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
