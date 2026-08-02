import { memo, useRef, useState, useEffect } from "react";
import { useLocale } from "../store/localeStore.js";
import { orderedHanVariants, displayRomanization, diffHanChars } from "../lib/hanScriptDisplay.js";
import { vocabularyLookupDisplay } from "../lib/hanLookup.js";
import { HanziiHanCellLink } from "./HanziiHanCellLink.jsx";
import { WordFieldText } from "./WordFieldText.jsx";
import { cn } from "../lib/cn.js";
import { uiCompactIconButtonClass } from "./ui/controlStyles.js";
import { IconViewDetail, IconEdit, IconTrash } from "./NavIcons.jsx";

const tdClass = "px-5 py-2.5 text-left align-middle truncate max-w-[200px]";

const rowClass = "border-b border-border";

// Highlight color for characters that are the same as traditional (not simplified)
const hanDiffClass = "text-red-600 dark:text-red-400";

/**
 * Renders a han variant (simp or trad) with per-character diff highlighting.
 * Links to Hanzii using the simplified form for lookups.
 */
function HanVariantCell({ text, diffChars, pickerMode, lookupSimp, className }) {
    if (!text) return <span className={cn(className, "italic text-text-muted")}>pending</span>;

    const hasDiff = diffChars && diffChars.length > 0 && text.length > 1;

    if (!hasDiff) {
        if (pickerMode) {
            return <span className={cn("text-han font-semibold", className)}>{text}</span>;
        }
        return (
            <HanziiHanCellLink
                hanTraditional={lookupSimp || text}
                displayText={text}
                emphasis="primary"
                className={className}
            />
        );
    }

    const inner = diffChars.map((c, i) => (
        <span key={i} className={cn(!c.same ? "text-blue-600 dark:text-blue-400" : hanDiffClass)}>
            {c.char}
        </span>
    ));

    if (pickerMode) {
        return <span className={cn("text-han font-semibold", className)}>{inner}</span>;
    }
    return (
        <HanziiHanCellLink
            hanTraditional={lookupSimp || text}
            displayText={text}
            emphasis="primary"
            className={className}
        >
            {inner}
        </HanziiHanCellLink>
    );
}

