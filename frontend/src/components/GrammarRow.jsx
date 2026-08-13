import { memo, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "../store/localeStore.js";
import { cn } from "../lib/cn.js";
import { uiCompactIconButtonClass } from "./ui/controlStyles.js";
import { api } from "../lib/api.js";
import { IconTrash, IconClose } from "./NavIcons.jsx";
import MarkdownText from "./ui/MarkdownText.jsx";

const tdClass = "px-3.5 py-2.5 text-left align-middle truncate max-w-[200px]";
const rowClass = "border-b border-border";
const cellInputClass =
    "w-full min-w-20 px-2 py-1.5 border border-primary/25 rounded-md bg-card text-sm outline-none focus:border-primary";
const cellTextareaClass =
    "w-full min-w-20 px-2 py-1.5 border border-primary/25 rounded-md bg-card text-sm outline-none focus:border-primary resize-y min-h-[60px]";
const deleteButtonClass =
    "shrink-0 inline-flex items-center justify-center w-11 h-11 rounded-lg border text-sm font-medium bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900 cursor-pointer transition-all active:enabled:scale-[0.97]";

// ========== Sub-components for editing ==========

const ArrayFieldEditor = memo(function ArrayFieldEditor({ label, items = [], onChange }) {
    const { t } = useLocale();
    const addItem = () => onChange([...items, ""]);
    const updateItem = (idx, val) => onChange(items.map((it, i) => (i === idx ? val : it)));
    const removeItem = (idx) => onChange(items.filter((_, i) => i !== idx));

    return (
        <div className="space-y-1.5">
            <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-muted-foreground">{label}</label>
                <button
                    type="button"
                    className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1.5 py-0.5 text-[0.6875rem] font-medium text-primary hover:bg-primary/20"
                    onClick={addItem}
                >
                    + {t.grammarBank.add}
                </button>
            </div>
            {items.map((val, idx) => (
                <div key={idx} className="flex items-center gap-3">
                    <input
                        className="flex-1 min-w-0 h-11 px-4 rounded-lg border border-border bg-card text-sm text-foreground outline-none transition-colors focus:border-primary/25"
                        value={val}
                        onChange={(e) => updateItem(idx, e.target.value)}
                    />
                    <button
                        type="button"
                        className={deleteButtonClass}
                        onClick={() => removeItem(idx)}
                        title={t.common.delete}
                    >
                        <IconTrash size={18} />
                    </button>
                </div>
            ))}
        </div>
    );
});

const GrammarExampleEditor = memo(function GrammarExampleEditor({ example, index, onChange, onRemove }) {
    const { t } = useLocale();
    const [autoGenerating, setAutoGenerating] = useState(false);
    const update = (field, val) => onChange({ ...example, [field]: val });

    const handleAutoGenerate = async () => {
        const text = example.hanExample?.trim();
        if (!text) return;
        setAutoGenerating(true);
        try {
            const [pinyinRes, jyutpingRes] = await Promise.all([api.toPinyin(text), api.toJyutping(text)]);
            const patch = {};
            if (pinyinRes?.pinyin) patch.pinyinExample = pinyinRes.pinyin;
            if (jyutpingRes?.jyutping) patch.jyutpingExample = jyutpingRes.jyutping;
            if (Object.keys(patch).length > 0) onChange({ ...example, ...patch });
        } catch {
            /* ignore */
        } finally {
            setAutoGenerating(false);
        }
    };

    return (
        <div className="rounded-lg border border-border bg-background/50 p-3 space-y-2">
            <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                    {t.grammarBank.example.replace("{index}", index + 1)}
                </span>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        className="shrink-0 inline-flex items-center justify-center gap-1 rounded-lg border border-primary bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
                        onClick={handleAutoGenerate}
                        disabled={autoGenerating || !example.hanExample?.trim()}
                        title={t.grammarBank.autoGenHint}
                    >
                        {autoGenerating ? "..." : t.grammarBank.autoGen}
                    </button>
                    <button
                        type="button"
                        className={deleteButtonClass}
                        onClick={onRemove}
                        title={t.grammarBank.deleteExample}
                    >
                        <IconTrash size={18} />
                    </button>
                </div>
            </div>
            <div className="flex flex-col gap-2">
                <div className="space-y-1">
                    <label className="text-[0.6875rem] text-muted-foreground">{t.grammarBank.labelHan}</label>
                    <input
                        className={cellInputClass}
                        value={example.hanExample ?? ""}
                        onChange={(e) => update("hanExample", e.target.value)}
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-[0.6875rem] text-muted-foreground">{t.grammarBank.labelPinyin}</label>
                    <input
                        className={cellInputClass}
                        value={example.pinyinExample ?? ""}
                        onChange={(e) => update("pinyinExample", e.target.value)}
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-[0.6875rem] text-muted-foreground">{t.grammarBank.labelJyutping}</label>
                    <input
                        className={cellInputClass}
                        value={example.jyutpingExample ?? ""}
                        onChange={(e) => update("jyutpingExample", e.target.value)}
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-[0.6875rem] text-muted-foreground">{t.grammarBank.labelVietnamese}</label>
                    <input
                        className={cellInputClass}
                        value={example.vietExample ?? ""}
                        onChange={(e) => update("vietExample", e.target.value)}
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-[0.6875rem] text-muted-foreground">{t.grammarBank.labelEnglish}</label>
                    <input
                        className={cellInputClass}
                        value={example.engExample ?? ""}
                        onChange={(e) => update("engExample", e.target.value)}
                    />
                </div>
            </div>
        </div>
    );
});

// ========== Main GrammarRow ==========

export const GrammarRow = memo(function GrammarRow({
    item,
    index,
    canEdit,
    canMark,
    onSave,
    onDelete,
    onToggleImportant,
    onToggleMastered,
}) {
    const { t } = useLocale();
    const [editing, setEditing] = useState(false);
    const [showPopup, setShowPopup] = useState(false);
    const [draft, setDraft] = useState(item);

    const startEdit = (e) => {
        e.stopPropagation();
        setDraft({
            ...item,
            details: Array.isArray(item.details) ? [...item.details] : [],
            notes: Array.isArray(item.notes) ? [...item.notes] : [],
            examples: Array.isArray(item.examples) ? item.examples.map((ex) => ({ ...ex })) : [],
        });
        setEditing(true);
    };

    const cancelEdit = (e) => {
        e?.stopPropagation();
        setDraft(item);
        setEditing(false);
    };

    const [saveError, setSaveError] = useState(null);
    const [saving, setSaving] = useState(false);

    const saveEdit = async (e) => {
        e.stopPropagation();
        const title = draft.title.trim();
        if (!title) return;

        const payload = {
            title,
            details: (draft.details ?? []).map((d) => d.trim()).filter(Boolean),
            notes: (draft.notes ?? []).map((n) => n.trim()).filter(Boolean),
            structure: draft.structure?.trim() ?? "",
            examples: (draft.examples ?? []).map((ex, i) => ({
                id: ex.id,
                hanExample: ex.hanExample ?? "",
                jyutpingExample: ex.jyutpingExample ?? "",
                pinyinExample: ex.pinyinExample ?? "",
                vietExample: ex.vietExample ?? "",
                engExample: ex.engExample ?? "",
                position: i,
            })),
        };

        setSaving(true);
        try {
            await onSave(item.id, payload);
            setEditing(false);
            setSaveError(null);
        } catch (err) {
            setSaveError(err?.message || t.grammarBank.saveFailed);
        } finally {
            setSaving(false);
        }
    };

    const stop = (e) => e.stopPropagation();

    const updateDraft = useCallback((field, val) => {
        setDraft((d) => ({ ...d, [field]: val }));
    }, []);

    const addExample = useCallback(() => {
        setDraft((d) => ({
            ...d,
            examples: [
                ...(d.examples ?? []),
                {
                    _tempId: crypto.randomUUID(),
                    hanExample: "",
                    jyutpingExample: "",
                    pinyinExample: "",
                    vietExample: "",
                    engExample: "",
                },
            ],
        }));
    }, []);

    const updateExample = useCallback((idx, updated) => {
        setDraft((d) => ({
            ...d,
            examples: (d.examples ?? []).map((ex, i) => (i === idx ? updated : ex)),
        }));
    }, []);

    const removeExample = useCallback((idx) => {
        setDraft((d) => ({
            ...d,
            examples: (d.examples ?? []).filter((_, i) => i !== idx),
        }));
    }, []);

    const numClass = "text-muted-foreground text-[0.8125rem] whitespace-nowrap text-center px-1.5 pr-0.5";
    const flagColClass = "px-0.5 py-1.5 text-center align-middle";

    const hasDetails = (item.details ?? []).length > 0;
    const hasNotes = (item.notes ?? []).length > 0;
    const hasExamples = (item.examples ?? []).length > 0;
    const hasStructure = !!(item.structure ?? "").trim();

    // Collapsed row
    const collapsedRow = (
        <tr className={cn(rowClass, item.important && "bg-orange-600/[0.04]", item.mastered && "opacity-75")}>
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
            <td
                className={cn(tdClass, "font-semibold text-foreground max-w-56 truncate cursor-pointer hover:text-primary")}
                onClick={() => setShowPopup(true)}
            >
                {item.title}
                {hasStructure && <span className="ml-1.5 text-xs text-primary font-normal">({item.structure})</span>}
            </td>
            <td
                className={cn(tdClass, "text-muted-foreground max-w-md truncate cursor-pointer")}
                onClick={() => setShowPopup(true)}
            >
                {hasDetails ? (item.details ?? []).join(" · ") : item.content || "—"}
            </td>
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
                        className={cn(uiCompactIconButtonClass, "size-7 text-base rounded", deleteButtonClass)}
                        onClick={() => onDelete(item)}
                        title={t.common.delete}
                    >
                        <IconTrash size={18} />
                    </button>
                </td>
            )}
        </tr>
    );

    // Editing mode (inline)
    if (editing) {
        return (
            <tr className={cn("bg-amber-50/30 border-b border-border")} onClick={stop}>
                <td className={numClass}>{index + 1}</td>
                {canMark && <td className={flagColClass} />}
                <td colSpan={canMark ? 2 : 1} className="px-3.5 py-2.5">
                    <div className="space-y-3 min-w-0 max-w-3xl" onKeyDown={(e) => e.key === "Escape" && cancelEdit(e)}>
                        {/* Title */}
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">{t.grammarBank.grammarName}</label>
                            <input
                                className={cn(cellInputClass, "font-semibold")}
                                value={draft.title}
                                onChange={(e) => updateDraft("title", e.target.value)}
                            />
                        </div>

                        {/* Structure */}
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">{t.grammarBank.structure}</label>
                            <input
                                className={cellInputClass}
                                value={draft.structure ?? ""}
                                onChange={(e) => updateDraft("structure", e.target.value)}
                            />
                        </div>

                        {/* Details */}
                        <ArrayFieldEditor
                            label={t.grammarBank.details}
                            items={draft.details ?? []}
                            onChange={(val) => updateDraft("details", val)}
                        />

                        {/* Notes */}
                        <ArrayFieldEditor
                            label={t.grammarBank.note}
                            items={draft.notes ?? []}
                            onChange={(val) => updateDraft("notes", val)}
                        />

                        {/* Examples */}
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <label className="text-xs font-medium text-muted-foreground">{t.grammarBank.examples}</label>
                                <button
                                    type="button"
                                    className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1.5 py-0.5 text-[0.6875rem] font-medium text-primary hover:bg-primary/20"
                                    onClick={addExample}
                                >
                                    + {t.grammarBank.addExample}
                                </button>
                            </div>
                            {(draft.examples ?? []).map((ex, exIdx) => (
                                <GrammarExampleEditor
                                    key={ex.id || ex._tempId || exIdx}
                                    example={ex}
                                    index={exIdx}
                                    onChange={(updated) => updateExample(exIdx, updated)}
                                    onRemove={() => removeExample(exIdx)}
                                />
                            ))}
                        </div>

                        {/* Action buttons */}
                        {saveError && (
                            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                                {saveError}
                            </p>
                        )}
                        <div className="flex items-center gap-2 pt-1">
                            <button
                                type="button"
                                className="inline-flex items-center gap-1 rounded-md bg-primary text-primary border border-primary px-3 py-1.5 text-xs font-medium hover:bg-primary/80"
                                onClick={saveEdit}
                            >
                                ✓ {t.common.save}
                            </button>
                            <button
                                type="button"
                                className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-background"
                                onClick={cancelEdit}
                            >
                                × {t.common.cancel}
                            </button>
                        </div>
                    </div>
                </td>
                {canMark && <td className={flagColClass} />}
                <td className={cn(tdClass, "whitespace-nowrap")} onClick={stop}>
                    <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-background"
                        onClick={cancelEdit}
                    >
                        × {t.common.cancel}
                    </button>
                </td>
            </tr>
        );
    }

    // Render collapsed row + popup via portal
    return (
        <>
            {collapsedRow}
            {showPopup &&
                createPortal(
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4">
                        <div className="m-auto w-full max-w-[600px] rounded-2xl bg-card shadow-[0_20px_40px_rgba(0,0,0,0.15)] max-h-[80vh] overflow-y-auto">
                            <div className="flex items-center justify-between border-b border-border px-6 py-4">
                                <h2 className="text-lg font-semibold text-foreground">{item.title}</h2>
                                <button
                                    type="button"
                                    className="inline-flex items-center justify-center size-8 rounded-lg text-muted-foreground hover:bg-background hover:text-foreground transition-colors"
                                    onClick={() => setShowPopup(false)}
                                >
                                    <IconClose size={16} />
                                </button>
                            </div>
                            <div className="p-6 space-y-4">
                                {hasStructure && (
                                    <div>
                                        <span className="text-xs font-medium text-muted-foreground">
                                            {t.grammarBank.structure}
                                        </span>
                                        <div className="mt-1 text-primary font-medium">{item.structure}</div>
                                    </div>
                                )}
                                {hasDetails && (
                                    <div>
                                        <span className="text-xs font-medium text-muted-foreground">{t.grammarBank.details}</span>
                                        <div className="mt-1.5 space-y-1">
                                            {(item.details ?? []).map((d, i) => (
                                                <div key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                                                    <span className="text-primary mt-1.5 shrink-0">•</span>
                                                    <MarkdownText className="flex-1 min-w-0">{d}</MarkdownText>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {hasNotes && (
                                    <div>
                                        <span className="text-xs font-medium text-muted-foreground">{t.grammarBank.note}</span>
                                        <div className="mt-1.5 space-y-1">
                                            {(item.notes ?? []).map((n, i) => (
                                                <div
                                                    key={i}
                                                    className="text-sm text-amber-700 dark:text-amber-400 flex items-start gap-2"
                                                >
                                                    <span className="text-amber-500 mt-1.5 shrink-0">⚠</span>
                                                    <MarkdownText className="flex-1 min-w-0">{n}</MarkdownText>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {item.content && (
                                    <MarkdownText className="text-sm text-muted-foreground">{item.content}</MarkdownText>
                                )}
                                {hasExamples && (
                                    <div>
                                        <span className="text-xs font-medium text-muted-foreground">
                                            {t.grammarBank.examples}
                                        </span>
                                        <div className="mt-2 space-y-2">
                                            {(item.examples ?? []).map((ex, exIdx) => (
                                                <div
                                                    key={ex.id || exIdx}
                                                    className="rounded-lg border border-border bg-background/50 p-3"
                                                >
                                                    <div className="font-medium text-foreground">{ex.hanExample}</div>
                                                    {(ex.jyutpingExample || ex.pinyinExample) && (
                                                        <div className="text-xs text-muted-foreground mt-1">
                                                            {ex.jyutpingExample && (
                                                                <span>粤: {ex.jyutpingExample}</span>
                                                            )}
                                                            {ex.jyutpingExample && ex.pinyinExample && <span> · </span>}
                                                            {ex.pinyinExample && <span>普: {ex.pinyinExample}</span>}
                                                        </div>
                                                    )}
                                                    {ex.vietExample && (
                                                        <div className="text-sm text-muted-foreground mt-1">{ex.vietExample}</div>
                                                    )}
                                                    {ex.engExample && (
                                                        <div className="text-xs text-muted-foreground italic mt-0.5">
                                                            {ex.engExample}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
                                {canEdit && (
                                    <button
                                        type="button"
                                        className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-background transition-colors"
                                        onClick={(e) => {
                                            setShowPopup(false);
                                            startEdit(e);
                                        }}
                                    >
                                        ✎ {t.common.edit}
                                    </button>
                                )}
                                <button
                                    type="button"
                                    className="inline-flex items-center gap-1 rounded-lg bg-primary text-white px-4 py-2 text-sm font-medium hover:bg-primary-hover transition-colors"
                                    onClick={() => setShowPopup(false)}
                                >
                                    {t.common.close}
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body,
                )}
        </>
    );
});
