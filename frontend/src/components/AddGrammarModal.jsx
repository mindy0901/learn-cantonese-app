import { memo, useCallback, useEffect, useState } from "react";
import { btnClass } from "./ui/buttonStyles.js";
import { uiInputClass, uiModalCloseButtonClass } from "./ui/controlStyles.js";
import { useLocale } from "../store/localeStore.js";
import { emptyGrammarBankItem } from "../types/word.js";
import { api } from "../lib/api.js";
import { IconPlus, IconTrash, IconClose } from "./NavIcons.jsx";

const backdropClass =
    "fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto overscroll-contain bg-black/40 px-4 py-[max(1.25rem,env(safe-area-inset-top,0px))] pb-[max(1.25rem,env(safe-area-inset-bottom,0px))]";

const modalClass =
    "m-auto flex w-full max-w-[780px] shrink-0 flex-col overflow-hidden rounded-2xl bg-card shadow-[0_20px_40px_rgba(0,0,0,0.15)] max-h-[min(calc(100vh-2.5rem),calc(100dvh-2.5rem))]";

function buildDraft(item) {
    if (!item?.id) return { title: "", details: [""], notes: [], structure: [], examples: [] };
    return {
        title: item.title ?? "",
        details: Array.isArray(item.details) && item.details.length > 0 ? [...item.details] : [""],
        notes: Array.isArray(item.notes) ? [...item.notes] : [],
        structure: item.structure ? [item.structure] : [],
        examples: Array.isArray(item.examples) ? item.examples.map((ex) => ({ ...ex })) : [],
    };
}

// Sub-component for array fields (details, notes, structure)
const ArrayField = memo(function ArrayField({ label, items, onChange }) {
    const { t } = useLocale();
    const safeItems = Array.isArray(items) ? items : [];
    const addItem = () => onChange([...safeItems, ""]);
    const updateItem = (idx, val) => onChange(safeItems.map((it, i) => (i === idx ? val : it)));
    const removeItem = (idx) => onChange(safeItems.filter((_, i) => i !== idx));

    return (
        <div className="flex flex-col gap-2 text-sm font-medium text-foreground">
            <span>{label}</span>
            {safeItems.map((val, idx) => (
                <div key={idx} className="flex items-center gap-3">
                    <input
                        className="flex-1 min-w-0 h-11 px-4 rounded-lg border border-border bg-card text-sm text-foreground outline-none transition-colors focus:border-primary/25"
                        value={val}
                        onChange={(e) => updateItem(idx, e.target.value)}
                    />
                    <button
                        type="button"
                        className="shrink-0 inline-flex items-center justify-center w-11 h-11 rounded-lg border text-sm font-medium transition-colors bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900"
                        onClick={() => removeItem(idx)}
                        title={t.common.delete}
                    >
                        <IconTrash size={18} />
                    </button>
                </div>
            ))}
            <button
                type="button"
                className="inline-flex items-center gap-1.5 self-start rounded-lg border bg-primary text-primary border-primary px-3 py-1.5 text-sm font-medium transition-colors hover:enabled:bg-primary hover:enabled:border-success-text"
                onClick={addItem}
            >
                <IconPlus size={14} />
                {label}
            </button>
        </div>
    );
});

// Sub-component for example editing
const ExampleField = memo(function ExampleField({ example, index, onChange, onRemove }) {
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
                        className="shrink-0 inline-flex items-center justify-center w-11 h-11 rounded-lg border text-sm font-medium transition-colors bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900"
                        onClick={onRemove}
                        title={t.grammarBank.deleteExample}
                    >
                        <IconTrash size={18} />
                    </button>
                </div>
            </div>
            <div className="flex flex-col gap-2">
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                    {t.grammarBank.labelHan}
                    <input
                        className={uiInputClass}
                        value={example.hanExample ?? ""}
                        onChange={(e) => update("hanExample", e.target.value)}
                    />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                    {t.grammarBank.labelPinyin}
                    <input
                        className={uiInputClass}
                        value={example.pinyinExample ?? ""}
                        onChange={(e) => update("pinyinExample", e.target.value)}
                    />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                    {t.grammarBank.labelJyutping}
                    <input
                        className={uiInputClass}
                        value={example.jyutpingExample ?? ""}
                        onChange={(e) => update("jyutpingExample", e.target.value)}
                    />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                    {t.grammarBank.labelVietnamese}
                    <input
                        className={uiInputClass}
                        value={example.vietExample ?? ""}
                        onChange={(e) => update("vietExample", e.target.value)}
                    />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                    {t.grammarBank.labelEnglish}
                    <input
                        className={uiInputClass}
                        value={example.engExample ?? ""}
                        onChange={(e) => update("engExample", e.target.value)}
                    />
                </label>
            </div>
        </div>
    );
});

