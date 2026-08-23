import { memo, useState } from "react";
import { Ellipsis } from "lucide-react";
import { createColumnHelper } from "@tanstack/react-table";
import { useLocale } from "../store/localeStore.js";
import { useVocabularySets, useAppActions } from "../store/appStore.js";
import { useIsSignedIn } from "../store/authStore.js";
import { Button } from "./shadcn/button.jsx";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from "./shadcn/dropdown-menu.jsx";
import { vocabularyLookupDisplay } from "../lib/hanLookup.js";
import { collectMeaningsField, displayMeaning } from "../lib/wordNormalize.js";
import { vocabRomanizationField, vocabMeanings, vocabRomanizations } from "../lib/wordDisplay.js";
import { normalizeSearchText } from "../lib/wordSearch.js";
import { HanziiHanCellLink } from "./HanziiHanCellLink.jsx";
import { WordFieldText } from "./WordFieldText.jsx";
import { Checkbox } from "./shadcn/checkbox.jsx";
import { displaySinoVietnameseAligned, hasFilledSinoVietnamese } from "../lib/sinoVietnameseReadings.js";
import { cn } from "../lib/cn.js";
import { uiCompactIconButtonClass } from "./ui/controlStyles.js";
import { DataTableColumnHeader } from "./DataTableColumnHeader.jsx";
import { IconViewDetail, IconEdit, IconTrash, IconPlus, IconPlaylistAdd } from "./NavIcons.jsx";

const columnHelper = createColumnHelper();

/** Filter multi-select: value dòng (string hoặc array) phải ∈ mảng filterValue. */
const multiValueFilter = (row, columnId, filterValue) => {
    if (!filterValue || filterValue.length === 0) return true;
    const val = row.getValue(columnId);
    if (Array.isArray(val)) return val.some((v) => filterValue.includes(v));
    return filterValue.includes(val);
};

/** Các field tìm kiếm theo lựa chọn cột. */
const SEARCH_FIELDS = {
    han: ["hanTraditional", "hanSimplified", "hanHongKong", "pinyin", "jyutping"],
    sinoVietnamese: ["sinoVietnamese"],
    meaning: ["vietMeanings", "engMeanings"],
};

function searchFieldsForColumn(column) {
    return SEARCH_FIELDS[column] ?? SEARCH_FIELDS.han;
}

/** Giá trị field tìm kiếm, ưu tiên child `meanings` (romanization_json). */
function searchFieldValue(word, field) {
    if (field === "vietMeanings" || field === "engMeanings") {
        const joined = collectMeaningsField(vocabMeanings(word), field) || collectMeaningsField(word.meanings, field);
        return joined || word[field] || "";
    }
    if (field === "pinyin") return vocabRomanizationField(word, "pinyin") || word[field] || "";
    if (field === "jyutping") return vocabRomanizationField(word, "jyutping") || word[field] || "";
    if (field === "sinoVietnamese") return vocabRomanizationField(word, "sinoVietnamese") || word[field] || "";
    return word[field] ?? "";
}

/**
 * Text tìm kiếm (chuẩn hóa bỏ dấu) theo searchColumn — dùng cho hidden column
 * "search" để filter native (includesString) khớp kiểu "nhat" ~ "nhất".
 */
export function searchableText(word, searchColumn) {
    return searchFieldsForColumn(searchColumn)
        .map((f) => normalizeSearchText(searchFieldValue(word, f)))
        .filter(Boolean)
        .join(" ");
}

/** Danh sách set id chứa từ này (hidden column "sets"). */
function setIdsFor(wordId, setVocabularyIds) {
    const out = [];
    for (const [setId, ids] of Object.entries(setVocabularyIds)) {
        if (Array.isArray(ids) && ids.includes(wordId)) out.push(setId);
    }
    return out;
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

/** Giá trị timestamp ms (number hoặc ISO string) — 0 nếu không hợp lệ. (2026-08-22) */
function vocabTimestampMs(v) {
    const ms = typeof v === "number" ? v : Date.parse(String(v ?? ""));
    return Number.isFinite(ms) ? ms : 0;
}

/** Cell hiển thị ngày tạo / cập nhật (compact, full datetime trong tooltip). */
function TimeCell({ value }) {
    const ms = vocabTimestampMs(value);
    if (!ms) return <span className="text-muted-foreground">-</span>;
    const d = new Date(ms);
    return (
        <span className="whitespace-nowrap text-sm text-muted-foreground" title={d.toLocaleString()}>
            {d.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "numeric" })}
        </span>
    );
}

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

