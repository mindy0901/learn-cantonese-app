import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { cn } from "../lib/cn.js";
import { Button, IconButton } from "./ui/Button.jsx";
import { uiInputClass } from "./ui/controlStyles.js";
import { useLocale } from "../store/localeStore.js";
import { vocabularyLookupDisplay } from "../lib/hanLookup.js";
import { diffHanChars } from "../lib/hanScriptDisplay.js";
import { WordPopularityPicker } from "./WordPopularityPicker.jsx";
import { WordSentenceSuggestions } from "./WordSentenceSuggestions.jsx";
import { WordFieldText } from "./WordFieldText.jsx";
import { buildVocabularyDraft, vocabularyDraftPayload } from "./WordEditFields.jsx";
import { MeaningsEditor } from "./WordEditFields.jsx";
import { TagInput } from "./TagInput.jsx";
import { normalizePopularity } from "../lib/wordPopularity.js";
import { normalizeVocabularyFields, vocabularyContentEqual } from "../lib/wordNormalize.js";
import { useHanCharacters } from "../store/appStore.js";
import { useVocabularies } from "../store/appStore.js";
import { hanCharacterDetailPath } from "../lib/hanCharacterRoutes.js";
import { hanziiWordUrl } from "../lib/hanzii.js";
import { IconMinus } from "./NavIcons.jsx";

const detailTextClass = "wd-text m-0 max-w-full leading-normal break-normal";

const fieldStackClass = "word-detail-content flex w-full min-w-0 flex-col gap-4";

const valueShellClass = "w-full min-w-0";

const subLabelClass = "wd-sub m-0 font-semibold uppercase tracking-wide text-text-muted text-center";

const hanShellClass =
    "w-full rounded-xl border border-border/80 bg-surface/80 px-6 py-4 sm:px-8 sm:py-4 shadow-theme-sm";

/** Color-coded HSK level badge: green (1-2) → yellow (3-4) → orange (5-6) → red (7-9) */
function hskLevelBadgeClass(level) {
    const match = String(level).match(/(\d+)/);
    const num = match ? parseInt(match[1], 10) : 0;
    if (num <= 2)
        return "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800";
    if (num <= 4)
        return "bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800";
    if (num <= 6)
        return "bg-orange-50 dark:bg-orange-950 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800";
    return "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800";
}

const hanGridClass = "grid grid-cols-1 items-stretch sm:grid-cols-2 sm:gap-6";

const hanCellClass = "flex h-full min-h-0 flex-col gap-4 items-center";

const hanCellBodyClass = "wd-han-cell-body flex flex-1 flex-col justify-center items-center gap-2";

const hanGlyphClass = "wd-han block text-[clamp(3rem,8vw,7rem)] leading-none";

const romanLineClass = cn(detailTextClass, "wd-roman font-semibold not-italic tracking-wide text-jyutping");

const pinyinLineClass = cn(detailTextClass, "wd-roman font-semibold not-italic tracking-wide text-pinyin");

const wordDetailInputClass = cn(uiInputClass, "wd-input");

/** Highlight characters in text that match the vocabulary word's hanTraditional */
function highlightVocabChars(exampleText, hanTraditional) {
    if (!exampleText || !hanTraditional) return exampleText;
    const chars = [...hanTraditional].filter((ch) => /\p{Script=Han}/u.test(ch));
    if (chars.length === 0) return exampleText;
    const pattern = chars.map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const regex = new RegExp(`(${pattern})`, "gu");
    const parts = exampleText.split(regex);
    return parts.map((part, i) => {
        if (regex.test(part)) {
            regex.lastIndex = 0; // reset after test
            return (
                <mark
                    key={i}
                    className="bg-yellow-200 dark:bg-yellow-800 text-yellow-900 dark:text-yellow-100 rounded px-0.5"
                >
                    {part}
                </mark>
            );
        }
        return part;
    });
}

/** Parse Hán-Việt into tokens — same logic as WordRow */
function parseSinoVietnameseTokens(raw) {
    const parts = String(raw ?? "")
        .split(/\s+/)
        .filter(Boolean);
    const merged = [];
    let i = 0;
    while (i < parts.length) {
        if (parts[i] === "|" || parts[i] === "/" || parts[i] === ",") {
            if (merged.length > 0) merged[merged.length - 1] += " " + parts[i];
            i++;
            while (i < parts.length && parts[i] !== "|" && parts[i] !== "/" && parts[i] !== ",") {
                merged[merged.length - 1] += " " + parts[i];
                i++;
            }
        } else {
            merged.push(parts[i]);
            i++;
        }
    }
    return merged;
}

/** Split comma/slash-separated string into tokens */
function splitPronunciation(raw) {
    return String(raw ?? "")
        .split(/[,\/、]+/)
        .map((s) => s.trim())
        .filter(Boolean);
}

const actionBarClass = "grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2 min-h-10";

const masteredBtnClass = (mastered) =>
    cn(
        "transition-[color,background-color,border-color,box-shadow,transform] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
        "active:enabled:scale-[0.98]",
        mastered
            ? "shadow-[0_1px_4px_color-mix(in_srgb,var(--success-text)_18%,transparent)] ring-1 ring-success-border/50"
            : "text-text-muted hover:enabled:border-text-muted/40 hover:enabled:text-text-h",
    );

