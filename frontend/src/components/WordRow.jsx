import { memo, useRef, useState, useEffect } from "react";
import { useLocale } from "../store/localeStore.js";
import { useVocabularySets, useAppActions } from "../store/appStore.js";
import { useIsSignedIn } from "../store/authStore.js";
import { orderedHanVariants, diffHanChars } from "../lib/hanScriptDisplay.js";
import { vocabularyLookupDisplay } from "../lib/hanLookup.js";
import { collectMeaningsField, displayMeaning } from "../lib/wordNormalize.js";
import { vocabRomanizationField, vocabMeanings } from "../lib/wordDisplay.js";
import { HanziiHanCellLink } from "./HanziiHanCellLink.jsx";
import { WordFieldText } from "./WordFieldText.jsx";
import { displaySinoVietnameseAligned, hasFilledSinoVietnamese } from "../lib/sinoVietnameseReadings.js";
import { cn } from "../lib/cn.js";
import { uiCompactIconButtonClass } from "./ui/controlStyles.js";
import { TableCell, TableRow } from "./shadcn/table.jsx";
import { IconViewDetail, IconEdit, IconTrash, IconPlus, IconChevronRight, IconPlaylistAdd } from "./NavIcons.jsx";

const tdClass = "px-5 py-2.5 text-left align-middle truncate max-w-[200px]";

const rowClass = "border-b border-border";

/**
 * Renders a han variant (simp or trad) with per-character diff highlighting.
 * Links to Hanzii using the simplified form for lookups.
 */