/** Ô số thứ tự (bank) hoặc checkbox chọn (picker). */
function IndexCell({ index, isPicker, selected, onToggleSelect }) {
    if (isPicker) {
        return (
            <input
                type="checkbox"
                className="m-0 cursor-pointer"
                checked={!!selected}
                readOnly
                tabIndex={-1}
                aria-hidden="true"
            />
        );
    }
    return index + 1;
}

/** Nút ★ đánh dấu quan trọng. */
function StarCell({ word, onToggleImportant, t }) {
    return (
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
    );
}

/** Ô Hán-Việt — giống detail: text-foreground (không xanh lá). */
function SinoCell({ word, sinoVietnamese, hanLookup, t }) {
    return (
        <div className="leading-snug py-1">
            <span className="text-foreground text-sm uppercase">
                {hasFilledSinoVietnamese(sinoVietnamese) ? (
                    displaySinoVietnameseAligned(sinoVietnamese, hanLookup)
                ) : (
                    <WordFieldText word={word} field="sinoVietnamese" updatingLabel={t.wordBank.fieldUpdating} />
                )}
            </span>
        </div>
    );
}

/**
 * Ô GỘP chữ Hán + phiên âm — mỗi cặp: hán tự TRÊN, phiên âm DƯỚI.
 * - Mandarin: 1 cặp (giản thể + pinyin).
 * - Pure Cantonese: 1 cặp (HK + jyutping).
 * - Cả 2: 2 cặp — trái (giản thể + pinyin) | phải (phồn thể/HK + jyutping).
 */
function HanReadingCell({ word, pickerMode, pinyin, jyutping, language }) {
    const hanDisplay = vocabularyLookupDisplay(word);

    // Mandarin: giản/phồn phiên âm giống hệt → chỉ 1 cặp (simp + pinyin).
    if (language === "mandarin") {
        return (
            <div className="flex flex-col items-center gap-1 pt-1.5 whitespace-nowrap">
                <HanVariantCell
                    text={hanDisplay.simplified}
                    diffChars={undefined}
                    pickerMode={pickerMode}
                    lookupSimp={hanDisplay.simplified}
                    className="text-3xl text-center text-han-simp"
                />
                {pinyin ? (
                    <span className="text-base font-medium text-pinyin">{pinyin}</span>
                ) : (
                    <span className="text-base font-medium text-muted-foreground">-</span>
                )}
            </div>
        );
    }
    // Cantonese: LUÔN 1 cột (HK + jyutping). ⚠️ 2026-08-22: bỏ hẳn cấu trúc 2 cột — trước đây
    // từ Cantonese chỉ có HK (không simplified) vẫn vào grid 2 cột → cột simplified rỗng hiện
    // "Updating" (VD 生意). Từ chưa có phiên âm → HK + "-".
    return (
        <div className="flex flex-col items-center gap-1 pt-1.5 whitespace-nowrap">
            <HanVariantCell
                text={hanDisplay.traditional}
                diffChars={undefined}
                pickerMode={pickerMode}
                lookupSimp={hanDisplay.simplified}
                className="text-3xl text-center text-han-trad"
            />
            {jyutping ? (
                <span className="text-base font-medium text-jyutping">{jyutping}</span>
            ) : (
                <span className="text-base font-medium text-muted-foreground">-</span>
            )}
        </div>
    );
}