export function AddGrammarModal({ onSave, onClose, item: editItem, existingItems }) {
    const { t } = useLocale();
    const isEdit = Boolean(editItem?.id);
    const [draft, setDraft] = useState(() => buildDraft(editItem));
    const [validationError, setValidationError] = useState("");

    useEffect(() => {
        if (editItem?.id) setDraft(buildDraft(editItem));
    }, [editItem]);

    const set = useCallback(
        (field, value) => {
            setDraft((d) => ({ ...d, [field]: value }));
            if (validationError) setValidationError("");
        },
        [validationError],
    );

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

    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        const title = draft.title.trim();
        if (!title) {
            setValidationError(t.grammarBank.grammarNameRequired);
            return;
        }
        // Check for duplicate title (exclude current item when editing)
        if (existingItems) {
            const duplicate = existingItems.find(
                (g) => g.title?.trim().toLowerCase() === title.toLowerCase() && g.id !== editItem?.id,
            );
            if (duplicate) {
                setValidationError(t.grammarBank.duplicateTitle);
                return;
            }
        }
        const payload = {
            title,
            details: (draft.details ?? []).map((d) => d.trim()).filter(Boolean),
            notes: (draft.notes ?? []).map((n) => n.trim()).filter(Boolean),
            structure: (draft.structure ?? []).map((s) => s.trim()).filter(Boolean)[0] ?? "",
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
            if (isEdit) {
                await onSave(editItem.id, payload);
            } else {
                await onSave(emptyGrammarBankItem(payload));
            }
            onClose();
        } catch (err) {
            setValidationError(err?.message || t.grammarBank.saveFailedAll);
        } finally {
            setSaving(false);
        }
    };

    const handleClear = () => {
        setDraft({ title: "", details: [""], notes: [], structure: [], examples: [] });
        setValidationError("");
    };

    const handleFormKeyDown = (e) => {
        if (e.key === "Escape") {
            e.preventDefault();
            onClose();
        } else if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleSave();
            }
        }
    };

    return (
        <div className={backdropClass} role="presentation">
            <div className={modalClass} role="dialog">
                <div className="flex items-center justify-between border-b border-border px-6 py-5">
                    <h2>{isEdit ? t.common.edit : t.grammarBank.addTitle}</h2>
                    <button
                        type="button"
                        className={uiModalCloseButtonClass}
                        onClick={onClose}
                        aria-label={t.common.close}
                    >
                        <IconClose size={16} />
                    </button>
                </div>
                <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-7" onKeyDown={handleFormKeyDown}>
                    {/* Title */}
                    <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
                        {t.grammarBank.grammarName} *
                        <input
                            className={uiInputClass}
                            value={draft.title}
                            onChange={(e) => set("title", e.target.value)}
                        />
                    </label>

                    {/* Details — always has 1 input ready */}
                    <ArrayField label={t.grammarBank.details} items={draft.details ?? [""]} onChange={(val) => set("details", val)} />

                    {/* Structure — click "+ Add" to create field */}
                    <ArrayField
                        label={t.grammarBank.structure}
                        items={draft.structure ?? []}
                        onChange={(val) => set("structure", val)}
                    />

                    {/* Notes */}
                    <ArrayField label={t.grammarBank.note} items={draft.notes ?? []} onChange={(val) => set("notes", val)} />

                    {/* Examples */}
                    <div className="flex flex-col gap-2">
                        <span className="text-sm font-medium text-foreground">{t.grammarBank.examples}</span>
                        {(draft.examples ?? []).map((ex, exIdx) => (
                            <ExampleField
                                key={ex.id || ex._tempId || exIdx}
                                example={ex}
                                index={exIdx}
                                onChange={(updated) => updateExample(exIdx, updated)}
                                onRemove={() => removeExample(exIdx)}
                            />
                        ))}
                        <button
                            type="button"
                            className="inline-flex items-center gap-1.5 self-start rounded-lg border bg-primary text-primary border-primary px-3 py-1.5 text-sm font-medium transition-colors hover:enabled:bg-primary hover:enabled:border-success-text"
                            onClick={addExample}
                        >
                            <IconPlus size={14} />
                            {t.grammarBank.addExample}
                        </button>
                    </div>

                    {validationError && (
                        <p
                            className="m-0 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                            role="alert"
                        >
                            {validationError}
                        </p>
                    )}
                </div>
                <div className="flex shrink-0 items-center justify-between gap-3 px-6 py-4">
                    <button type="button" className={btnClass("ghost")} onClick={handleClear} disabled={saving}>
                        {t.grammarBank.clear}
                    </button>
                    <button
                        type="button"
                        className={btnClass(isEdit ? "warning" : "success")}
                        onClick={handleSave}
                        disabled={saving}
                    >
                        {saving ? t.common.saving : isEdit ? t.common.save : t.grammarBank.addBtn}
                    </button>
                </div>
            </div>
        </div>
    );
}