function HanVariantCell({ text, diffChars, pickerMode, lookupSimp, className }) {
    const { t } = useLocale();
    if (!text) return <span className={cn(className, "italic text-muted-foreground")}>{t.wordBank.fieldUpdating}</span>;

    const hasDiff = diffChars && diffChars.length > 0 && text.length > 1;

    // Mỗi ký tự nằm trong <span> riêng để đồng nhất cấu trúc DOM giữa
    // nhánh diff / không-diff — tránh khác biệt rasterize (độ dày nét).
    const plainPerChar = [...text].map((c, i) => <span key={i}>{c}</span>);

    if (!hasDiff) {
        if (pickerMode) {
            return <span className={cn("font-semibold", className)}>{plainPerChar}</span>;
        }
        return (
            <HanziiHanCellLink
                hanTraditional={lookupSimp || text}
                displayText={text}
                emphasis="primary"
                className={className}
            >
                {plainPerChar}
            </HanziiHanCellLink>
        );
    }

    const inner = diffChars.map((c, i) => (
        <span key={i} className={cn("relative inline-flex", !c.same && "")}>
            {!c.same && (
                <span
                    className="absolute -top-2 left-1/2 -translate-x-1/2 size-1.5 rounded-full bg-yellow-500"
                    aria-hidden="true"
                />
            )}
            {c.char}
        </span>
    ));

    if (pickerMode) {
        return <span className={cn("font-semibold", className)}>{inner}</span>;
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
    const sets = useVocabularySets();
    const { fetchVocabularySets, createVocabularySet, addVocabularyToSet, removeVocabularyFromSet } = useAppActions();
    const isSignedIn = useIsSignedIn();
    const [menuOpen, setMenuOpen] = useState(false);
    const [setsOpen, setSetsOpen] = useState(false);
    const [setSearch, setSetSearch] = useState("");
    const [newSetOpen, setNewSetOpen] = useState(false);
    const [newSetName, setNewSetName] = useState("");
    const menuRef = useRef(null);
    const buttonRef = useRef(null);
    const setsBtnRef = useRef(null);
    const setsRef = useRef(null);
    const setsHoverTimer = useRef(null);
    const [menuPos, setMenuPos] = useState(null);
    const [setsPos, setSetsPos] = useState(null);

    const SETS_FLYOUT_W = 284; // w-56 (14rem at 20px root) + gap

    const updateMenuPos = () => {
        const rect = buttonRef.current?.getBoundingClientRect();
        if (rect) {
            setMenuPos({ top: rect.bottom + 4, left: Math.max(rect.right - 180, 8) });
        }
    };

    const updateSetsPos = () => {
        const rect = setsBtnRef.current?.getBoundingClientRect();
        if (rect) {
            setSetsPos({ top: rect.top, left: Math.max(8, rect.left - SETS_FLYOUT_W) });
        }
    };

    const openSets = () => {
        clearTimeout(setsHoverTimer.current);
        if (sets.length === 0) fetchVocabularySets().catch(() => {});
        setSetsOpen(true);
    };

    const closeSets = () => {
        clearTimeout(setsHoverTimer.current);
        setsHoverTimer.current = setTimeout(() => setSetsOpen(false), 200);
    };

    const q = setSearch.trim().toLowerCase();
    const filteredSets = q ? sets.filter((s) => s.name.toLowerCase().includes(q)) : sets;

    useEffect(() => {
        if (!menuOpen) {
            setMenuPos(null);
            setSetsOpen(false);
            setSetsPos(null);
            return;
        }
        updateMenuPos();
        const handleClick = (e) => {
            const inMenu = menuRef.current?.contains(e.target);
            const inSets = setsRef.current?.contains(e.target);
            if (!inMenu && !inSets) {
                setMenuOpen(false);
                setSetsOpen(false);
            }
        };
        const onScrollOrResize = () => {
            updateMenuPos();
            updateSetsPos();
        };
        document.addEventListener("mousedown", handleClick);
        window.addEventListener("scroll", onScrollOrResize, true);
        window.addEventListener("resize", onScrollOrResize);
        return () => {
            document.removeEventListener("mousedown", handleClick);
            window.removeEventListener("scroll", onScrollOrResize, true);
            window.removeEventListener("resize", onScrollOrResize);
        };
    }, [menuOpen]);

    useEffect(() => {
        if (!setsOpen) {
            setSetsPos(null);
            return;
        }
        updateSetsPos();
    }, [setsOpen]);

    const numClass = cn(
        "text-muted-foreground text-[0.8125rem] whitespace-nowrap text-center px-1.5 align-middle",
        !pickerMode && "pr-0.5",
    );

    const flagColClass = "px-0.5 py-1.5 text-center align-middle [&:nth-child(2)]:pl-0 [&:nth-child(2)]:pr-1";

    const hanDisplay = vocabularyLookupDisplay(word);
    const hanOrdered = orderedHanVariants({
        traditional: hanDisplay.traditional,
        simplified: hanDisplay.simplified,
    });
    const hanLookup = hanDisplay.traditional || hanDisplay.simplified || hanDisplay.hongKong;
    // Từ HK-only (simp/trad rỗng) → hiển thị han_hongkong, màu phồn thể.
    const primaryHan = hanOrdered.primary || hanDisplay.hongKong;
    const primaryIsTrad = hanOrdered.primaryIsTraditional || (!hanOrdered.primary && Boolean(hanDisplay.hongKong));

    // Chữ khác giữa Mandarin (simp) và Cantonese (HK) — để gạch chân chấm.
    const hanDiff = diffHanChars({
        traditional: hanDisplay.traditional,
        simplified: hanDisplay.simplified,
    });

    // Pure Cantonese flag: these words show only jyutping (no pinyin slot) and a "Pure Cantonese" badge.
    const isPureCantonese = Boolean(word.pureCantonese);
    const meanings = vocabMeanings(word);
    const sinoVietnamese = vocabRomanizationField(word, "sinoVietnamese") || word.sinoVietnamese || "";

    return (
        <TableRow
            data-word-id={String(word.id)}
            className={cn(
                rowClass,
                pickerMode && "cursor-pointer hover:bg-background",
                pickerMode && selected && "bg-primary/10 hover:bg-primary/10",
                !pickerMode && "transition-colors hover:bg-background/60",
                !pickerMode && onView && "cursor-pointer",
                word.important && "bg-orange-600/4",
                word.mastered && "opacity-75",
            )}
            onClick={pickerMode ? () => onToggleSelect?.(String(word.id)) : onView ? () => onView(word) : undefined}
        >
            {pickerMode ? (
                <TableCell className="text-center align-middle">
                    <input
                        type="checkbox"
                        className="m-0 cursor-pointer"
                        checked={!!selected}
                        readOnly
                        tabIndex={-1}
                        aria-hidden="true"
                    />
                </TableCell>
            ) : (
                <TableCell className={numClass}>{index + 1}</TableCell>
            )}
            {canMark && (
                <TableCell className={flagColClass}>
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
                </TableCell>
            )}
            <TableCell className={cn(tdClass, "py-0.5 align-middle w-30")}>
                <div className="leading-snug py-1">
                    <span className="text-viet text-base uppercase">
                        {hasFilledSinoVietnamese(sinoVietnamese) ? (
                            displaySinoVietnameseAligned(sinoVietnamese, hanLookup)
                        ) : (
                            <WordFieldText
                                word={word}
                                field="sinoVietnamese"
                                updatingLabel={t.wordBank.fieldUpdating}
                            />
                        )}
                    </span>
                </div>
            </TableCell>
            <TableCell className="py-1.5 align-middle" colSpan={4}>
                {hanDisplay.showSimplified ? (
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 items-end pt-1.5 whitespace-nowrap">
                        <HanVariantCell
                            text={hanDisplay.simplified}
                            diffChars={hanDiff.simp}
                            pickerMode={pickerMode}
                            lookupSimp={hanDisplay.simplified}
                            className="text-5xl text-center text-han-simp"
                        />
                        <HanVariantCell
                            text={hanOrdered.primary}
                            diffChars={undefined}
                            pickerMode={pickerMode}
                            lookupSimp={hanDisplay.simplified}
                            className="text-5xl text-center text-han-trad"
                        />
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-1 pt-1.5 whitespace-nowrap">
                        {pickerMode ? (
                            <span
                                className={cn(
                                    "text-5xl font-semibold",
                                    primaryIsTrad ? "text-han-trad" : "text-han-simp",
                                )}
                            >
                                {primaryHan || <span className="italic text-muted-foreground text-sm">-</span>}
                            </span>
                        ) : (
                            <HanziiHanCellLink
                                hanTraditional={hanLookup}
                                displayText={primaryHan}
                                emphasis="primary"
                                className={cn("text-5xl", primaryIsTrad ? "text-han-trad" : "text-han-simp")}
                            />
                        )}
                    </div>
                )}
            </TableCell>
            {!pickerMode && (
                <>
                    <TableCell className="px-5 py-2.5 align-middle max-w-62.5">
                        <span className="text-viet text-sm line-clamp-2">
                            {collectMeaningsField(meanings, "vietMeanings") || word.vietMeanings ? (
                                collectMeaningsField(meanings, "vietMeanings") || displayMeaning(word.vietMeanings)
                            ) : (
                                <span className="italic text-muted-foreground">-</span>
                            )}
                        </span>
                    </TableCell>
                    <TableCell className="px-5 py-2.5 align-middle max-w-62.5">
                        <span className="text-sm line-clamp-2">
                            {collectMeaningsField(meanings, "engMeanings") || word.engMeanings ? (
                                collectMeaningsField(meanings, "engMeanings") || displayMeaning(word.engMeanings)
                            ) : (
                                <span className="italic text-muted-foreground">-</span>
                            )}
                        </span>
                    </TableCell>
                </>
            )}
            <TableCell className="px-5 py-2.5 align-middle text-center">
                {isPureCantonese ? (
                    <span
                        title={t.wordBank.pureCantoneseBadgeTitle}
                        className={cn(
                            "inline-flex items-center justify-center h-5 px-2 text-xs font-semibold rounded-full border",
                            "bg-cyan-50 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800",
                        )}
                        style={{ minWidth: 82 }}
                    >
                        {t.wordBank.pureCantoneseBadge}
                    </span>
                ) : word.hskLevel && /\d/.test(word.hskLevel) && !pickerMode ? (
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
                        className={cn(
                            "inline-flex items-center justify-center h-5 text-xs font-medium rounded-full border",
                            !pickerMode
                                ? "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                                : "text-muted-foreground",
                        )}
                        style={{ minWidth: 82 }}
                    >
                        {pickerMode ? <span className="italic">-</span> : t.wordBank.custom}
                    </span>
                )}
            </TableCell>
            {!pickerMode && onView && (
                <TableCell className="px-0.5 py-1 text-center align-middle">
                    <div className="relative inline-block">
                        <button
                            ref={buttonRef}
                            type="button"
                            className="size-8 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:bg-background hover:text-foreground transition-colors"
                            onClick={(e) => {
                                e.stopPropagation();
                                setMenuOpen(!menuOpen);
                            }}
                            title={t.common.actions}
                        >
                            •••
                        </button>
                        {menuOpen && menuPos && (
                            <>
                                <div
                                    ref={menuRef}
                                    className="fixed z-999 min-w-36 flex flex-col rounded-lg border border-border bg-card shadow-xl py-1"
                                    style={{ top: menuPos.top, left: menuPos.left }}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <button
                                        type="button"
                                        className="w-full text-left px-3 py-2 text-sm hover:bg-primary/10 inline-flex items-center gap-2"
                                        onClick={() => {
                                            setMenuOpen(false);
                                            onView(word);
                                        }}
                                    >
                                        <IconViewDetail className="shrink-0" />
                                        {t.wordBank.viewDetails}
                                    </button>
                                    {onEdit && (
                                        <button
                                            type="button"
                                            className="w-full text-left px-3 py-2 text-sm hover:bg-primary/10 inline-flex items-center gap-2"
                                            onClick={() => {
                                                setMenuOpen(false);
                                                onEdit(word);
                                            }}
                                        >
                                            <IconEdit className="shrink-0" />
                                            Edit
                                        </button>
                                    )}
                                    {isSignedIn && (
                                        <div className="relative" onMouseEnter={openSets} onMouseLeave={closeSets}>
                                            <button
                                                ref={setsBtnRef}
                                                type="button"
                                                className="w-full text-left px-3 py-2 text-sm hover:bg-primary/10 inline-flex items-center gap-2"
                                                onClick={() => setSetsOpen((v) => !v)}
                                            >
                                                <IconPlaylistAdd className="shrink-0" />
                                                {t.vocabSets.addToSet}
                                                <IconChevronRight className="shrink-0 ml-auto text-muted-foreground" />
                                            </button>
                                            {setsOpen && setsPos && (
                                                <div
                                                    ref={setsRef}
                                                    className="fixed z-999 w-56 rounded-lg border border-border bg-card shadow-xl py-1"
                                                    style={{ top: setsPos.top, left: setsPos.left }}
                                                    onMouseEnter={() => clearTimeout(setsHoverTimer.current)}
                                                    onMouseLeave={closeSets}
                                                >
                                                    <div className="px-3 pt-2 pb-2">
                                                        <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
                                                            <svg
                                                                className="shrink-0 text-muted-foreground"
                                                                width="16"
                                                                height="16"
                                                                viewBox="0 0 24 24"
                                                                fill="none"
                                                                stroke="currentColor"
                                                                strokeWidth="2"
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                aria-hidden="true"
                                                            >
                                                                <circle cx="11" cy="11" r="8" />
                                                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                                            </svg>
                                                            <input
                                                                autoFocus
                                                                value={setSearch}
                                                                onChange={(e) => setSetSearch(e.target.value)}
                                                                placeholder={t.vocabSets.findPlaceholder}
                                                                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                                                            />
                                                        </div>
                                                        <button
                                                            type="button"
                                                            className="mt-2 w-full text-left px-3 py-2 text-sm text-primary flex items-center gap-2"
                                                            onClick={() => setNewSetOpen((v) => !v)}
                                                        >
                                                            <IconPlus size={16} className="shrink-0" />
                                                            {t.vocabSets.newSet}
                                                        </button>
                                                        {newSetOpen && (
                                                            <form
                                                                className="mt-2 flex items-center gap-2"
                                                                onSubmit={(e) => {
                                                                    e.preventDefault();
                                                                    const name = newSetName.trim();
                                                                    if (!name) return;
                                                                    createVocabularySet({ name })
                                                                        .then(() => {
                                                                            setNewSetName("");
                                                                            setNewSetOpen(false);
                                                                        })
                                                                        .catch(() => {});
                                                                }}
                                                            >
                                                                <input
                                                                    autoFocus
                                                                    value={newSetName}
                                                                    onChange={(e) => setNewSetName(e.target.value)}
                                                                    placeholder={t.vocabSets.newPlaceholder}
                                                                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
                                                                />
                                                                <button
                                                                    type="submit"
                                                                    className="shrink-0 text-primary inline-flex"
                                                                    title={t.vocabSets.addSet}
                                                                >
                                                                    <IconPlus size={16} />
                                                                </button>
                                                            </form>
                                                        )}
                                                    </div>
                                                    <div className="max-h-44 overflow-y-auto border-t border-border/60 pt-1">
                                                        {filteredSets.length === 0 ? (
                                                            <div className="px-3 py-2 text-xs italic text-muted-foreground">
                                                                {t.vocabSets.empty}
                                                            </div>
                                                        ) : (
                                                            filteredSets.map((set) => {
                                                                const inSet = set.vocabularyIds.includes(word.id);
                                                                return (
                                                                    <button
                                                                        key={set.id}
                                                                        type="button"
                                                                        className="w-full text-left px-3 py-2 text-sm hover:bg-primary/10 inline-flex items-center gap-2"
                                                                        onClick={() =>
                                                                            inSet
                                                                                ? removeVocabularyFromSet(
                                                                                      set.id,
                                                                                      word.id,
                                                                                  ).catch(() => {})
                                                                                : addVocabularyToSet(
                                                                                      set.id,
                                                                                      word.id,
                                                                                  ).catch(() => {})
                                                                        }
                                                                    >
                                                                        <span
                                                                            className="size-2.5 rounded-full shrink-0"
                                                                            style={{
                                                                                background: set.color || "#7c3aed",
                                                                            }}
                                                                        />
                                                                        <span className="flex-1 min-w-0 truncate">
                                                                            {set.name}
                                                                        </span>
                                                                        <span
                                                                            className={cn(
                                                                                "shrink-0",
                                                                                inSet
                                                                                    ? "text-primary"
                                                                                    : "text-muted-foreground/50",
                                                                            )}
                                                                        >
                                                                            {inSet ? (
                                                                                "✓"
                                                                            ) : (
                                                                                <IconPlus
                                                                                    size={16}
                                                                                    className="shrink-0"
                                                                                />
                                                                            )}
                                                                        </span>
                                                                    </button>
                                                                );
                                                            })
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    {onDelete && (
                                        <button
                                            type="button"
                                            className="w-full text-left px-3 py-2 text-sm hover:bg-primary/10 text-red-600 inline-flex items-center gap-2"
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
                            </>
                        )}
                    </div>
                </TableCell>
            )}
        </TableRow>
    );
});