function DetailField({ valueMinHeight, children }) {
    return <div className={cn(valueShellClass, valueMinHeight, "flex flex-col justify-center")}>{children}</div>;
}

/**
 * Per-character breakdown of a vocabulary (from `vocabulary.hanCharacters`).
 * Renders each han character with its aligned pinyin/jyutping, linking to the
 * HanCharacter detail page where a matching han character exists.
 */
function HanCharactersBreakdown({ vocabulary }) {
    const { t } = useLocale();
    const navigate = useNavigate();
    const hanCharacters = useHanCharacters();
    const breakdown = vocabulary.hanCharacters;

    const list = useMemo(() => {
        if (!Array.isArray(breakdown) || breakdown.length === 0) return [];
        return breakdown.map((item, i) => {
            const ch = String(item?.character ?? "").trim();
            if (!ch) return null;
            const simp = String(item?.hanSimplified ?? "").trim() || undefined;
            const hanId = hanCharacters.find(
                (h) =>
                    (h.hanSimplified ?? "") === ch ||
                    (h.hanTraditional ?? "") === ch ||
                    (simp && (h.hanSimplified ?? "") === simp),
            )?.id;
            return {
                key: `${ch}-${i}`,
                character: ch,
                hanSimplified: simp && simp !== ch ? simp : undefined,
                pinyin: String(item?.pinyin ?? "").trim() || null,
                jyutping: String(item?.jyutping ?? "").trim() || null,
                hanId,
            };
        });
    }, [breakdown, hanCharacters]);

    if (list.length === 0) return null;

    return (
        <div className="w-full rounded-xl border border-border/60 bg-surface/80 px-4 py-4 shadow-theme-sm">
            <p className={cn(subLabelClass, "mb-4")}>{t.wordBank?.colHanCharacters ?? "Han Characters"}</p>
            <div className="flex flex-wrap justify-center gap-2">
                {list.map((item) => {
                    const cell = (
                        <div className="flex min-w-14 flex-col items-center gap-1 rounded-lg border border-border/70 bg-bg px-3 py-2 transition-colors">
                            <span className="flex items-baseline justify-center gap-0.5 leading-none">
                                {item.hanSimplified ? (
                                    <>
                                        <span
                                            className={cn(
                                                detailTextClass,
                                                "wd-roman font-semibold not-italic tracking-wide text-3xl leading-none",
                                                "text-red-600 dark:text-red-400",
                                            )}
                                        >
                                            {item.character}
                                        </span>
                                        <span
                                            className={cn(
                                                detailTextClass,
                                                "wd-roman font-semibold not-italic tracking-wide text-2xl leading-none",
                                                "text-blue-600 dark:text-blue-400",
                                            )}
                                        >
                                            {item.hanSimplified}
                                        </span>
                                    </>
                                ) : (
                                    <span
                                        className={cn(
                                            detailTextClass,
                                            "wd-roman font-semibold not-italic tracking-wide text-3xl leading-none",
                                            "text-red-600 dark:text-red-400",
                                        )}
                                    >
                                        {item.character}
                                    </span>
                                )}
                            </span>
                            <span className="text-xs text-pinyin font-medium leading-tight">{item.pinyin || "-"}</span>
                            <span className="text-xs text-jyutping font-medium leading-tight">
                                {item.jyutping || "-"}
                            </span>
                        </div>
                    );
                    return item.hanId ? (
                        <button
                            key={item.key}
                            type="button"
                            className="cursor-pointer rounded-lg border-0 bg-transparent p-0 transition-opacity duration-150 hover:opacity-80 focus:outline-2 focus:outline-accent focus:outline-offset-2"
                            title={`${item.character}${item.hanSimplified ? `/${item.hanSimplified}` : ""} — ${t.hanCharacters?.viewDetail ?? "View details"}`}
                            onClick={() => navigate(hanCharacterDetailPath(item.hanId))}
                        >
                            {cell}
                        </button>
                    ) : (
                        <div key={item.key}>{cell}</div>
                    );
                })}
            </div>
        </div>
    );
}

function HanSubField({ label, children }) {
    return (
        <div className={hanCellClass}>
            <p className={subLabelClass}>{label}</p>
            <div className={hanCellBodyClass}>{children}</div>
        </div>
    );
}

/**
 * Read-only lexicon metadata sourced from xue-hanzi-dictionary.json:
 * related words (tw) and numeric stats
 * (boost, movieWordRank, bookWordRank, pinyinNumeric, searchPinyin).
 */
