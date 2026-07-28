import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../lib/cn.js";
import { uiInputClass } from "./ui/controlStyles.js";
import { useLocale } from "../store/localeStore.js";
import { vocabularyFieldSummary } from "../lib/wordDisplay.js";
import { emptyVocabulary } from "../types/word.js";
import { useHanCharacters } from "../store/appStore.js";
import { TagInput } from "./TagInput.jsx";
import { api } from "../lib/api.js";
import {
    IconStar,
    IconPlus,
    IconMinus,
    IconClose,
    IconGlobe,
    IconSpeech,
    IconSpinner,
    IconChevronDown,
    IconChevronRight,
} from "./NavIcons.jsx";

/** Capitalize only the first letter of the string */
function capitalizeFirst(value) {
    const s = (value ?? "").trim();
    if (!s) return s;
    return s.charAt(0).toLocaleUpperCase("vi") + s.slice(1);
}

const textareaClass =
    "min-h-[4.5rem] w-full resize-none overflow-hidden rounded-lg border border-border bg-surface px-3.5 py-2.5 font-inherit text-[0.9375rem] text-text-h outline-none focus:border-accent-border [field-sizing:content]";

/** Build a lookup map: character → hanCharacters entries (indexed by both simplified and traditional) */
function buildCharLookupMap(hanCharacters) {
    const map = new Map();
    for (const hc of hanCharacters) {
        const simp = (hc.hanSimplified ?? "").trim();
        const trad = (hc.hanTraditional ?? "").trim();
        if (simp) {
            if (!map.has(simp)) map.set(simp, []);
            map.get(simp).push(hc);
        }
        if (trad && trad !== simp) {
            if (!map.has(trad)) map.set(trad, []);
            map.get(trad).push(hc);
        }
    }
    return map;
}

/**
 * Given a hanTraditional string and the lookup map, return per-character readings.
 * Returns an array of { char, jyutpingOptions: string[], pinyinOptions: string[] }
 * where each option represents one possible reading for that character.
 */
/** Characters that represent erhua (儿化) suffix: 儿 兒 */
const ERHUA_CHARS = new Set(["\u513F", "\u5152"]); // 儿 兒

function resolveCharReadings(hanText, lookupMap) {
    if (!hanText) return [];
    const chars = [...hanText];
    const lastIdx = chars.length - 1;
    return chars.map((ch, idx) => {
        // Skip non-CJK characters (spaces, punctuation, etc.)
        if (!/\p{Script=Han}/u.test(ch)) {
            return { char: ch, jyutpingOptions: [], pinyinOptions: [], isHan: false };
        }
        const entries = lookupMap.get(ch);
        if (!entries || entries.length === 0) {
            // Erhua: if this is the last char and it's 儿/兒, use "r"
            if (idx === lastIdx && ERHUA_CHARS.has(ch)) {
                return { char: ch, jyutpingOptions: [], pinyinOptions: [], sinoVietnameseOptions: ["r"], isHan: true };
            }
            return { char: ch, jyutpingOptions: [], pinyinOptions: [], isHan: true };
        }
        // Collect unique jyutping, pinyin, and sinoVietnamese readings
        const jpSet = new Set();
        const pySet = new Set();
        const hvSet = new Set();
        for (const e of entries) {
            const jpArr = Array.isArray(e.jyutping) ? e.jyutping : e.jyutping ? [e.jyutping] : [];
            const pyArr = Array.isArray(e.pinyin) ? e.pinyin : e.pinyin ? [e.pinyin] : [];
            const hvArr = Array.isArray(e.sinoVietnamese)
                ? e.sinoVietnamese
                : e.sinoVietnamese
                  ? [e.sinoVietnamese]
                  : [];
            for (const j of jpArr) {
                if (j) jpSet.add(String(j).trim());
            }
            for (const p of pyArr) {
                if (p) pySet.add(String(p).trim());
            }
            for (const h of hvArr) {
                if (h) hvSet.add(String(h).trim());
            }
        }
        // Erhua: if this is the last char and it's 儿/兒, override SV to "r"
        const svOptions = idx === lastIdx && ERHUA_CHARS.has(ch) ? ["r"] : [...hvSet];
        return {
            char: ch,
            jyutpingOptions: [...jpSet],
            pinyinOptions: [...pySet],
            sinoVietnameseOptions: svOptions,
            isHan: true,
        };
    });
}

