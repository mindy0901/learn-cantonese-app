import { useState } from "react";
import { cn } from "../lib/cn.js";
import { btnClass } from "./ui/buttonStyles.js";
import { uiInputClass, uiModalCloseButtonClass } from "./ui/controlStyles.js";
import { useLocale } from "../store/localeStore.js";

const backdropClass =
    "fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto overscroll-contain bg-black/40 px-4 py-[max(1.25rem,env(safe-area-inset-top,0px))] pb-[max(1.25rem,env(safe-area-inset-bottom,0px))]";

const modalClass =
    "m-auto flex w-full max-w-[420px] shrink-0 flex-col overflow-hidden rounded-2xl bg-surface shadow-[0_20px_40px_rgba(0,0,0,0.15)] max-h-[min(calc(100vh-2.5rem),calc(100dvh-2.5rem))]";

const hanCharInputClass = "text-[clamp(1.75rem,5vw,2.5rem)] font-semibold text-han leading-tight text-center";

export function AddHanCharacterModal({ onSave, onClose, item: editItem }) {
    const { t } = useLocale();
    const isEdit = Boolean(editItem?.id);
    const [character, setCharacter] = useState(editItem?.hanSimplified ?? editItem?.character ?? "");
    const [pinyin, setPinyin] = useState(editItem?.pinyin ?? "");
    const [readings, setReadings] = useState(() => {
        const existing = editItem?.sinoVietnamese;
        return Array.isArray(existing) && existing.length > 0 ? [...existing] : [""];
    });
    const [validationError, setValidationError] = useState("");

    const setReading = (idx, value) => {
        setReadings((prev) => {
            const next = [...prev];
            next[idx] = value;
            return next;
        });
    };

    const addReading = () => setReadings((prev) => [...prev, ""]);

    const removeReading = (idx) => {
        setReadings((prev) => {
            if (prev.length <= 1) return prev;
            return prev.filter((_, i) => i !== idx);
        });
    };

    const handleSave = () => {
        if (!character.trim()) {
            setValidationError(t.hanCharacters.requiredCharacter);
            return;
        }
        const filtered = readings.map((r) => r.trim()).filter(Boolean);
        onSave({
            ...(isEdit ? editItem : {}),
            hanSimplified: character.trim(),
            sinoVietnamese: filtered.length > 0 ? filtered : undefined,
            pinyin: pinyin.trim() || undefined,
        });
        onClose();
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") {
            e.preventDefault();
            handleSave();
        }
    };

    return (
        <div className={backdropClass} onClick={onClose} role="presentation">
            <div className={modalClass} onClick={(e) => e.stopPropagation()} role="dialog" onKeyDown={handleKeyDown}>
                <div className="flex items-center justify-between border-b border-border px-6 py-5">
                    <h2>{isEdit ? t.common.edit : t.hanCharacters.addTitle}</h2>
                    <button
                        type="button"
                        className={uiModalCloseButtonClass}
                        onClick={onClose}
                        aria-label={t.common.close}
                    >
                        ×
                    </button>
                </div>
                <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-6">
                    <label className="flex flex-col gap-2 text-sm font-medium text-text-h">
                        {t.hanCharacters.colHanSimplified} *
                        <input
                            className={cn(uiInputClass, hanCharInputClass, "text-red-600 dark:text-red-400")}
                            value={character}
                            onChange={(e) => {
                                setCharacter(e.target.value);
                                if (validationError) setValidationError("");
                            }}
                            autoFocus
                        />
                    </label>
                    <label className="flex flex-col gap-2 text-sm font-medium text-text-h">
                        {t.hanCharacters.colPinyin || "Pinyin"}
                        <input
                            className={uiInputClass}
                            value={pinyin}
                            onChange={(e) => setPinyin(e.target.value)}
                            placeholder="vd: zhōng, ài, rén…"
                        />
                    </label>
                    <fieldset className="flex flex-col gap-2 border-0 p-0">
                        <legend className="text-sm font-medium text-text-h">{t.hanCharacters.colSinoVietnamese}</legend>
                        {readings.map((r, i) => (
                            <div key={i} className="flex gap-1.5">
                                <input
                                    className={uiInputClass}
                                    value={r}
                                    onChange={(e) => setReading(i, e.target.value)}
                                    placeholder={i === 0 ? t.hanCharacters.hanVietHint : undefined}
                                />
                                {readings.length > 1 && (
                                    <button
                                        type="button"
                                        className="flex shrink-0 size-10 items-center justify-center rounded-md border border-border text-text-muted hover:bg-bg hover:text-error-text transition-colors"
                                        onClick={() => removeReading(i)}
                                        aria-label={t.common.remove || "Remove"}
                                    >
                                        ×
                                    </button>
                                )}
                            </div>
                        ))}
                        <button
                            type="button"
                            className="self-start text-sm text-accent hover:underline"
                            onClick={addReading}
                        >
                            + {t.hanCharacters.addReading || "Add reading"}
                        </button>
                    </fieldset>
                    {validationError && (
                        <p
                            className="m-0 rounded-lg border border-error-border bg-error-bg px-4 py-3 text-sm text-error-text"
                            role="alert"
                        >
                            {validationError}
                        </p>
                    )}
                </div>
                <div className="flex shrink-0 items-center justify-between gap-3 px-6 py-4">
                    <button type="button" className={btnClass("ghost")} onClick={onClose}>
                        {t.common.cancel}
                    </button>
                    <button type="button" className={btnClass(isEdit ? "warning" : "success")} onClick={handleSave}>
                        {isEdit ? t.common.save : t.common.add}
                    </button>
                </div>
            </div>
        </div>
    );
}