/** Ô nghĩa (Việt hoặc Anh) — giống detail: text-foreground. */
function MeaningCell({ word, meanings, field, t }) {
    // Ưu tiên meaning nằm TRÊN CÙNG (position đầu) của từng reading:
    // 1 của Mandarin (pinyin) + 1 của Cantonese (jyutping), tối đa 2 dòng.
    // Fallback: nếu 1 cột thiếu meaning → dùng meaning KẾ TIẾP của cột có meaning.
    const roms = vocabRomanizations(word);
    const valuesOf = (type) => {
        const out = [];
        for (const r of roms) {
            if (r?.type !== type) continue;
            for (const m of Array.isArray(r?.meanings) ? r.meanings : []) {
                const v = String(m?.[field] ?? "").trim();
                if (v) out.push(v);
            }
        }
        return out;
    };
    const py = valuesOf("pinyin");
    const jp = valuesOf("jyutping");
    const values = [];
    if (py[0]) values.push(py[0]);
    if (jp[0]) values.push(jp[0]);
    // Thiếu 1 cột → fallback sang meaning kế tiếp của cột có meaning.
    if (values.length === 1) {
        if (py[0] && !jp[0] && py[1]) values.push(py[1]);
        else if (jp[0] && !py[0] && jp[1]) values.push(jp[1]);
    }
    const seen = new Set();
    const final = values
        .filter((v) => {
            const k = v.trim().toLowerCase();
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
        })
        .slice(0, 2);
    if (final.length === 0) {
        const flat = displayMeaning(word[field] || "");
        return flat ? (
            <span className="text-foreground text-sm block max-w-full overflow-hidden text-ellipsis whitespace-nowrap">
                {flat}
            </span>
        ) : (
            <span className="italic text-muted-foreground">-</span>
        );
    }
    return (
        <div className="flex flex-col gap-2">
            {final.map((v, i) => (
                <div key={i} className="flex min-w-0 items-baseline gap-1.5">
                    <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/70" aria-hidden="true" />
                    <span className="min-w-0 flex-1 text-foreground text-sm overflow-hidden text-ellipsis whitespace-nowrap">
                        {displayMeaning(v)}
                    </span>
                </div>
            ))}
        </div>
    );
}

/** Ô cấp độ HSK / custom badge. */
function HskCell({ word, isPicker, t }) {
    if (word.pureCantonese) {
        return (
            <span
                className={cn(
                    "inline-flex items-center justify-center h-5 text-xs font-semibold rounded-full border",
                    "border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950 dark:text-cyan-300",
                )}
                style={{ minWidth: 82 }}
            >
                {t.wordBank.pureCantoneseBadge}
            </span>
        );
    }
    if (word.hskLevel) {
        return (
            <span
                className={cn(
                    "inline-flex items-center justify-center h-5 text-xs font-semibold rounded-full border",
                    hskColorClass(word.hskLevel),
                )}
                style={{ minWidth: 82 }}
            >
                {word.hskLevel}
            </span>
        );
    }
    return (
        <span
            className={cn(
                "inline-flex items-center justify-center h-5 text-xs font-medium rounded-full border",
                !isPicker ? "bg-muted text-muted-foreground border-border" : "text-muted-foreground",
            )}
            style={{ minWidth: 82 }}
        >
            {isPicker ? <span className="italic">-</span> : t.wordBank.custom}
        </span>
    );
}

/**
 * Ô hành động — giống hệt template shadcn data-table: Button ghost + Ellipsis
 * icon + DropdownMenu (view / edit / thêm vào bộ / xóa).
 */