export function buildWordDraft(word) {
    if (!word?.id) return emptyVocabulary();
    return {
        ...word,
        engMeanings: (word.engMeanings ?? "").trim() || vocabularyFieldSummary(word, "engMeanings"),
        engExamples: (word.engExamples ?? "").trim() || vocabularyFieldSummary(word, "engExamples"),
        vietMeanings: (word.vietMeanings ?? "").trim() || vocabularyFieldSummary(word, "vietMeanings"),
        vietExamples: (word.vietExamples ?? "").trim() || vocabularyFieldSummary(word, "vietExamples"),
        jyutping: (word.jyutping ?? "").trim().replace(/[,\s]+/g, " / "),
        pinyin: (word.pinyin ?? "").trim().replace(/[,\s]+/g, " / "),
        meanings: (word.meanings ?? []).map((m, i) => ({
            ...m,
            _tempId: m._tempId || m.id || crypto.randomUUID(),
            position: m.position ?? i,
            examples: (m.examples ?? []).map((ex, j) => ({
                ...ex,
                _tempId: ex._tempId || ex.id || crypto.randomUUID(),
                position: ex.position ?? j,
            })),
        })),
        examples: (word.examples ?? []).map((ex, i) => ({
            ...ex,
            _tempId: ex._tempId || ex.id || crypto.randomUUID(),
            position: ex.position ?? i,
        })),
    };
}

/** Convert space-separated text to CamelCase (each word capitalized, no spaces).
 *  Special: erhua "r" stays lowercase. */
function toCamelCase(value) {
    const trimmed = (value ?? "").trim();
    if (!trimmed) return trimmed;
    return trimmed
        .split(/\s+/)
        .map((w) => {
            // Erhua suffix: keep lowercase "r"
            if (w === "r" || w === "R") return "r";
            return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
        })
        .join(" ");
}