/** Map HSK level string to a color class. Green (low) → Red (high). */
function hskColorClass(level) {
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

export const WordRow = memo(function WordRow({
    word,
    index,
    canMark,
    pickerMode,
    selected,
    onToggleSelect,
    onToggleImportant,
    onToggleMastered,
    onView,
    onEdit,
    onDelete,
}) {
    const { t, locale } = useLocale();
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef(null);
    const buttonRef = useRef(null);
    const [menuPos, setMenuPos] = useState(null);

    const updateMenuPos = () => {
        const rect = buttonRef.current?.getBoundingClientRect();
        if (rect) {
            setMenuPos({ top: rect.bottom + 4, left: Math.max(rect.right - 180, 8) });
        }
    };

    useEffect(() => {
        if (!menuOpen) {
            setMenuPos(null);
            return;
        }
        updateMenuPos();
        const handleClick = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
        };
        document.addEventListener("mousedown", handleClick);
        window.addEventListener("scroll", updateMenuPos, true);
        window.addEventListener("resize", updateMenuPos);
        return () => {
            document.removeEventListener("mousedown", handleClick);
            window.removeEventListener("scroll", updateMenuPos, true);
            window.removeEventListener("resize", updateMenuPos);
        };
    }, [menuOpen]);

    const stop = (e) => e.stopPropagation();

    const numClass = cn(
        "text-text-muted text-[0.8125rem] whitespace-nowrap text-center px-1.5 align-middle",
        !pickerMode && "pr-0.5",
    );

    const flagColClass = "px-0.5 py-1.5 text-center align-middle [&:nth-child(2)]:pl-0 [&:nth-child(2)]:pr-1";

    const hanDisplay = vocabularyLookupDisplay(word);
    const hanOrdered = orderedHanVariants({
        traditional: hanDisplay.traditional,
        simplified: hanDisplay.simplified,
    });
    const hanLookup = hanDisplay.traditional || hanDisplay.simplified;
    const romanization = displayRomanization(word);
    const romanClass = "text-jyutping font-semibold not-italic leading-snug tracking-wide truncate";

    // Parse tokens for vertical paired display.
    // Space-separated Hán-Việt = separate character slots.
    // "|" with surrounding spaces = alternative readings of the SAME character → keep on one line.
    function parseSinoVietnameseTokens(raw) {
        const parts = String(raw ?? "")
            .split(/\s+/)
            .filter(Boolean);
        const merged = [];
        let i = 0;
        while (i < parts.length) {
            if (parts[i] === "|" || parts[i] === "/" || parts[i] === ",") {
                // Merge delimiter with previous token
                if (merged.length > 0) {
                    merged[merged.length - 1] += " " + parts[i];
                }
                i++;
                // Merge following tokens until next delimiter or end
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

    const svTokens = parseSinoVietnameseTokens(word.sinoVietnamese);
    const pyTokens = (word.pinyin ?? "").split(/[,\s]+/).filter(Boolean);
    const jpTokens = (word.jyutping ?? "").split(/\s+/).filter(Boolean);

    const hanCharCount = (hanLookup ?? "").length;
    const maxTokens = Math.max(svTokens.length, pyTokens.length, jpTokens.length);

    // Diff between trad/simp for highlighting
    const hanDiff = diffHanChars({
        traditional: hanDisplay.traditional,
        simplified: hanDisplay.simplified,
    });

    // Number of reading variants. For single-char, each token = one variant.
    // For compound words, tokens come in groups of hanCharCount per variant.
    const variantCount = hanCharCount > 1 && maxTokens > 0 ? Math.round(maxTokens / hanCharCount) : maxTokens;

    // Single-char: vertical when multiple pronunciations.
    // Multi-char: vertical when multiple reading variants exist.
    const useVertical = variantCount > 1;

    const pairCount = useVertical ? Math.max(variantCount, 1) : 1;

    // For a given row index (variant), collect tokens for all chars in that variant.
    // e.g. 丈夫 with 2 chars, 2 variants: variant 0 → tokens[0,1], variant 1 → tokens[2,3]
    function variantTokens(tokens, variantIdx) {
        if (hanCharCount === 1) return tokens[variantIdx] || "";
        const start = variantIdx * hanCharCount;
        const slice = tokens.slice(start, start + hanCharCount);
        return slice.join(" ");
    }

    return (
        <tr
            data-word-id={String(word.id)}
            className={cn(
                rowClass,
                pickerMode && "cursor-pointer hover:bg-bg",
                pickerMode && selected && "bg-accent-bg hover:bg-accent-bg",
                word.important && "bg-orange-600/[0.04]",
                word.mastered && "opacity-75",
            )}
            onClick={pickerMode ? () => onToggleSelect?.(String(word.id)) : undefined}
        >
            {pickerMode ? (
                <td className="text-center align-middle">
                    <input
                        type="checkbox"
                        className="m-0 cursor-pointer"
                        checked={!!selected}
                        readOnly
                        tabIndex={-1}
                        aria-hidden="true"
                    />
                </td>
            ) : (
                <td className={numClass}>{index + 1}</td>
            )}
            {canMark && (
                <td className={flagColClass} onClick={stop}>
                    <button
                        type="button"
                        className={cn(
                            uiCompactIconButtonClass,
                            "size-6 text-lg",
                            word.important ? "text-yellow-500" : "text-border",
                        )}
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleImportant(word);
                        }}
                        title={word.important ? t.wordBank.unmarkImportant : t.wordBank.markImportant}
                        aria-label={word.important ? t.wordBank.unmarkImportant : t.wordBank.markImportant}
                    >
                        ★
                    </button>
                </td>
            )}
            <td className={cn(tdClass, "py-0.5 align-middle w-[120px]")}>
                {useVertical ? (
                    Array.from({ length: pairCount }, (_, i) => {
                        const sv = variantTokens(svTokens, i);
                        return (
                            <div key={i} className="leading-snug py-0.5">
                                <span className="text-viet text-base uppercase">{sv || "\u00A0"}</span>
                            </div>
                        );
                    })
                ) : (
                    <div className="leading-snug py-1">
                        <span className="text-viet text-base uppercase">
                            <WordFieldText
                                word={word}
                                field="sinoVietnamese"
                                updatingLabel={t.wordBank.fieldUpdating}
                            />
                        </span>
                    </div>
                )}
            </td>
            <td className="py-1.5 align-middle" colSpan={4}>
                {useVertical ? (
                    <div className="flex flex-col gap-0.5">
                        {Array.from({ length: pairCount }, (_, i) => {
                            const py = variantTokens(pyTokens, i);
                            const jp = variantTokens(jpTokens, i);
                            return hanDisplay.showSimplified ? (
                                <div
                                    key={i}
                                    className="grid grid-cols-2 gap-x-3 gap-y-1 py-0.5 items-end whitespace-nowrap"
                                >
                                    <HanVariantCell
                                        text={hanDisplay.traditional}
                                        diffChars={undefined}
                                        pickerMode={pickerMode}
                                        lookupSimp={hanDisplay.simplified}
                                        className="text-5xl text-center text-red-600 dark:text-red-400"
                                    />
                                    <HanVariantCell
                                        text={hanDisplay.simplified}
                                        diffChars={hanDiff.simp}
                                        pickerMode={pickerMode}
                                        lookupSimp={hanDisplay.simplified}
                                        className="text-5xl text-center text-blue-600 dark:text-blue-400"
                                    />
                                    <span className="text-pinyin text-base text-center font-semibold">
                                        {py || "\u00A0"}
                                    </span>
                                    <span className={cn(romanClass, "text-center")}>{jp || "\u00A0"}</span>
                                </div>
                            ) : (
                                <div key={i} className="flex flex-col items-center gap-1 py-0.5 whitespace-nowrap">
                                    {pickerMode ? (
                                        <span className="text-han text-5xl font-semibold text-red-600 dark:text-red-400">
                                            {hanDisplay.traditional}
                                        </span>
                                    ) : (
                                        <HanziiHanCellLink
                                            hanTraditional={hanLookup}
                                            displayText={hanDisplay.traditional}
                                            emphasis="primary"
                                            className="text-5xl"
                                        />
                                    )}
                                    <div className="flex items-center gap-2">
                                        <span className="text-pinyin text-base font-semibold">{py || "\u00A0"}</span>
                                        <span className="text-text-muted text-sm">·</span>
                                        <span className={romanClass}>{jp || "\u00A0"}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : hanDisplay.showSimplified ? (
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 items-end whitespace-nowrap">
                        <HanVariantCell
                            text={hanOrdered.primary}
                            diffChars={undefined}
                            pickerMode={pickerMode}
                            lookupSimp={hanDisplay.simplified}
                            className="text-5xl text-center text-red-600 dark:text-red-400"
                        />
                        <HanVariantCell
                            text={hanDisplay.simplified}
                            diffChars={hanDiff.simp}
                            pickerMode={pickerMode}
                            lookupSimp={hanDisplay.simplified}
                            className="text-5xl text-center text-blue-600 dark:text-blue-400"
                        />
                        <span className="text-pinyin text-base text-center font-semibold">
                            {word.pinyin || <span className="italic text-text-muted">no pinyin</span>}
                        </span>
                        <span className={cn(romanClass, "text-center")}>
                            {romanization || <span className="italic text-text-muted">no jyutping</span>}
                        </span>
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-1 whitespace-nowrap">
                        {pickerMode ? (
                            <span className="text-han text-5xl font-semibold text-red-600 dark:text-red-400">
                                {hanOrdered.primary || <span className="italic text-text-muted text-sm">pending</span>}
                            </span>
                        ) : (
                            <HanziiHanCellLink
                                hanTraditional={hanLookup}
                                displayText={hanOrdered.primary}
                                emphasis="primary"
                                className="text-5xl text-red-600 dark:text-red-400"
                            />
                        )}
                        <div className="flex items-center gap-2">
                            <span className="text-pinyin text-base font-semibold">
                                {word.pinyin || <span className="italic text-text-muted">no pinyin</span>}
                            </span>
                            <span className="text-text-muted text-sm">·</span>
                            <span className={romanClass}>
                                {romanization || <span className="italic text-text-muted">no jyutping</span>}
                            </span>
                        </div>
                    </div>
                )}
            </td>
            {!pickerMode && (
                <>
                    <td className="px-5 py-2.5 align-middle max-w-[250px]" onClick={stop}>
                        <span className="text-viet text-sm line-clamp-2">
                            {word.vietMeanings ? (
                                word.vietMeanings
                            ) : (
                                <span className="italic text-text-muted">pending</span>
                            )}
                        </span>
                    </td>
                    <td className="px-5 py-2.5 align-middle max-w-[250px]" onClick={stop}>
                        <span className="text-sm line-clamp-2">
                            {word.engMeanings ? (
                                word.engMeanings
                            ) : (
                                <span className="italic text-text-muted">updating</span>
                            )}
                        </span>
                    </td>
                </>
            )}
            <td className="px-5 py-2.5 align-middle text-center">
                {word.hskLevel && /\d/.test(word.hskLevel) && !pickerMode ? (
                    <span
                        className={cn(
                            "inline-flex items-center justify-center h-5 text-xs font-semibold rounded-full border",
                            hskColorClass(word.hskLevel),
                        )}
                        style={{ minWidth: 82 }}
                    >
                        {word.hskLevel}
                    </span>
                ) : (
                    <span
                        className="inline-flex items-center justify-center h-5 text-xs text-text-muted"
                        style={{ minWidth: 82 }}
                    >
                        <span className="italic">pending</span>
                    </span>
                )}
            </td>
            {!pickerMode && onView && (
                <td className="px-0.5 py-1 text-center align-middle" onClick={stop}>
                    <div className="relative inline-block">
                        <button
                            ref={buttonRef}
                            type="button"
                            className="size-8 inline-flex items-center justify-center rounded-lg text-text-muted hover:bg-bg hover:text-text-h transition-colors"
                            onClick={() => setMenuOpen(!menuOpen)}
                            title="Actions"
                        >
                            •••
                        </button>
                        {menuOpen && menuPos && (
                            <div
                                ref={menuRef}
                                className="fixed z-[999] min-w-36 rounded-lg border border-border bg-surface shadow-xl py-1"
                                style={{ top: menuPos.top, left: menuPos.left }}
                            >
                                <button
                                    type="button"
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent-bg inline-flex items-center gap-2"
                                    onClick={() => {
                                        setMenuOpen(false);
                                        onView(word);
                                    }}
                                >
                                    <IconViewDetail className="shrink-0" />
                                    View details
                                </button>
                                {onEdit && (
                                    <button
                                        type="button"
                                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent-bg inline-flex items-center gap-2"
                                        onClick={() => {
                                            setMenuOpen(false);
                                            onEdit(word);
                                        }}
                                    >
                                        <IconEdit className="shrink-0" />
                                        Edit
                                    </button>
                                )}
                                {onDelete && (
                                    <button
                                        type="button"
                                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent-bg text-red-600 inline-flex items-center gap-2"
                                        onClick={() => {
                                            setMenuOpen(false);
                                            onDelete(word);
                                        }}
                                    >
                                        <IconTrash className="shrink-0" />
                                        Delete
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </td>
            )}
        </tr>
    );
});