const RowActionsCell = memo(function RowActionsCell({ word, onView, onEdit, onDelete }) {
    const { t } = useLocale();
    const sets = useVocabularySets();
    const { createVocabularySet, addVocabularyToSet, removeVocabularyFromSet } = useAppActions();
    const isSignedIn = useIsSignedIn();
    const [newSetName, setNewSetName] = useState("");

    const handleCreateSet = (e) => {
        e.preventDefault();
        const name = newSetName.trim();
        if (!name) return;
        createVocabularySet({ name })
            .then(() => setNewSetName(""))
            .catch(() => {});
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                render={<Button variant="ghost" size="icon" className="size-6 cursor-pointer" />}
                onClick={(e) => e.stopPropagation()}
            >
                <span className="sr-only">{t.common.actions}</span>
                <Ellipsis />
            </DropdownMenuTrigger>
            {/* ⚠️ stopPropagation: React events bubble qua React tree kể cả portal —
                nếu không, click menu item sẽ chạm tới TableRow onClick (navigate). */}
            <DropdownMenuContent align="end" className="min-w-44" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuGroup>
                    <DropdownMenuLabel>{t.common.actions}</DropdownMenuLabel>
                    {onView && (
                        <DropdownMenuItem className="cursor-pointer" onClick={() => onView(word)}>
                            <IconViewDetail className="shrink-0" />
                            {t.wordBank.viewDetails}
                        </DropdownMenuItem>
                    )}
                    {onEdit && (
                        <DropdownMenuItem className="cursor-pointer" onClick={() => onEdit(word)}>
                            <IconEdit className="shrink-0" />
                            {t.common.edit}
                        </DropdownMenuItem>
                    )}
                </DropdownMenuGroup>
                {isSignedIn && (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuSub>
                            <DropdownMenuSubTrigger className="cursor-pointer">
                                <IconPlaylistAdd className="shrink-0" />
                                {t.vocabSets.addToSet}
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent>
                                {sets.length === 0 ? (
                                    <p className="px-3 py-2 text-xs italic text-muted-foreground">
                                        {t.vocabSets.empty}
                                    </p>
                                ) : (
                                    sets.map((set) => {
                                        const inSet = set.vocabularyIds.includes(word.id);
                                        return (
                                            <DropdownMenuItem
                                                key={set.id}
                                                className="cursor-pointer"
                                                onClick={() =>
                                                    inSet
                                                        ? removeVocabularyFromSet(set.id, word.id).catch(() => {})
                                                        : addVocabularyToSet(set.id, word.id).catch(() => {})
                                                }
                                            >
                                                <span
                                                    className="size-2.5 rounded-full shrink-0"
                                                    style={{ background: set.color || "#7c3aed" }}
                                                />
                                                <span className="flex-1 min-w-0 truncate">{set.name}</span>
                                                {inSet && <span className="shrink-0 text-muted-foreground">✓</span>}
                                            </DropdownMenuItem>
                                        );
                                    })
                                )}
                                <DropdownMenuSeparator />
                                <form onSubmit={handleCreateSet} className="flex items-center gap-2 px-2 py-1.5">
                                    <input
                                        value={newSetName}
                                        onChange={(e) => setNewSetName(e.target.value)}
                                        placeholder={t.vocabSets.newPlaceholder}
                                        className="w-full min-w-0 rounded-md border border-border bg-background px-2 py-1 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
                                    />
                                    <Button
                                        type="submit"
                                        variant="ghost"
                                        size="icon"
                                        className="size-6 shrink-0 cursor-pointer"
                                        title={t.vocabSets.addSet}
                                    >
                                        <IconPlus size={16} />
                                    </Button>
                                </form>
                            </DropdownMenuSubContent>
                        </DropdownMenuSub>
                    </>
                )}
                {onDelete && (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
                            onClick={() => onDelete(word)}
                        >
                            <IconTrash className="shrink-0" />
                            {t.common.delete}
                        </DropdownMenuItem>
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
});

/**
 * Column definitions cho bảng từ vựng — TanStack Table v9 native (giống template
 * shadcn data-table). Accessor columns cho sort/filter native; helper columns
 * ẩn (search/sets/status) phục vụ tìm kiếm + faceted filter.
 */
export function buildWordRowColumns({
    t,
    language = "cantonese",
    canMark,
    isPicker,
    selectable = false,
    sortable = false,
    startIndex,
    selected,
    onToggleSelect,
    onToggleImportant,
    onToggleMastered,
    onView,
    onEdit,
    onDelete,
    searchColumn = "han",
    searchQuery = "",
    setVocabularyIds = {},
    getDisplayIndex = (row) => row.index,
}) {
    const numClass = cn(
        "text-muted-foreground text-[0.8125rem] whitespace-nowrap text-center px-1.5 align-middle",
        !isPicker && "pr-0.5",
    );

    const cellFor =
        (render) =>
        ({ row }) => {
            const word = row.original;
            return render(word, row.index, row);
        };

    const columns = [];

    // Cột chọn dòng (bank mode) — checkbox header chọn cả trang, cell toggle từng dòng.
    if (selectable) {
        columns.push(
            columnHelper.display({
                id: "select",
                enableSorting: false,
                enableHiding: false,
                header: ({ table }) => (
                    <Checkbox
                        checked={table.getIsAllPageRowsSelected()}
                        indeterminate={table.getIsSomePageRowsSelected()}
                        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
                        aria-label="Chọn tất cả trên trang"
                    />
                ),
                cell: ({ row }) => (
                    <Checkbox
                        checked={row.getIsSelected()}
                        onCheckedChange={(value) => row.toggleSelected(!!value)}
                        aria-label="Chọn dòng"
                        onClick={(e) => e.stopPropagation()}
                    />
                ),
                meta: { className: "text-center align-middle w-10 px-2" },
            }),
        );
    }

    columns.push(
        columnHelper.display({
            id: "index",
            header: () => (isPicker ? null : t.wordBank.colNum),
            meta: { className: isPicker ? "text-center align-middle" : numClass, label: t.wordBank.colNum },
            cell: cellFor((word, i, row) => (
                <IndexCell
                    index={getDisplayIndex(row)}
                    isPicker={isPicker}
                    selected={selected?.has(String(word.id))}
                    onToggleSelect={onToggleSelect}
                />
            )),
        }),
    );

    if (canMark) {
        columns.push(
            columnHelper.display({
                id: "star",
                header: () => t.wordBank.colStar,
                meta: {
                    className: cn(
                        "px-0.5 py-1.5 text-center align-middle",
                        "[&:nth-child(2)]:pl-0 [&:nth-child(2)]:pr-1",
                    ),
                    label: t.wordBank.colStar,
                },
                cell: cellFor((word) => <StarCell word={word} onToggleImportant={onToggleImportant} t={t} />),
            }),
        );
    }

    columns.push(
        columnHelper.accessor((row) => vocabRomanizationField(row, "sinoVietnamese") || row.sinoVietnamese || "", {
            id: "sino",
            enableSorting: sortable,
            enableHiding: !isPicker,
            sortFn: "text", // v9 dùng sortFn (không phải sortingFn legacy)
            header: ({ column }) => <DataTableColumnHeader column={column} title={t.wordBank.colSinoVietnamese} />,
            meta: {
                className: cn("px-5 py-2.5 text-left align-middle truncate max-w-[200px]", "w-30"),
                label: t.wordBank.colSinoVietnamese,
            },
            cell: cellFor((word) => {
                const hanDisplay = vocabularyLookupDisplay(word);
                const hanLookup = hanDisplay.traditional || hanDisplay.simplified || hanDisplay.hongKong;
                const sinoVietnamese = vocabRomanizationField(word, "sinoVietnamese") || word.sinoVietnamese || "";
                return <SinoCell word={word} sinoVietnamese={sinoVietnamese} hanLookup={hanLookup} t={t} />;
            }),
        }),
        // Sort theo hán tự — dùng form PHỒN THỂ (hanTraditional → hanHongKong → hanSimplified):
        // stroke map key theo phồn thể (hanStroke.js) nên giản thể (vd 于/过) không nét chính xác.
        columnHelper.accessor((row) => row.hanTraditional || row.hanHongKong || row.hanSimplified || "", {
            id: "han",
            enableSorting: sortable,
            enableHiding: !isPicker,
            sortFn: "han", // đăng ký trong data-table-features.js
            header: ({ column }) => <DataTableColumnHeader column={column} title={t.wordBank.colHanChars} centered />,
            meta: { className: "py-1.5 align-middle", label: t.wordBank.colHanChars },
            cell: cellFor((word) => {
                const pinyin = vocabRomanizationField(word, "pinyin") || word.pinyin || "";
                const jyutping = vocabRomanizationField(word, "jyutping") || word.jyutping || "";
                return (
                    <HanReadingCell
                        word={word}
                        pickerMode={isPicker}
                        pinyin={pinyin}
                        jyutping={jyutping}
                        language={language}
                    />
                );
            }),
        }),
    );

    if (!isPicker) {
        columns.push(
            columnHelper.accessor(
                (row) => collectMeaningsField(vocabMeanings(row), "vietMeanings") || row.vietMeanings || "",
                {
                    id: "viet",
                    enableSorting: sortable,
                    enableHiding: !isPicker,
                    sortFn: "text", // v9 dùng sortFn
                    header: ({ column }) => (
                        <DataTableColumnHeader column={column} title={t.wordBank.colVietMeanings} />
                    ),
                    meta: { className: "px-5 py-2.5 align-middle max-w-62.5", label: t.wordBank.colVietMeanings },
                    cell: cellFor((word) => {
                        const meanings = vocabMeanings(word);
                        return <MeaningCell word={word} meanings={meanings} field="vietMeanings" t={t} />;
                    }),
                },
            ),
            columnHelper.accessor(
                (row) => collectMeaningsField(vocabMeanings(row), "engMeanings") || row.engMeanings || "",
                {
                    id: "eng",
                    enableSorting: sortable,
                    enableHiding: !isPicker,
                    sortFn: "text", // v9 dùng sortFn
                    header: ({ column }) => <DataTableColumnHeader column={column} title={t.wordBank.colEngMeanings} />,
                    meta: { className: "px-5 py-2.5 align-middle max-w-62.5", label: t.wordBank.colEngMeanings },
                    cell: cellFor((word) => {
                        const meanings = vocabMeanings(word);
                        return <MeaningCell word={word} meanings={meanings} field="engMeanings" t={t} />;
                    }),
                },
            ),
        );
    }

    // Cột cấp độ CHỈ ở Mandarin — Cantonese không có level.
    if (language === "mandarin") {
        columns.push(
            columnHelper.accessor((row) => (row.pureCantonese ? "YSK" : row.hskLevel || ""), {
                id: "hsk",
                enableSorting: sortable,
                enableHiding: !isPicker,
                sortFn: "text", // v9 dùng sortFn
                filterFn: multiValueFilter,
                header: ({ column }) => <DataTableColumnHeader column={column} title={t.wordBank.colLevel} centered />,
                meta: {
                    className: "px-5 py-2.5 align-middle text-center whitespace-nowrap",
                    label: t.wordBank.colLevel,
                },
                cell: cellFor((word) => <HskCell word={word} isPicker={isPicker} t={t} />),
            }),
        );
    }

    // Cột thời gian TẠO / CẬP NHẬT — sort theo ngày (2026-08-22). Bank mode chỉ.
    if (!isPicker) {
        columns.push(
            columnHelper.accessor((row) => vocabTimestampMs(row.createdAt ?? row.updatedAt ?? row.addedAt), {
                id: "created",
                enableSorting: sortable,
                enableHiding: !isPicker,
                sortFn: (rowA, rowB) => rowA.getValue("created") - rowB.getValue("created"),
                header: ({ column }) => (
                    <DataTableColumnHeader column={column} title={t.wordBank.colCreated} centered />
                ),
                meta: {
                    className: "px-5 py-2.5 align-middle text-center whitespace-nowrap",
                    label: t.wordBank.colCreated,
                },
                cell: cellFor((word) => <TimeCell value={word.createdAt ?? word.updatedAt ?? word.addedAt} />),
            }),
            columnHelper.accessor((row) => vocabTimestampMs(row.updatedAt ?? row.createdAt), {
                id: "updated",
                enableSorting: sortable,
                enableHiding: !isPicker,
                sortFn: (rowA, rowB) => rowA.getValue("updated") - rowB.getValue("updated"),
                header: ({ column }) => (
                    <DataTableColumnHeader column={column} title={t.wordBank.colUpdated} centered />
                ),
                meta: {
                    className: "px-5 py-2.5 align-middle text-center whitespace-nowrap",
                    label: t.wordBank.colUpdated,
                },
                cell: cellFor((word) => <TimeCell value={word.updatedAt ?? word.createdAt} />),
            }),
        );
    }

    // Hidden helper columns — chỉ phục vụ filter (search/faceted), không hiển thị.
    columns.push(
        columnHelper.accessor((row) => searchableText(row, searchColumn), {
            id: "search",
            // sortFn prefix-first: khi đang search, từ BẮT ĐẦU bằng query xếp trước
            // (rồi theo text). Không tắt sort → pagination vẫn hoạt động.
            enableSorting: Boolean(searchQuery),
            sortFn: (rowA, rowB) => {
                // ⚠️ Dùng rowA.getValue("search") — giá trị CACHE của accessor (tính 1 lần/dòng).
                // Trước đây gọi lại searchableText(rowA.original,...) mỗi lần so sánh → sort
                // 14k dòng = ~200k lần normalize → LAG nặng khi search. (2026-08-17)
                const a = rowA.getValue("search");
                const b = rowB.getValue("search");
                const q = searchQuery;
                if (q) {
                    const pa = a.startsWith(q) ? 0 : 1;
                    const pb = b.startsWith(q) ? 0 : 1;
                    if (pa !== pb) return pa - pb;
                }
                return a < b ? -1 : a > b ? 1 : 0;
            },
            filterFn: "includesString",
            meta: { hidden: true },
        }),
        columnHelper.accessor((row) => setIdsFor(row.id, setVocabularyIds), {
            id: "sets",
            enableSorting: false,
            filterFn: multiValueFilter,
            meta: { hidden: true },
        }),
        columnHelper.accessor(
            (row) => {
                const s = [];
                if (row.important) s.push("important");
                if (row.mastered) s.push("mastered");
                return s;
            },
            {
                id: "status",
                enableSorting: false,
                filterFn: multiValueFilter,
                meta: { hidden: true },
            },
        ),
    );

    if (!isPicker) {
        columns.push(
            columnHelper.display({
                id: "actions",
                enableHiding: false,
                meta: { className: "p-2 align-middle whitespace-nowrap text-center" },
                cell: cellFor((word) =>
                    onView ? <RowActionsCell word={word} onView={onView} onEdit={onEdit} onDelete={onDelete} /> : null,
                ),
            }),
        );
    }

    return columns;
}
