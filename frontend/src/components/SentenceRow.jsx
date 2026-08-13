import { memo, useState } from "react";
import { useLocale } from "../store/localeStore.js";
import { displayHanPrimary } from "../lib/hanScriptDisplay.js";
import { cn } from "../lib/cn.js";
import { uiCompactIconButtonClass } from "./ui/controlStyles.js";

const tdClass = "px-3.5 py-2.5 text-left align-middle truncate max-w-[200px]";
const rowClass = "border-b border-border";
const cellInputClass =
    "w-full min-w-20 px-2 py-1.5 border border-primary/25 rounded-md bg-card text-sm outline-none focus:border-primary";

export const SentenceRow = memo(function SentenceRow({
    item,
    index,
    canEdit,
    canMark,
    onSave,
    onDelete,
    onToggleImportant,
    onToggleMastered,
    onView,
}) {
    const { t } = useLocale();
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(item);
    const hanDisplay = displayHanPrimary(item);

    const startEdit = (e) => {
        e.stopPropagation();
        setDraft(item);
        setEditing(true);
    };

    const cancelEdit = (e) => {
        e.stopPropagation();
        setDraft(item);
        setEditing(false);
    };

    const saveEdit = (e) => {
        e.stopPropagation();
        const hanTraditional = draft.hanTraditional.trim();
        const vietnamese = draft.vietnamese.trim();
        if (!hanTraditional || !vietnamese) return;
        if (
            hanTraditional === item.hanTraditional.trim() &&
            vietnamese === item.vietnamese.trim() &&
            (draft.english ?? "").trim() === (item.english ?? "").trim()
        ) {
            setEditing(false);
            return;
        }
        onSave(item.id, {
            hanTraditional,
            hanSimplified: draft.hanSimplified?.trim() ?? "",
            jyutping: draft.jyutping?.trim() ?? "",
            pinyin: draft.pinyin?.trim() ?? "",
            vietnamese,
            english: draft.english?.trim() ?? "",
        });
        setEditing(false);
    };

    const stop = (e) => e.stopPropagation();

    const handleEditKeyDown = (e) => {
        if (e.key === "Escape") {
            e.preventDefault();
            cancelEdit(e);
        } else if (e.key === "Enter") {
            e.preventDefault();
            saveEdit(e);
        }
    };

    const numClass = "text-muted-foreground text-[0.8125rem] whitespace-nowrap text-center px-1.5 pr-0.5";
    const flagColClass = "px-0.5 py-1.5 text-center align-middle";

    if (editing && canEdit) {
        return (
            <tr className="bg-primary/10 border-b border-border" onClick={stop} onKeyDown={handleEditKeyDown}>
                <td className={numClass}>{index + 1}</td>
                {canMark && <td className={flagColClass} />}
                <td className={tdClass}>
                    <input
                        className={cellInputClass}
                        value={draft.hanTraditional}
                        onChange={(e) => setDraft((d) => ({ ...d, hanTraditional: e.target.value }))}
                    />
                    <input
                        className={cn(cellInputClass, "mt-1")}
                        value={draft.jyutping ?? ""}
                        placeholder="jyutping"
                        onChange={(e) => setDraft((d) => ({ ...d, jyutping: e.target.value }))}
                    />
                </td>
                <td className={tdClass}>
                    <input
                        className={cellInputClass}
                        value={draft.vietnamese}
                        onChange={(e) => setDraft((d) => ({ ...d, vietnamese: e.target.value }))}
                    />
                </td>
                <td className={tdClass}>
                    <input
                        className={cellInputClass}
                        value={draft.english ?? ""}
                        onChange={(e) => setDraft((d) => ({ ...d, english: e.target.value }))}
                    />
                </td>
                {canMark && <td className={flagColClass} />}
                <td className={cn(tdClass, "whitespace-nowrap")}>
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
                </td>
            </tr>
        );
    }

    return (
        <tr
            className={cn(
                rowClass,
                "cursor-pointer hover:bg-primary/10",
                item.important && "bg-orange-600/[0.04]",
                item.mastered && "opacity-75",
            )}
            onClick={() => onView(item)}
            title={t.sentenceBank.clickToView}
        >
            <td className={numClass}>{index + 1}</td>
            {canMark && (
                <td className={flagColClass} onClick={stop}>
                    <button
                        type="button"
                        className={cn(
                            uiCompactIconButtonClass,
                            "size-6 text-lg",
                            item.important ? "text-yellow-500" : "text-border",
                        )}
                        onClick={() => onToggleImportant(item.id)}
                        title={item.important ? t.wordBank.unmarkImportant : t.wordBank.markImportant}
                        aria-label={item.important ? t.wordBank.unmarkImportant : t.wordBank.markImportant}
                    >
                        ★
                    </button>
                </td>
            )}
            <td className={cn(tdClass, "max-w-md")}>
                <div className="font-semibold text-foreground">{hanDisplay || "—"}</div>
                {item.jyutping && <div className="text-jyutping text-sm mt-0.5">{item.jyutping}</div>}
            </td>
            <td className={cn(tdClass, "text-viet max-w-sm")}>{item.vietnamese}</td>
            <td className={cn(tdClass, "text-muted-foreground max-w-sm")}>{item.english || "—"}</td>
            {canMark && (
                <td className={flagColClass} onClick={stop}>
                    <button
                        type="button"
                        className={cn(
                            uiCompactIconButtonClass,
                            "min-w-5 min-h-5 border border-border rounded-md text-xs px-0.5",
                            item.mastered ? "text-primary border-primary bg-primary" : "text-muted-foreground",
                        )}
                        onClick={() => onToggleMastered(item.id)}
                        title={item.mastered ? t.wordDetail.unmarkMastered : t.wordDetail.markMastered}
                        aria-label={item.mastered ? t.wordDetail.unmarkMastered : t.wordDetail.markMastered}
                    >
                        ✓
                    </button>
                </td>
            )}
            {canEdit && (
                <td className={cn(tdClass, "whitespace-nowrap")} onClick={stop}>
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
                        🗑
                    </button>
                </td>
            )}
        </tr>
    );
});
