import {
    columnFacetingFeature,
    columnFilteringFeature,
    columnVisibilityFeature,
    createFacetedMinMaxValues,
    createFacetedRowModel,
    createFacetedUniqueValues,
    createFilteredRowModel,
    createPaginatedRowModel,
    createSortedRowModel,
    filterFn_includesString,
    rowPaginationFeature,
    rowSelectionFeature,
    rowSortingFeature,
    sortFn_alphanumeric,
    sortFn_text,
    tableFeatures,
} from "@tanstack/react-table";
import { compareHanKeys, hanSortKey } from "../lib/hanStroke.js";
import { comparePinyinTone } from "../lib/pinyinSort.js";
import { vocabRomanizationField } from "../lib/wordDisplay.js";

/**
 * Sort hán tự theo nét chữ (stroke order); cùng nét → tiebreak theo pinyin tone.
 * ⚠️ v9 với đầy đủ features BỎ QUA inline `sortingFn` (function) — chỉ dùng
 * sortingFn ĐÃ ĐĂNG KÝ trong `sortFns` (đã reproduce: calls=0).
 */
const hanSortingFn = (rowA, rowB, columnId) => {
    const a = String(rowA.getValue(columnId) ?? "");
    const b = String(rowB.getValue(columnId) ?? "");
    const cmp = compareHanKeys(hanSortKey(a), hanSortKey(b), a, b);
    if (cmp !== 0) return cmp;
    // Ưu tiên pinyin_numeric (yi1 yi2 yi4 — ổn định, không phụ thuộc locale).
    const na = String(rowA.original?.pinyinNumeric ?? "")
        .trim()
        .toLowerCase();
    const nb = String(rowB.original?.pinyinNumeric ?? "")
        .trim()
        .toLowerCase();
    if (na && nb && na !== nb) return na < nb ? -1 : 1;
    return comparePinyinTone(
        vocabRomanizationField(rowA.original, "pinyin") || rowA.original?.pinyin || "",
        vocabRomanizationField(rowB.original, "pinyin") || rowB.original?.pinyin || "",
    );
};

/**
 * Shared TanStack Table v9 features — giống template shadcn data-table.
 * Opt-in từng behavior (sort/filter/paginate/facet/selection); row models tạo
 * qua create*RowModel(). Mọi feature không khai báo sẽ bị tree-shake.
 */
export const features = tableFeatures({
    columnFacetingFeature,
    columnFilteringFeature,
    columnVisibilityFeature,
    rowPaginationFeature,
    rowSelectionFeature,
    rowSortingFeature,
    filteredRowModel: createFilteredRowModel(),
    paginatedRowModel: createPaginatedRowModel(),
    sortedRowModel: createSortedRowModel(),
    facetedRowModel: createFacetedRowModel(),
    facetedUniqueValues: createFacetedUniqueValues(),
    facetedMinMaxValues: createFacetedMinMaxValues(),
    filterFns: { includesString: filterFn_includesString },
    sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text, han: hanSortingFn },
});