/** Convert comma/separator-delimited tag values to space-separated string for DB storage. */
function tagsToSpace(value) {
    const trimmed = (value ?? "").trim();
    if (!trimmed) return trimmed;
    return trimmed
        .split(/[,，/、]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .join(" ");
}

export function wordDraftPayload(draft) {
    return {
        engMeanings: draft.engMeanings.trim(),
        engMeanings: capitalizeFirst(draft.engMeanings?.trim()) || undefined,
        hanTraditional: draft.hanTraditional.trim(),
        hanSimplified: draft.hanSimplified?.trim() || undefined,
        vietMeanings: capitalizeFirst(draft.vietMeanings.trim()),
        vietExamples: draft.vietExamples?.trim() || undefined,
        sinoVietnamese: toCamelCase(draft.sinoVietnamese) || undefined,
        jyutping: tagsToSpace(draft.jyutping),
        pinyin: tagsToSpace(draft.pinyin) || undefined,
        hskLevel: draft.hskLevel?.trim() || undefined,
        important: Boolean(draft.important),
        meanings: (draft.meanings ?? [])
            .filter((m) => (m.vietMeanings ?? "").trim() || (m.engMeanings ?? "").trim())
            .map((m, i) => ({
                id: m.id,
                _tempId: m._tempId,
                category: capitalizeFirst((m.category ?? "").trim()),
                vietMeanings: capitalizeFirst((m.vietMeanings ?? "").trim()),
                engMeanings: capitalizeFirst((m.engMeanings ?? "").trim()),
                position: i,
                examples: (m.examples ?? [])
                    .filter((ex) => (ex.hanExample ?? "").trim() || (ex.vietExamples ?? "").trim())
                    .map((ex, j) => ({
                        id: ex.id,
                        _tempId: ex._tempId,
                        hanExample: (ex.hanExample ?? "").trim(),
                        jyutpingExample: (ex.jyutpingExample ?? "").trim(),
                        pinyinExample: (ex.pinyinExample ?? "").trim(),
                        vietExamples: capitalizeFirst((ex.vietExamples ?? "").trim()),
                        engExamples: (ex.engExamples ?? "").trim(),
                        position: j,
                    })),
            })),
        examples: (draft.examples ?? [])
            .filter((ex) => (ex.hanExample ?? "").trim() || (ex.vietExamples ?? "").trim())
            .map((ex, i) => ({
                id: ex.id,
                _tempId: ex._tempId,
                hanExample: (ex.hanExample ?? "").trim(),
                pinyinExample: (ex.pinyinExample ?? "").trim(),
                vietExamples: (ex.vietExamples ?? "").trim(),
                engExamples: (ex.engExamples ?? "").trim(),
                position: i,
            })),
    };
}

export function WordEditFields({ draft, onChange, validationError, showDetail = true }) {
    const { t } = useLocale();
    const hanCharacters = useHanCharacters();

    // Build lookup map once
    const lookupMap = buildCharLookupMap(hanCharacters);
    const charReadings = resolveCharReadings(draft.hanTraditional, lookupMap);

    // Per-tag option arrays for TagInput dropdowns (only han chars)
    const hanReadings = charReadings.filter((r) => r.isHan);
    const jyutpingTagOptions = hanReadings.map((r) => r.jyutpingOptions);
    const pinyinTagOptions = hanReadings.map((r) => r.pinyinOptions);
    const sinoVietnameseTagOptions = hanReadings.map((r) => r.sinoVietnameseOptions);

    // Sync removal across all three tag fields
    const handleRemoveTag = useCallback(
        (idx) => {
            const removeAt = (str) => {
                const parts = (str ?? "")
                    .split(/[,，/、]+/)
                    .map((s) => s.trim())
                    .filter(Boolean);
                parts.splice(idx, 1);
                return parts.join(", ");
            };
            onChange({
                ...draft,
                sinoVietnamese: removeAt(draft.sinoVietnamese),
                jyutping: removeAt(draft.jyutping),
                pinyin: removeAt(draft.pinyin),
            });
        },
        [draft, onChange],
    );

    const set = (field, value) => {
        onChange({ ...draft, [field]: value });
    };

    const hasHan = draft.hanTraditional.trim().length > 0;

    // When hanTraditional changes, auto-fill jyutping/pinyin/sinoVietnamese
    const handleHanChange = (value) => {
        const readings = resolveCharReadings(value, lookupMap);
        const jpParts = readings.map((r) => {
            if (!r.isHan) return r.char;
            return r.jyutpingOptions[0] || "";
        });
        const pyParts = readings.map((r) => {
            if (!r.isHan) return r.char;
            return r.pinyinOptions[0] || "";
        });
        const hvParts = readings.map((r) => {
            if (!r.isHan) return "";
            return toCamelCase(r.sinoVietnameseOptions[0]) || "";
        });
        onChange({
            ...draft,
            hanTraditional: value,
            jyutping: jpParts.join(", "),
            pinyin: pyParts.join(", "),
            sinoVietnamese: hvParts.join(", "),
        });
    };

    // Sync on mount when hanTraditional is pre-filled (e.g. from "add new word" flow)
    const syncedRef = useRef(false);
    useEffect(() => {
        if (!syncedRef.current && hasHan && !draft.jyutping?.trim() && !draft.sinoVietnamese?.trim()) {
            syncedRef.current = true;
            handleHanChange(draft.hanTraditional);
        }
    }, [hasHan, draft.hanTraditional, draft.jyutping, draft.sinoVietnamese, handleHanChange]);

    return (
        <div className="flex w-full min-w-0 flex-col gap-4 text-left">
            {/* 1. Chữ Hán — moved to top */}
            <label className="flex flex-col gap-1.5 text-sm font-medium text-text-h">
                {t.wordBank.colHanTraditional} *
                <input
                    className="w-full px-1 py-3 font-semibold text-han bg-transparent border-0 border-b-2 border-border outline-none transition-colors focus:border-accent-border"
                    style={{ fontSize: 48 }}
                    value={draft.hanTraditional}
                    onChange={(e) => handleHanChange(e.target.value)}
                />
            </label>

            {hasHan && (
                <>
                    {/* 2. Hán-Việt */}
                    <label className="flex flex-col gap-1.5 text-sm font-medium text-text-h">
                        {t.wordBank.colSinoVietnamese}
                        <TagInput
                            value={draft.sinoVietnamese ?? ""}
                            onChange={(v) => set("sinoVietnamese", toCamelCase(v))}
                            tagOptions={sinoVietnameseTagOptions}
                            onRemoveTag={handleRemoveTag}
                            allowEmpty
                        />
                    </label>

                    {/* 3. Jyutping */}
                    <label className="flex flex-col gap-1.5 text-sm font-medium text-text-h">
                        {t.wordBank.colJyutping} *
                        <TagInput
                            value={draft.jyutping ?? ""}
                            onChange={(v) => set("jyutping", v)}
                            className="font-semibold text-jyutping"
                            tagOptions={jyutpingTagOptions}
                            onRemoveTag={handleRemoveTag}
                        />
                    </label>

                    {/* 4. Pinyin */}
                    <label className="flex flex-col gap-1.5 text-sm font-medium text-text-h">
                        {t.wordBank.colPinyin}
                        <TagInput
                            value={draft.pinyin ?? ""}
                            onChange={(v) => set("pinyin", v)}
                            className="text-pinyin"
                            tagOptions={pinyinTagOptions}
                            onRemoveTag={handleRemoveTag}
                            allowEmpty
                        />
                    </label>
                </>
            )}

            {/* Meanings */}
            <MeaningsEditor meanings={draft.meanings ?? []} onChange={(newMeanings) => set("meanings", newMeanings)} />

            <div className="flex items-center gap-3.5 pt-1">
                <button
                    type="button"
                    className={cn(
                        "inline-flex size-12 shrink-0 items-center justify-center rounded-[10px] border-2 border-border bg-surface text-[1.625rem] leading-none text-text-muted transition-[border-color,color,background,box-shadow] duration-150",
                        "hover:border-yellow-500 hover:text-yellow-600 hover:shadow-[0_0_0_3px_rgba(234,179,8,0.12)]",
                        draft.important &&
                            "border-yellow-500 bg-yellow-500/14 text-yellow-500 shadow-[0_0_0_3px_rgba(234,179,8,0.16)]",
                    )}
                    onClick={() => set("important", !draft.important)}
                    aria-pressed={Boolean(draft.important)}
                    aria-label={draft.important ? t.wordBank.unmarkImportant : t.wordBank.markImportant}
                    title={draft.important ? t.wordBank.unmarkImportant : t.wordBank.markImportant}
                >
                    <IconStar size={24} />
                </button>
                <span className="text-[0.9375rem] font-medium text-text-h">{t.addWord.markImportant}</span>
            </div>
            {validationError && (
                <p
                    className="m-0 rounded-lg border border-error-border bg-error-bg px-4 py-3 text-sm text-error-text"
                    role="alert"
                >
                    {validationError}
                </p>
            )}
        </div>
    );
}

export function MeaningsEditor({ meanings, onChange }) {
    const [expanded, setExpanded] = useState((meanings ?? []).length > 0);
    const skipSyncRef = useRef(false);
    const prevMeaningsRef = useRef(meanings);

    // Build initial categories from props
    const [localCategories, setLocalCategories] = useState(() => {
        const map = new Map();
        for (const m of meanings ?? []) {
            const cat = (m.category ?? "").trim() || "__default__";
            if (!map.has(cat)) map.set(cat, []);
            map.get(cat).push(m);
        }
        return [...map.entries()].map(([name, ms]) => ({
            _tempId: crypto.randomUUID(),
            name: name === "__default__" ? "" : name,
            meanings: ms,
        }));
    });

    // Only sync from props when structure changes externally (not from our own flush)
    useEffect(() => {
        if (skipSyncRef.current) {
            skipSyncRef.current = false;
            return;
        }
        if (meanings !== prevMeaningsRef.current) {
            prevMeaningsRef.current = meanings;
            const map = new Map();
            for (const m of meanings ?? []) {
                const cat = (m.category ?? "").trim() || "__default__";
                if (!map.has(cat)) map.set(cat, []);
                map.get(cat).push(m);
            }
            const cats = [...map.entries()].map(([name, ms]) => ({
                _tempId: crypto.randomUUID(),
                name: name === "__default__" ? "" : name,
                meanings: ms,
            }));
            if (cats.length > 0 || localCategories.length === 0) {
                setLocalCategories(cats);
            }
        }
    }, [meanings]);

    const flushToParent = (cats) => {
        const flat = [];
        let pos = 0;
        for (const cat of cats) {
            for (const m of cat.meanings) {
                flat.push({ ...m, category: cat.name || "", position: pos++ });
            }
        }
        skipSyncRef.current = true;
        onChange(flat);
    };

    const addCategory = () => {
        if (!expanded) setExpanded(true);
        const next = [
            ...localCategories,
            {
                _tempId: crypto.randomUUID(),
                name: "",
                meanings: [
                    {
                        _tempId: crypto.randomUUID(),
                        vietMeanings: "",
                        engMeanings: "",
                        examples: [],
                    },
                ],
            },
        ];
        setLocalCategories(next);
        flushToParent(next);
    };

    const handleExpand = () => {
        setExpanded(true);
        // Auto-create first category with one empty meaning if none exist
        if (localCategories.length === 0) {
            addCategory();
        }
    };

    const updateCategory = (idx, updated) => {
        const next = localCategories.map((c, i) => (i === idx ? { ...c, ...updated } : c));
        setLocalCategories(next);
        flushToParent(next);
    };

    const removeCategory = (idx) => {
        const next = localCategories.filter((_, i) => i !== idx);
        setLocalCategories(next);
        flushToParent(next);
        if (next.length === 0) setExpanded(false);
    };

    if (!expanded) {
        return (
            <div className="flex justify-center">
                <button
                    type="button"
                    className="inline-flex items-center justify-center size-10 rounded-lg border-2 bg-success-bg text-success-text border-success-border shadow-sm transition-all hover:bg-success-bg hover:border-success-text hover:shadow-md"
                    onClick={handleExpand}
                    title="Thêm nghĩa & ví dụ"
                >
                    <IconPlus size={22} />
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-bg/50 p-4">
            <div className="flex items-center gap-2">
                <h3 className="flex-1 text-center text-sm font-semibold text-text-h">Nghĩa chi tiết & ví dụ</h3>
                <button
                    type="button"
                    className="inline-flex items-center justify-center size-8 rounded-md text-text-muted hover:bg-bg hover:text-text-h transition-colors"
                    onClick={() => setExpanded(false)}
                    title="Thu gọn"
                >
                    <IconMinus size={16} />
                </button>
            </div>
            {localCategories.map((cat, i) => (
                <CategoryCard
                    key={cat._tempId || i}
                    category={cat}
                    index={i}
                    onChange={(updated) => updateCategory(i, updated)}
                    onRemove={() => removeCategory(i)}
                />
            ))}
            <button
                type="button"
                className="inline-flex items-center gap-1.5 self-start rounded-lg border bg-success-bg text-success-text border-success-border px-3 py-1.5 text-sm font-medium transition-colors hover:enabled:bg-success-bg hover:enabled:border-success-text"
                onClick={addCategory}
            >
                <IconPlus size={14} />
                Thêm nhóm
            </button>
        </div>
    );
}

function CategoryCard({ category, index, onChange, onRemove }) {
    const addMeaning = () => {
        const nextMeanings = [
            ...(category.meanings ?? []),
            {
                _tempId: crypto.randomUUID(),
                vietMeanings: "",
                engMeanings: "",
                examples: [],
            },
        ];
        onChange({ meanings: nextMeanings });
    };

    const updateMeaning = (mIdx, updated) => {
        const nextMeanings = (category.meanings ?? []).map((m, i) => (i === mIdx ? { ...m, ...updated } : m));
        onChange({ meanings: nextMeanings });
    };

    const removeMeaning = (mIdx) => {
        const nextMeanings = (category.meanings ?? []).filter((_, i) => i !== mIdx);
        onChange({ meanings: nextMeanings });
    };

    return (
        <div className="rounded-xl border-2 border-accent-border/30 bg-bg p-4">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 flex-1 mr-2">
                    <span className="text-sm font-semibold text-violet-600 dark:text-violet-400 shrink-0">Nhóm:</span>
                    <input
                        className={cn(
                            "flex-1 min-w-0 max-w-48 rounded-md border border-border bg-surface px-2.5 py-1 text-sm font-semibold text-violet-600 dark:text-violet-400 outline-none transition-colors focus:border-accent-border",
                        )}
                        value={category.name ?? ""}
                        onChange={(e) => onChange({ name: e.target.value })}
                    />
                </div>
                <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-lg border bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-red-100 dark:hover:bg-red-900"
                    onClick={onRemove}
                    title="Xóa nhóm"
                >
                    <IconClose size={14} />
                    {category.name ? `Xóa nhóm: ${category.name}` : "Xóa nhóm"}
                </button>
            </div>
            {/* Meanings in this category */}
            <div className="flex flex-col gap-3 ml-2 pl-3 border-l-2 border-border/60">
                {(category.meanings ?? []).map((m, j) => (
                    <MeaningCard
                        key={m._tempId || j}
                        meaning={m}
                        index={j}
                        onChange={(updated) => updateMeaning(j, updated)}
                        onRemove={() => removeMeaning(j)}
                    />
                ))}
                <button
                    type="button"
                    className="inline-flex items-center gap-1.5 self-start rounded-lg border bg-success-bg text-success-text border-success-border px-3 py-1.5 text-sm font-medium transition-colors hover:enabled:bg-success-bg hover:enabled:border-success-text"
                    onClick={addMeaning}
                >
                    <IconPlus size={14} />
                    Thêm nghĩa
                </button>
            </div>
        </div>
    );
}

function MeaningCard({ meaning, index, onChange, onRemove }) {
    const [translating, setTranslating] = useState(false);
    const [convertingJpPy, setConvertingJpPy] = useState(null);
    const [showExamples, setShowExamples] = useState(false); // exIdx being converted

    const handleTranslateViToEn = async () => {
        const text = (meaning.vietMeanings ?? "").trim();
        if (!text || translating) return;
        setTranslating(true);
        try {
            const res = await api.translateViToEn(text);
            if (res?.translated) {
                onChange({ engMeanings: res.translated });
            }
        } catch (err) {
            console.error("Translate failed:", err);
        } finally {
            setTranslating(false);
        }
    };
    const addExample = () => {
        const nextExamples = [
            ...(meaning.examples ?? []),
            {
                _tempId: crypto.randomUUID(),
                hanExample: "",
                jyutpingExample: "",
                pinyinExample: "",
                vietExamples: "",
                engExamples: "",
            },
        ];
        onChange({ examples: nextExamples });
    };

    const updateExample = (exIdx, updated) => {
        const nextExamples = (meaning.examples ?? []).map((ex, i) => (i === exIdx ? { ...ex, ...updated } : ex));
        onChange({ examples: nextExamples });
    };

    const handleConvertBoth = async (exIdx, text) => {
        const trimmed = (text ?? "").trim();
        if (!trimmed) return;
        setConvertingJpPy(exIdx);
        try {
            // Jyutping from traditional part (inside 【】) if present
            const tradMatch = trimmed.match(/【(.+?)】/);
            const tradSource = tradMatch ? tradMatch[1].trim() : trimmed;
            // Pinyin from simplified part (before 【) if present
            const simpMatch = trimmed.match(/^(.+?)【/);
            const simpSource = simpMatch ? simpMatch[1].trim() : trimmed;

            const [jpRes, pyRes] = await Promise.all([
                tradSource ? api.toJyutping(tradSource) : Promise.resolve(null),
                simpSource ? api.toPinyin(simpSource) : Promise.resolve(null),
            ]);

            const updates = {};
            if (jpRes?.jyutping) updates.jyutpingExample = jpRes.jyutping;
            if (pyRes?.pinyin) updates.pinyinExample = pyRes.pinyin;
            if (Object.keys(updates).length > 0) {
                updateExample(exIdx, updates);
            }
        } catch {
            // silently fail
        } finally {
            setConvertingJpPy(null);
        }
    };

    const removeExample = (exIdx) => {
        const nextExamples = (meaning.examples ?? []).filter((_, i) => i !== exIdx);
        onChange({ examples: nextExamples });
    };

    return (
        <div className="rounded-xl border border-border bg-surface p-3">
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-accent">{index + 1}.</span>
                <button
                    type="button"
                    className="inline-flex items-center justify-center size-6 rounded border bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900 transition-colors"
                    onClick={onRemove}
                    title="Xóa nghĩa"
                >
                    <IconClose size={12} />
                </button>
            </div>
            {/* Line 1: Vietnamese meaning */}
            <label className="flex flex-col gap-0.5 mb-2">
                <div className="flex items-center justify-between">
                    <span className="text-[0.7rem] text-accent font-semibold">Vietnamese meaning</span>
                    <button
                        type="button"
                        className={cn(
                            "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.65rem] font-medium transition-colors",
                            translating ? "text-text-muted cursor-not-allowed" : "text-accent hover:bg-accent/10",
                        )}
                        onClick={handleTranslateViToEn}
                        disabled={translating || !(meaning.vietMeanings ?? "").trim()}
                        title="Dịch sang tiếng Anh (DeepL)"
                    >
                        {translating ? <IconSpinner size={14} /> : <IconGlobe size={14} />}
                        EN
                    </button>
                </div>
                <textarea
                    className={cn(textareaClass, "text-viet font-medium")}
                    rows={2}
                    value={meaning.vietMeanings ?? ""}
                    onChange={(e) => onChange({ vietMeanings: e.target.value })}
                />
            </label>
            {/* Line 2: English meaning (replaces Chinese definition) */}
            <label className="flex flex-col gap-0.5 mb-2">
                <span className="text-[0.7rem] text-accent font-semibold">English meaning</span>
                <textarea
                    className={cn(textareaClass, "text-blue-600 dark:text-blue-400")}
                    rows={2}
                    value={meaning.engMeanings ?? ""}
                    onChange={(e) => onChange({ engMeanings: e.target.value })}
                />
            </label>

            {/* Examples for this meaning */}
            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <button
                        type="button"
                        className="inline-flex items-center gap-1 text-xs text-accent font-semibold hover:underline"
                        onClick={() => setShowExamples((v) => !v)}
                    >
                        {showExamples ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
                        Examples
                    </button>
                    <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-md border bg-success-bg text-success-text border-success-border px-2 py-1 text-xs font-medium transition-colors hover:enabled:bg-success-bg hover:enabled:border-success-text"
                        onClick={() => {
                            if (!showExamples) setShowExamples(true);
                            addExample();
                        }}
                    >
                        <IconPlus size={10} />
                        Thêm ví dụ
                    </button>
                </div>
                {showExamples && (
                    <>
                        {(meaning.examples ?? []).map((ex, j) => (
                            <div key={ex._tempId || j} className="rounded-lg border border-border/60 bg-bg p-2.5">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[0.7rem] text-accent font-semibold">Ví dụ {j + 1}</span>
                                    <button
                                        type="button"
                                        className="inline-flex items-center justify-center size-6 rounded border bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900 transition-colors"
                                        onClick={() => removeExample(j)}
                                        title="Xóa ví dụ"
                                    >
                                        <IconClose size={10} />
                                    </button>
                                </div>
                                <label className="flex flex-col gap-0.5 mb-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[0.65rem] text-accent font-semibold">Chinese</span>
                                        <button
                                            type="button"
                                            className={cn(
                                                "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.65rem] font-medium transition-colors",
                                                convertingJpPy === j
                                                    ? "text-text-muted cursor-not-allowed"
                                                    : (ex.hanExample ?? "").trim()
                                                      ? "text-accent hover:bg-accent/10"
                                                      : "text-text-muted",
                                            )}
                                            onClick={() => handleConvertBoth(j, ex.hanExample ?? "")}
                                            disabled={convertingJpPy === j || !(ex.hanExample ?? "").trim()}
                                            title="Tự động điền Jyutping & Pinyin"
                                        >
                                            {convertingJpPy === j ? (
                                                <IconSpinner size={14} />
                                            ) : (
                                                <IconSpeech size={14} />
                                            )}
                                            JP+PY
                                        </button>
                                    </div>
                                    <textarea
                                        className={cn(textareaClass, "text-red-600 dark:text-red-400")}
                                        rows={2}
                                        value={ex.hanExample ?? ""}
                                        onChange={(e) => updateExample(j, { hanExample: e.target.value })}
                                    />
                                </label>
                                <label className="flex flex-col gap-0.5 mb-2">
                                    <span className="text-[0.65rem] text-accent font-semibold">Pinyin</span>
                                    <input
                                        className={cn(uiInputClass, "text-pinyin text-sm")}
                                        value={ex.pinyinExample ?? ""}
                                        onChange={(e) => updateExample(j, { pinyinExample: e.target.value })}
                                    />
                                </label>
                                <label className="flex flex-col gap-0.5 mb-2">
                                    <span className="text-[0.65rem] text-accent font-semibold">Jyutping</span>
                                    <input
                                        className={cn(uiInputClass, "text-jyutping font-semibold text-sm")}
                                        value={ex.jyutpingExample ?? ""}
                                        onChange={(e) => updateExample(j, { jyutpingExample: e.target.value })}
                                    />
                                </label>
                                <label className="flex flex-col gap-0.5">
                                    <span className="text-[0.65rem] text-accent font-semibold">Vietnamese</span>
                                    <input
                                        className={cn(uiInputClass, "text-viet text-sm")}
                                        value={ex.vietExamples ?? ""}
                                        onChange={(e) => updateExample(j, { vietExamples: e.target.value })}
                                    />
                                </label>
                            </div>
                        ))}
                    </>
                )}
            </div>
        </div>
    );
}