function LexiconInfo({ vocabulary, t }) {
    const relatedWords = Array.isArray(vocabulary.relatedWords) ? vocabulary.relatedWords : [];
    const meta = [
        { label: t.wordDetail.pinyinNumeric, value: vocabulary.pinyinNumeric },
        { label: t.wordDetail.searchPinyin, value: vocabulary.searchPinyin },
        { label: t.wordDetail.boost, value: vocabulary.boost },
        { label: t.wordDetail.movieWordRank, value: vocabulary.movieWordRank },
        { label: t.wordDetail.bookWordRank, value: vocabulary.bookWordRank },
    ].filter((m) => m.value !== undefined && m.value !== null && m.value !== "");
    const hasMeta = meta.length > 0;

    if (relatedWords.length === 0 && !hasMeta) return null;

    return (
        <div className="w-full flex flex-col gap-4">
            {relatedWords.length > 0 && (
                <div className="rounded-xl border border-border/60 bg-surface p-4 shadow-theme-sm">
                    <h3 className="text-sm font-semibold text-violet-600 dark:text-violet-400 mb-4">
                        {t.wordDetail.relatedWords}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                        {relatedWords.map((rw, i) => (
                            <span
                                key={i}
                                className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-bg px-3 py-2 text-sm"
                            >
                                <span className="wd-han text-lg leading-none text-red-600 dark:text-red-400 font-semibold">
                                    {rw?.trad || rw?.word}
                                </span>
                                <span className="text-xs text-text-muted">{rw?.gloss || rw?.word}</span>
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {hasMeta && (
                <div className="rounded-xl border border-border/60 bg-surface p-4 shadow-theme-sm">
                    <h3 className="text-sm font-semibold text-violet-600 dark:text-violet-400 mb-4">
                        {t.wordDetail.lexiconMetadata}
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {meta.map((m) => (
                            <div
                                key={m.label}
                                className="flex flex-col gap-0.5 rounded-lg border border-border/40 bg-bg px-3 py-2"
                            >
                                <span className="text-[10px] uppercase tracking-wide text-text-muted">{m.label}</span>
                                <span className="text-sm font-semibold text-text-h">{m.value}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function WordHanRomanBlock({
    editing,
    draft,
    display,
    onDraftChange,
    locale,
    hanTraditional,
    pinyin,
    jyutping,
    sinoVietnamese,
}) {
    const { t } = useLocale();
    const navigate = useNavigate();
    const hanCharacters = useHanCharacters();

    // Build a lookup map: character → hanCharacter id (prefer simplified match, fallback to traditional)
    const charIdMap = new Map();
    for (const hc of hanCharacters) {
        const simp = (hc.hanSimplified ?? "").trim();
        const trad = (hc.hanTraditional ?? "").trim();
        if (simp && !charIdMap.has(simp)) charIdMap.set(simp, hc.id);
        if (trad && trad !== simp && !charIdMap.has(trad)) charIdMap.set(trad, hc.id);
    }

    /** Render text as clickable han characters where possible */
    function renderHanText(text) {
        if (!text) return null;
        return [...text].map((ch, i) => {
            const hanId = charIdMap.get(ch);
            const isHan = /\p{Script=Han}/u.test(ch);
            if (hanId && isHan) {
                return (
                    <button
                        key={i}
                        type="button"
                        className="inline cursor-pointer border-0 bg-transparent p-0 font-inherit text-inherit leading-tight rounded transition-opacity duration-150 hover:opacity-80 focus:outline-2 focus:outline-accent focus:outline-offset-2"
                        onClick={(e) => {
                            e.stopPropagation();
                            navigate(hanCharacterDetailPath(hanId));
                        }}
                        title={`${ch} — ${t.hanCharacters?.viewDetail ?? "View details"}`}
                    >
                        {ch}
                    </button>
                );
            }
            return <span key={i}>{ch}</span>;
        });
    }

    /** Render text with per-character diff coloring (matches WordRow vocab table).
     *  Rule: same-as-traditional char → red (traditional), differing char → blue (simplified). */
    function renderHanWithDiff(text, diffChars) {
        if (!text) return null;
        const hasDiff = diffChars && diffChars.length > 0 && text.length > 1;
        if (!hasDiff) return renderHanText(text);
        return diffChars.map((c, i) => {
            const ch = c.char;
            const hanId = charIdMap.get(ch);
            const isHan = /\p{Script=Han}/u.test(ch);
            const tone = c.same ? "text-red-600 dark:text-red-400" : "text-blue-600 dark:text-blue-400";
            if (hanId && isHan) {
                return (
                    <button
                        key={i}
                        type="button"
                        className={cn(
                            "inline cursor-pointer border-0 bg-transparent p-0 font-inherit leading-tight rounded transition-opacity duration-150 hover:opacity-80 focus:outline-2 focus:outline-accent focus:outline-offset-2",
                            tone,
                        )}
                        onClick={(e) => {
                            e.stopPropagation();
                            navigate(hanCharacterDetailPath(hanId));
                        }}
                        title={`${ch} — ${t.hanCharacters?.viewDetail ?? "View details"}`}
                    >
                        {ch}
                    </button>
                );
            }
            return (
                <span key={i} className={tone}>
                    {ch}
                </span>
            );
        });
    }

    // When trad === simp, collapse to single column (common for characters like 人, 大, etc.)
    const same = display.traditional === (display.simplified || display.traditional);
    const hanDiff = same ? null : diffHanChars({ traditional: display.traditional, simplified: display.simplified });
    const gridClass = same ? "grid-cols-1" : "sm:grid-cols-2";
    const shellClass = same ? "py-4" : hanShellClass;

    if (editing) {
        const hanEditClass =
            "w-full px-2 py-4 font-semibold bg-transparent border-0 outline-none transition-colors focus:border-accent-border text-center";
        if (same) {
            return (
                <div className={shellClass}>
                    <div className="flex flex-col gap-4">
                        <input
                            className={cn(hanEditClass, "text-red-600 dark:text-red-400")}
                            style={{ fontSize: 48 }}
                            value={draft.hanTraditional}
                            onChange={(e) => onDraftChange("hanTraditional", e.target.value)}
                        />
                    </div>
                </div>
            );
        }
        return (
            <div className={shellClass}>
                <div className={cn(hanGridClass, gridClass)}>
                    <HanSubField label={t.hanLookup.traditionalHk}>
                        <input
                            className={cn(hanEditClass, "text-red-600 dark:text-red-400")}
                            style={{ fontSize: 48 }}
                            value={draft.hanTraditional}
                            onChange={(e) => onDraftChange("hanTraditional", e.target.value)}
                        />
                    </HanSubField>
                    <HanSubField label={t.wordBank.colHanSimplified}>
                        <input
                            className={cn(hanEditClass, "text-blue-600 dark:text-blue-400")}
                            style={{ fontSize: 48 }}
                            value={draft.hanSimplified ?? ""}
                            onChange={(e) => onDraftChange("hanSimplified", e.target.value)}
                        />
                    </HanSubField>
                </div>
            </div>
        );
    }

    if (same) {
        return (
            <div className={shellClass}>
                <div className="flex flex-col items-center gap-2">
                    {sinoVietnamese?.trim() && (
                        <span className={cn(pinyinLineClass, "text-viet font-medium")}>{sinoVietnamese}</span>
                    )}
                    <span className={cn(hanGlyphClass, "font-semibold text-red-600 dark:text-red-400")}>
                        {renderHanText(display.traditional)}
                    </span>
                    <div className="grid grid-cols-[auto_auto_auto] gap-4 items-center w-max max-w-full mx-auto">
                        <span className={cn(pinyinLineClass, "text-right")}>
                            {pinyin || <span className="italic text-text-muted">-</span>}
                        </span>
                        <span className="text-text-muted text-sm">|</span>
                        <span className={cn(romanLineClass, "text-left")}>
                            {jyutping || <span className="italic text-text-muted">-</span>}
                        </span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={shellClass}>
            {sinoVietnamese?.trim() && (
                <p className={cn(pinyinLineClass, "text-center mb-4 text-viet font-medium")}>{sinoVietnamese}</p>
            )}
            <div className={cn(hanGridClass, gridClass)}>
                <HanSubField label={t.hanLookup.traditionalHk}>
                    <span className={cn(hanGlyphClass, "font-semibold text-red-600 dark:text-red-400")}>
                        {renderHanText(display.traditional)}
                    </span>
                    <p className={cn(romanLineClass, "text-center mt-2")}>
                        {jyutping || <span className="italic text-text-muted">-</span>}
                    </p>
                </HanSubField>
                <HanSubField label={t.wordBank.colHanSimplified}>
                    <span className={cn(hanGlyphClass, "font-semibold")}>
                        {hanDiff
                            ? renderHanWithDiff(display.simplified || display.traditional, hanDiff.simp)
                            : renderHanText(display.simplified || display.traditional)}
                    </span>
                    <p className={cn(pinyinLineClass, "text-center mt-2")}>
                        {pinyin || <span className="italic text-text-muted">-</span>}
                    </p>
                </HanSubField>
            </div>
        </div>
    );
}

export function WordDetailContent({
    vocabulary,
    onToggleImportant,
    onToggleMastered,
    onSetPopularity,
    canEdit,
    onSave,
    onNextRandom,
    initialEditing = false,
    footerRef,
}) {
    const { t, locale } = useLocale();
    const display = vocabularyLookupDisplay(vocabulary);
    const vocabularies = useVocabularies();

    const [editing, setEditing] = useState(initialEditing);
    const [draft, setDraft] = useState(() => buildVocabularyDraft(vocabulary));
    const [validationError, setValidationError] = useState("");
    const [duplicateWarning, setDuplicateWarning] = useState(null);
    const [duplicateDetailOpen, setDuplicateDetailOpen] = useState(false);
    const [localPopularity, setLocalPopularity] = useState(() => normalizePopularity(vocabulary.popularity));
    const [pairCount, setPairCount] = useState(() => {
        const svLen = parseSinoVietnameseTokens(vocabulary.sinoVietnamese).length;
        const pyLen = String(vocabulary.pinyin ?? "")
            .split(/[,\/、]+/)
            .filter(Boolean).length;
        const jpLen = String(vocabulary.jyutping ?? "")
            .split(/\s+/)
            .filter(Boolean).length;
        return Math.max(svLen, pyLen, jpLen, 1);
    });
    const [expandedExamples, setExpandedExamples] = useState(new Set());
    const showPopularity = onSetPopularity || localPopularity !== null;

    useEffect(() => {
        setLocalPopularity(normalizePopularity(vocabulary.popularity));
        if (!editing) setDraft(buildVocabularyDraft(vocabulary));
    }, [vocabulary, editing]);

    // Duplicate check for add mode: warn if hanTraditional already exists
    const isAddMode = !vocabulary.hanTraditional?.trim();
    useEffect(() => {
        if (!isAddMode || !editing) {
            setDuplicateWarning(null);
            return;
        }
        const han = (draft.hanTraditional || "").trim();
        if (!han) {
            setDuplicateWarning(null);
            return;
        }
        const norm = han.replace(/\s+/g, "");
        const matches = vocabularies.filter((v) => (v.hanTraditional || "").replace(/\s+/g, "") === norm);
        if (matches.length > 0) {
            setDuplicateWarning(matches);
        } else {
            setDuplicateWarning(null);
        }
    }, [draft.hanTraditional, isAddMode, editing, vocabularies]);

    const setDraftField = (field, value) => {
        setDraft((d) => ({ ...d, [field]: value }));
        if (validationError) setValidationError("");
    };

    const handlePopularityChange = (level) => {
        const next = normalizePopularity(level);
        const prev = localPopularity;
        setLocalPopularity(next);
        const result = onSetPopularity?.(vocabulary, next);
        if (result?.then) {
            result.catch(() => setLocalPopularity(prev));
        }
    };

    const startEdit = () => {
        setDraft(buildVocabularyDraft(vocabulary));
        setValidationError("");
        const svLen = parseSinoVietnameseTokens(vocabulary.sinoVietnamese).length;
        const pyLen = String(vocabulary.pinyin ?? "")
            .split(/[,\/、]+/)
            .filter(Boolean).length;
        const jpLen = String(vocabulary.jyutping ?? "")
            .split(/\s+/)
            .filter(Boolean).length;
        setPairCount(Math.max(svLen, pyLen, jpLen, 1));
        setEditing(true);
    };

    const cancelEdit = () => {
        setDraft(buildVocabularyDraft(vocabulary));
        setValidationError("");
        setEditing(false);
    };

    const saveEdit = async () => {
        if (!draft.hanTraditional.trim() || (!(draft.jyutping ?? "").trim() && !(draft.pinyin ?? "").trim())) {
            setValidationError(t.addWord.requiredFields);
            return;
        }
        const payload = vocabularyDraftPayload(draft);
        if (vocabularyContentEqual(vocabulary, normalizeVocabularyFields({ ...vocabulary, ...payload }))) {
            setEditing(false);
            return;
        }
        try {
            await onSave?.(vocabulary, payload);
            setEditing(false);
        } catch (err) {
            setValidationError(err instanceof Error ? err.message : String(err));
        }
    };

    const handleFormKeyDown = (e) => {
        if (!editing) return;
        if (e.key === "Escape") {
            e.preventDefault();
            cancelEdit();
        } else if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") {
            e.preventDefault();
            saveEdit();
        }
    };

    const important = vocabulary.important;

    return (
        <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-4" onKeyDown={handleFormKeyDown}>
            <div className={cn(actionBarClass, "shrink-0")}>
                <div className="flex justify-start">
                    {onToggleImportant && !editing ? (
                        <IconButton
                            className={important ? "text-yellow-500" : "text-text-muted"}
                            onClick={() => onToggleImportant(vocabulary)}
                            aria-label={important ? t.wordBank.unmarkImportant : t.wordBank.markImportant}
                            title={important ? t.wordBank.unmarkImportant : t.wordBank.markImportant}
                            aria-pressed={important}
                        >
                            ★
                        </IconButton>
                    ) : null}
                </div>
                <div className="flex items-center gap-2">
                    {editing && vocabulary.hanTraditional?.trim() && (
                        <a
                            href={hanziiWordUrl(vocabulary.hanTraditional.trim(), locale)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(
                                "inline-flex items-center justify-center size-7 rounded-lg",
                                "text-xs font-bold no-underline",
                                "bg-surface border border-border text-text-muted",
                                "hover:border-accent-border hover:text-accent hover:bg-accent-bg",
                                "transition-all duration-200",
                            )}
                            title={`Look up "${vocabulary.hanTraditional.trim()}" on Hanzii`}
                        >
                            ⓘ
                        </a>
                    )}
                </div>
                <div className="flex justify-end items-center gap-2">
                    {!editing && vocabulary.hanTraditional?.trim() && (
                        <>
                            <a
                                href={hanziiWordUrl(vocabulary.hanTraditional.trim(), locale) ?? "#"}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center size-7 rounded-lg text-xs font-bold no-underline bg-surface border border-border text-text-muted hover:border-accent-border hover:text-accent hover:bg-accent-bg transition-all duration-200"
                                title={
                                    t.wordDetail.openHanzii?.replace(
                                        "{hanTraditional}",
                                        vocabulary.hanTraditional.trim(),
                                    ) ?? "Tra Hanzii"
                                }
                                aria-label={
                                    t.wordDetail.openHanzii?.replace(
                                        "{hanTraditional}",
                                        vocabulary.hanTraditional.trim(),
                                    ) ?? "Tra Hanzii"
                                }
                                onClick={(e) => e.stopPropagation()}
                            >
                                ⓘ
                            </a>
                            <a
                                href={`https://translate.google.com/?sl=yue&tl=vi&text=${encodeURIComponent(vocabulary.hanTraditional.trim())}&op=translate`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center size-7 rounded-lg text-xs font-bold no-underline bg-surface border border-border text-blue-600 hover:border-blue-400 hover:text-blue-700 hover:bg-blue-50 transition-all duration-200"
                                title={`Translate "${vocabulary.hanTraditional.trim()}" (Cantonese → Vietnamese)`}
                                aria-label={`Translate "${vocabulary.hanTraditional.trim()}" (Cantonese → Vietnamese)`}
                                onClick={(e) => e.stopPropagation()}
                            >
                                G
                            </a>
                        </>
                    )}
                    {editing ? (
                        <select
                            className="rounded-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm font-semibold px-4 py-2 outline-none cursor-pointer"
                            value={draft.hskLevel ?? ""}
                            onChange={(e) => setDraftField("hskLevel", e.target.value || undefined)}
                        >
                            <option value="">— Level —</option>
                            <option value="HSK 1">HSK 1</option>
                            <option value="HSK 2">HSK 2</option>
                            <option value="HSK 3">HSK 3</option>
                            <option value="HSK 4">HSK 4</option>
                            <option value="HSK 5">HSK 5</option>
                            <option value="HSK 6">HSK 6</option>
                            <option value="HSK 7-9">HSK 7-9</option>
                        </select>
                    ) : vocabulary.hskLevel ? (
                        <span
                            className={cn(
                                "inline-flex items-center px-4 py-2 text-sm font-semibold rounded-full border",
                                hskLevelBadgeClass(vocabulary.hskLevel),
                            )}
                        >
                            {vocabulary.hskLevel}
                        </span>
                    ) : null}
                </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-4">
                <div
                    className={cn(
                        "mx-auto flex w-full min-w-0 flex-1 flex-col justify-start items-center",
                        fieldStackClass,
                    )}
                >
                    <WordHanRomanBlock
                        editing={editing}
                        draft={draft}
                        display={display}
                        onDraftChange={setDraftField}
                        locale={locale}
                        hanTraditional={vocabulary.hanTraditional}
                        pinyin={vocabulary.pinyin}
                        jyutping={vocabulary.jyutping}
                        sinoVietnamese={vocabulary.sinoVietnamese}
                    />

                    {!editing && <HanCharactersBreakdown vocabulary={vocabulary} />}

                    {editing
                        ? (() => {
                              const svTokens = parseSinoVietnameseTokens(draft.sinoVietnamese);
                              const pyTokens = String(draft.pinyin ?? "")
                                  .split(/[,\/、]+/)
                                  .map((s) => s.trim());
                              const jpTokens = String(draft.jyutping ?? "")
                                  .split(/[,\/、]+/)
                                  .map((s) => (s.trim() === "-" ? "" : s.trim()));

                              const handlePairedChange = (idx, field, value) => {
                                  if (field === "sv") {
                                      const sv = [...Array(Math.max(idx + 1, pairCount))].map(
                                          (_, i) => svTokens[i] || "",
                                      );
                                      sv[idx] = value;
                                      setDraftField("sinoVietnamese", sv.join(" "));
                                  } else if (field === "py") {
                                      const py = [...Array(Math.max(idx + 1, pairCount))].map(
                                          (_, i) => pyTokens[i] || "",
                                      );
                                      py[idx] = value;
                                      setDraftField("pinyin", py.join(" / "));
                                  } else if (field === "jp") {
                                      const jp = [...Array(Math.max(idx + 1, pairCount))].map(
                                          (_, i) => jpTokens[i] || "",
                                      );
                                      jp[idx] = value || "-";
                                      setDraftField("jyutping", jp.map((v) => v || "-").join(" / "));
                                  }
                              };

                              const handleAddRow = (e) => {
                                  e.preventDefault();
                                  setPairCount((n) => n + 1);
                              };

                              const handleRemoveRow = (idx) => {
                                  if (pairCount <= 1) return;
                                  // Remove the slot from all three fields
                                  const sv = svTokens.filter((_, i) => i !== idx);
                                  const py = pyTokens.filter((_, i) => i !== idx);
                                  const jp = jpTokens.filter((_, i) => i !== idx);
                                  setDraftField("sinoVietnamese", sv.join(" "));
                                  setDraftField("pinyin", py.join(" / "));
                                  setDraftField("jyutping", jp.map((v) => v || "-").join(" / "));
                                  setPairCount((n) => n - 1);
                              };

                              return (
                                  <div className="w-full rounded-xl border border-border/80 bg-surface/80 px-4 py-4">
                                      <div className="grid gap-y-2" style={{ gridTemplateColumns: "1fr 1fr 1fr auto" }}>
                                          <p className={cn(subLabelClass, "text-center text-xs")}>
                                              {t.wordBank.colSinoVietnamese}
                                          </p>
                                          <p className={cn(subLabelClass, "text-center text-xs")}>
                                              {t.wordBank.colPinyin}
                                          </p>
                                          <p className={cn(subLabelClass, "text-center text-xs")}>
                                              {t.wordBank.colJyutping}
                                          </p>
                                          <span />
                                          {Array.from({ length: pairCount }, (_, i) => (
                                              <div key={i} className="contents">
                                                  <input
                                                      className={cn(
                                                          wordDetailInputClass,
                                                          "text-center rounded-none border-x-0 border-t-0",
                                                      )}
                                                      value={svTokens[i] || ""}
                                                      onChange={(e) => handlePairedChange(i, "sv", e.target.value)}
                                                  />
                                                  <input
                                                      className={cn(
                                                          wordDetailInputClass,
                                                          "text-center rounded-none border-x-0 border-t-0",
                                                      )}
                                                      value={pyTokens[i] || ""}
                                                      onChange={(e) => handlePairedChange(i, "py", e.target.value)}
                                                  />
                                                  <input
                                                      className={cn(
                                                          wordDetailInputClass,
                                                          "text-center rounded-none border-x-0 border-t-0",
                                                      )}
                                                      value={jpTokens[i] || ""}
                                                      onChange={(e) => handlePairedChange(i, "jp", e.target.value)}
                                                  />
                                                  {pairCount > 1 && (
                                                      <button
                                                          type="button"
                                                          className="inline-flex items-center justify-center size-6 rounded border bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900 transition-colors self-center"
                                                          onClick={() => handleRemoveRow(i)}
                                                          title="Delete row"
                                                      >
                                                          <IconMinus size={12} />
                                                      </button>
                                                  )}
                                              </div>
                                          ))}
                                      </div>
                                      <div className="pt-4 flex justify-center">
                                          <button
                                              type="button"
                                              className="inline-flex items-center gap-2 rounded-md border bg-success-bg text-success-text border-success-border px-2 py-2 text-xs font-medium transition-colors hover:enabled:bg-success-bg hover:enabled:border-success-text"
                                              onClick={handleAddRow}
                                          >
                                              <svg
                                                  width="10"
                                                  height="10"
                                                  viewBox="0 0 24 24"
                                                  fill="none"
                                                  stroke="currentColor"
                                                  strokeWidth="2.5"
                                                  strokeLinecap="round"
                                              >
                                                  <line x1="12" y1="5" x2="12" y2="19" />
                                                  <line x1="5" y1="12" x2="19" y2="12" />
                                              </svg>
                                              Add row
                                          </button>
                                      </div>
                                  </div>
                              );
                          })()
                        : null}

                    {editing ? (
                        <div className="w-full">
                            <MeaningsEditor
                                meanings={draft.meanings ?? []}
                                onChange={(newMeanings) => setDraftField("meanings", newMeanings)}
                            />
                        </div>
                    ) : (vocabulary.meanings ?? []).length > 0 ? (
                        <div className="w-full flex flex-col gap-4">
                            {(() => {
                                const groups = new Map();
                                for (const m of vocabulary.meanings) {
                                    const cat = (m.category ?? "").trim() || "Meaning";
                                    if (!groups.has(cat)) groups.set(cat, []);
                                    groups.get(cat).push(m);
                                }
                                return [...groups.entries()].map(([category, items]) => (
                                    <div
                                        key={category}
                                        className="rounded-xl border border-border/60 bg-surface p-4 shadow-theme-sm"
                                    >
                                        <h3 className="text-sm font-semibold text-violet-600 dark:text-violet-400 mb-4">
                                            {category}
                                        </h3>
                                        <div className="flex flex-col gap-4">
                                            {items.map((m, i) => (
                                                <div key={m.id || i} className="pl-4 border-l-2 border-border/40">
                                                    <div className="flex items-baseline gap-2 mb-1">
                                                        <span className="text-xs font-semibold text-accent">
                                                            {i + 1}.
                                                        </span>
                                                        <span className="text-sm font-semibold text-viet">
                                                            {m.vietMeanings || "—"}
                                                        </span>
                                                    </div>
                                                    {m.engMeanings?.trim() && (
                                                        <div className="flex items-baseline gap-2 mb-1">
                                                            <span className="text-xs font-semibold invisible">1.</span>
                                                            <span className="text-sm text-blue-600 dark:text-blue-400">
                                                                {m.engMeanings}
                                                            </span>
                                                        </div>
                                                    )}
                                                    {(m.examples ?? []).length > 0 && (
                                                        <div className="mt-2 ml-4">
                                                            <button
                                                                type="button"
                                                                className="inline-flex items-center gap-2 text-xs text-accent font-semibold hover:underline mb-2"
                                                                onClick={() =>
                                                                    setExpandedExamples((prev) => {
                                                                        const next = new Set(prev);
                                                                        const key = m.id || i;
                                                                        if (next.has(key)) next.delete(key);
                                                                        else next.add(key);
                                                                        return next;
                                                                    })
                                                                }
                                                            >
                                                                {expandedExamples.has(m.id || i) ? "▾" : "▸"} Examples (
                                                                {(m.examples ?? []).length})
                                                            </button>
                                                            {expandedExamples.has(m.id || i) && (
                                                                <div className="flex flex-col gap-2">
                                                                    {m.examples.map((ex, j) => (
                                                                        <div
                                                                            key={ex.id || j}
                                                                            className="rounded-lg border border-border/40 bg-surface p-4"
                                                                        >
                                                                            {ex.hanExample?.trim() && (
                                                                                <p className="text-sm text-red-600 dark:text-red-400 mb-1">
                                                                                    {highlightVocabChars(
                                                                                        ex.hanExample,
                                                                                        vocabulary.hanTraditional,
                                                                                    )}
                                                                                </p>
                                                                            )}
                                                                            {ex.pinyinExample?.trim() && (
                                                                                <p className="text-xs text-pinyin font-semibold mb-1">
                                                                                    {ex.pinyinExample}
                                                                                </p>
                                                                            )}
                                                                            {ex.jyutpingExample?.trim() && (
                                                                                <p className="text-xs text-jyutping font-semibold mb-1">
                                                                                    {ex.jyutpingExample}
                                                                                </p>
                                                                            )}
                                                                            {ex.vietExamples?.trim() && (
                                                                                <p className="text-sm text-viet">
                                                                                    {ex.vietExamples}
                                                                                </p>
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ));
                            })()}
                        </div>
                    ) : (vocabulary.vietMeanings ?? "").trim() || (vocabulary.engMeanings ?? "").trim() ? (
                        <div className="w-full flex flex-col gap-4">
                            <div className="rounded-xl border border-border/60 bg-surface p-4 shadow-theme-sm">
                                <h3 className="text-sm font-semibold text-violet-600 dark:text-violet-400 mb-4">
                                    Meaning
                                </h3>
                                <div className="flex flex-col gap-4 pl-4 border-l-2 border-border/40">
                                    {(vocabulary.vietMeanings ?? "").trim() && (
                                        <span className="text-sm font-semibold text-viet">
                                            {vocabulary.vietMeanings}
                                        </span>
                                    )}
                                    {(vocabulary.engMeanings ?? "").trim() && (
                                        <span className="text-sm text-blue-600 dark:text-blue-400">
                                            {vocabulary.engMeanings}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : canEdit ? (
                        <p className="text-sm text-text-muted italic py-2">
                            No meanings or examples yet. Press <strong>Edit</strong> to add.
                        </p>
                    ) : null}

                    {duplicateWarning && editing && (
                        <button
                            type="button"
                            className="m-0 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-4 text-sm text-left hover:bg-yellow-500/20 transition-colors cursor-pointer"
                            onClick={() => setDuplicateDetailOpen(true)}
                        >
                            <p className="text-yellow-600 dark:text-yellow-400 font-medium">
                                ⚠ This entry already exists in the bank ({duplicateWarning.length} records) — Click to
                                view details
                            </p>
                        </button>
                    )}

                    {duplicateDetailOpen && duplicateWarning && (
                        <div
                            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4"
                            onClick={() => setDuplicateDetailOpen(false)}
                        >
                            <div
                                className="w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-2xl bg-surface shadow-xl p-6 flex flex-col gap-4"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="flex items-center justify-between">
                                    <p className="text-text-h font-semibold">
                                        Entry "{duplicateWarning[0].hanTraditional}" has {duplicateWarning.length}{" "}
                                        records
                                    </p>
                                    <button
                                        className="inline-flex items-center justify-center size-8 rounded-lg text-text-muted hover:bg-bg hover:text-text-h transition-colors"
                                        onClick={() => setDuplicateDetailOpen(false)}
                                    >
                                        <IconMinus size={16} />
                                    </button>
                                </div>
                                <div className="flex flex-col gap-4">
                                    {duplicateWarning.map((v, i) => (
                                        <div key={v.id} className="rounded-lg border border-border bg-bg p-4 text-sm">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-xs font-semibold text-text-muted">#{i + 1}</span>
                                                <span className="text-red-600 dark:text-red-400 font-semibold">
                                                    {v.hanTraditional}
                                                </span>
                                                {v.hskLevel && (
                                                    <span className="text-xs text-text-muted border border-border rounded-full px-2 py-0.5">
                                                        {v.hskLevel}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-text-muted">
                                                {v.pinyin && (
                                                    <span>
                                                        Pinyin:{" "}
                                                        <span className="text-pinyin font-medium">{v.pinyin}</span>
                                                    </span>
                                                )}
                                                {v.jyutping && (
                                                    <span>
                                                        Jyutping:{" "}
                                                        <span className="text-jyutping font-medium">{v.jyutping}</span>
                                                    </span>
                                                )}
                                                {v.sinoVietnamese && (
                                                    <span>
                                                        Sino-Vietnamese:{" "}
                                                        <span className="text-viet font-medium">
                                                            {v.sinoVietnamese}
                                                        </span>
                                                    </span>
                                                )}
                                            </div>
                                            {v.vietMeanings && (
                                                <p className="text-viet text-xs mt-2">{v.vietMeanings}</p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                <p className="text-sm text-text-muted">
                                    You can still add a new pronunciation, or close this popup and edit the existing
                                    entry.
                                </p>
                            </div>
                        </div>
                    )}

                    {validationError && (
                        <p
                            className="m-0 rounded-lg border border-error-border bg-error-bg px-4 py-4 text-sm text-error-text"
                            role="alert"
                        >
                            {validationError}
                        </p>
                    )}
                </div>

                {!editing && <LexiconInfo vocabulary={vocabulary} t={t} />}

                <div className="mx-auto flex w-full min-w-0 flex-col gap-6">
                    <WordSentenceSuggestions word={vocabulary} />
                </div>
            </div>

            {(() => {
                const actionBar = (
                    <div className={cn(actionBarClass, "shrink-0 bg-surface pt-4 pb-4")}>
                        <div className="flex justify-start">
                            {canEdit && onSave && !editing && (
                                <Button variant="warning" onClick={startEdit}>
                                    {t.common.edit}
                                </Button>
                            )}
                            {canEdit && onSave && editing && (
                                <Button variant="danger" onClick={cancelEdit}>
                                    {t.common.cancel}
                                </Button>
                            )}
                        </div>

                        <div className="flex justify-center">
                            {showPopularity && !editing && (
                                <WordPopularityPicker
                                    value={localPopularity}
                                    disabled={!onSetPopularity}
                                    onChange={handlePopularityChange}
                                    compact
                                />
                            )}
                        </div>

                        <div className="flex justify-end">
                            {canEdit && onSave && editing && (
                                <Button variant="success" onClick={saveEdit}>
                                    {t.common.save}
                                </Button>
                            )}
                            {onNextRandom && !editing && (
                                <Button variant="ghost" onClick={onNextRandom}>
                                    {t.wordDetail.nextWord} →
                                </Button>
                            )}
                        </div>
                    </div>
                );
                if (footerRef?.current) return createPortal(actionBar, footerRef.current);
                return actionBar;
            })()}
        </div>
    );
}
