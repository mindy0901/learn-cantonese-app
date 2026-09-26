import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, Link } from "react-router-dom";
import { cn } from "../lib/cn.js";
import { Button } from "./shadcn/button.jsx";
import { useLocale } from "../store/localeStore.js";
import { vocabularyLookupDisplay } from "../lib/hanLookup.js";
import { diffHanChars } from "../lib/hanScriptDisplay.js";
import { VocabularyFieldText } from "./VocabularyFieldText.jsx";
import {
    buildVocabularyDraft,
    vocabularyDraftPayloadLegacy,
    splitHanBracketed,
    syncMeaningsViEn,
    countViEnSyncJobs,
    syncMeaningsCantonese,
    countCantoneseSyncJobs,
} from "./VocabularyEditFields.jsx";
import { MeaningsEditor } from "./VocabularyEditFields.jsx";
import { vocabularyLangPayload, cleanRomanization } from "../lib/dataTransforms.js";
import { TagInput } from "./TagInput.jsx";
import { normalizePopularityLevel, popularityLevelTextClass } from "../lib/wordPopularity.js";
import { PopularityChip } from "./PopularityChip.jsx";
import { SET_COLORS } from "../lib/vocabSetColors.js";
import { displaySinoVietnameseAligned } from "../lib/sinoVietnameseReadings.js";
import {
    normalizeVocabularyFields,
    capitalizeSentences,
    displayMeaning,
    vocabularyContentEqual,
} from "../lib/wordNormalize.js";
import {
    useVocabularies,
    useAppStore,
    useMandarinVocabularies,
    useCantoneseVocabularies,
    useFavoriteVocabularyIds,
    useDislikedVocabularyIds,
    useVocabularySets,
} from "../store/appStore.js";
import { useHkSuggestion } from "../lib/hkSuggestion.js";
import { useIsAdmin, useIsSignedIn } from "../store/authStore.js";
import { vocabularyDetailPath, languageRoutePrefix } from "../lib/wordRoutes.js";
import { api } from "../lib/api.js";
import { hanziiWordUrl } from "../lib/hanzii.js";
import { ReadingPair } from "./ReadingPair.jsx";
import { AudioPlayButton } from "./AudioPlayButton.jsx";
import { comparePinyinTone } from "../lib/pinyinSort.js";
import { ConfirmDialog } from "./ConfirmDialog.jsx";
import { PronunciationEditor } from "./PronunciationEditor.jsx";
import { GoogleIcon } from "./GoogleIcon.jsx";
import { HanziiIcon, JyutDictIcon } from "./BrandIcons.jsx";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "./shadcn/select.jsx";
import { Tabs, TabsList, TabsTrigger } from "./shadcn/tabs.jsx";
import { Input } from "./shadcn/input.jsx";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./shadcn/dialog.jsx";
import { Card, CardContent, CardHeader, CardTitle } from "./shadcn/card.jsx";
import { Skeleton } from "./shadcn/skeleton.jsx";
import { Badge } from "./shadcn/badge.jsx";
import {
    AlignedHanColumns,
    VocabularyMeaningsBlock,
    buildAlignedColumns,
    splitHanCharsAlign,
    splitAlignedTokens,
    vocabMatchIndices,
    highlightMarkClass,
} from "./VocabularyContent.jsx";
import { toast } from "./shadcn/toast.jsx";
import { Separator } from "./shadcn/separator.jsx";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "./shadcn/collapsible.jsx";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "./shadcn/dropdown-menu.jsx";
import { VocabularySetPicker } from "./VocabularySetPicker.jsx";
import { VocabularyTagPicker, useVocabularyTags } from "./VocabularyTagPicker.jsx";
import { VocabularyTagChips } from "./VocabularyTagChips.jsx";
import { useDisplaySettings } from "../store/displaySettingsStore.js";
import {
    ChevronDown,
    Settings2,
    ArrowUpRight,
    ArrowRight,
    Eye,
    EyeOff,
    Heart,
    HeartOff,
    ArrowLeft,
    Bookmark,
    Tag,
} from "lucide-react";
import { Spinner } from "./shadcn/spinner.jsx";
import { YskBadge } from "./YskBadge.jsx";
import { SEARCH_DEBOUNCE_MS } from "../lib/timing.js";

// Map mã từ loại Hanzii → tên tiếng Việt (fallback khi backend trả code thô như "intj"
const detailTextClass = "wd-text m-0 max-w-full leading-normal break-normal";

const fieldStackClass = "word-detail-content flex w-full min-w-0 flex-col gap-4";

const valueShellClass = "w-full min-w-0";

const subLabelClass = "wd-sub m-0 font-semibold uppercase tracking-wide text-viet text-center";
// Edit mode: title hán tự dùng font-size lg (bỏ wd-sub để không bị rule CSS override size).
const subLabelClassLg = "m-0 font-semibold uppercase tracking-wide text-viet text-center text-lg";

const hanShellClass = "w-full rounded-xl bg-card/80 px-6 py-4 sm:px-8 sm:py-4 shadow-sm";

/** True when a meaning row has no content (added but left blank). */
function isMeaningBlank(m) {
    return !(m?.vietMeanings ?? "").trim() && !(m?.engMeanings ?? "").trim();
}

/** True when an example row has no content in any field (added but left blank). */
function isExampleBlank(ex) {
    return (
        !(ex?.hanSimplified ?? "").trim() &&
        !(ex?.hanTraditional ?? "").trim() &&
        !(ex?.hanExample ?? "").trim() &&
        !(ex?.jyutpingExample ?? "").trim() &&
        !(ex?.pinyinExample ?? "").trim() &&
        !(ex?.vietExamples ?? "").trim() &&
        !(ex?.engExamples ?? "").trim()
    );
}

/** Shared level palette — index 0 (thấp/hiếm) → 4 (cao/phổ biến).
 *  Dùng chung cho chip rank + badge HSK để trang detail 1 hệ màu duy nhất.
 *  KHÔNG dùng background — chỉ tô màu text để phân biệt level. */
const LEVEL_BADGE_CLASSES = [
    "text-red-600 dark:text-red-300", // 0: Hiếm / HSK 7-9
    "text-orange-600 dark:text-orange-300", // 1: Thấp / HSK 5-6
    "text-amber-600 dark:text-amber-300", // 2: Trung bình / HSK 3-4
    "text-blue-600 dark:text-blue-300", // 3: Cao / HSK 1-2
    "text-emerald-600 dark:text-emerald-300", // 4: Rất cao
];

/** Color-coded HSK level badge — dùng chung palette LEVEL_BADGE_CLASSES.
 *  Giữ gradient cũ: 1-2 xanh lá → 3-4 vàng → 5-6 cam → 7-9 đỏ. */
function hskLevelBadgeClass(level) {
    const match = String(level).match(/(\d+)/);
    const num = match ? parseInt(match[1], 10) : 0;
    if (num <= 2) return LEVEL_BADGE_CLASSES[4]; // emerald
    if (num <= 4) return LEVEL_BADGE_CLASSES[2]; // amber
    if (num <= 6) return LEVEL_BADGE_CLASSES[1]; // orange
    return LEVEL_BADGE_CLASSES[0]; // red
}

const hanCellClass = "flex h-full flex-col justify-center gap-4 items-center min-h-[12.5rem]";

const hanCellBodyClass = "wd-han-cell-body flex flex-col justify-start items-center gap-4";

const hanGlyphClass = "wd-han block text-[clamp(3rem,8vw,7rem)] leading-none";

const romanLineClass = cn(detailTextClass, "wd-roman font-semibold not-italic tracking-wide text-jyutping");

const pinyinLineClass = cn(detailTextClass, "wd-roman font-semibold not-italic tracking-wide text-pinyin");

const actionBarClass = "flex w-full items-center justify-between gap-2 min-h-10";

const headerBarClass = "flex w-full items-center justify-between gap-2 min-h-10";

const masteredBtnClass = (mastered) =>
    cn(
        "transition-[color,background-color,border-color,box-shadow,transform] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
        "active:enabled:scale-[0.98]",
        mastered
            ? "shadow-[0_1px_4px_color-mix(in_srgb,var(--primary)_18%,transparent)] ring-1 ring-primary/50"
            : "text-muted-foreground hover:enabled:border-muted/40 hover:enabled:text-foreground",
    );

function DetailField({ valueMinHeight, children }) {
    return <div className={cn(valueShellClass, valueMinHeight, "flex flex-col justify-center")}>{children}</div>;
}

/**
 * Per-character breakdown of a vocabulary (from `vocabulary.hanCharacters`).
 * Renders each han character with its aligned pinyin/jyutping, linking to the
 * HanCharacter detail page where a matching han character exists.
 */
function HanCharactersBreakdown({ vocabulary, relatedWords, activePinyin }) {
    const { t, locale } = useLocale();
    const navigate = useNavigate();
    const mandarinVocabularies = useMandarinVocabularies();
    const cantoneseVocabularies = useCantoneseVocabularies();
    // Từ ghép / đồng nghĩa / trái nghĩa — ưu tiên prop `relatedWords` (draft lúc edit — hiện
    // ngay sau Full Sync), fallback `vocabulary.relatedWords` (view mode sau khi lưu DB).
    // ⚠️ 2026-08-22: shape mới = MAP theo pinyin (đổi reading là đổi related). Chọn theo
    // `activePinyin`; fallback tone đầu tiên / shape cũ (không key pinyin).
    const rw = relatedWords ?? vocabulary.relatedWords ?? {};
    let toneRw = rw;
    if (rw && typeof rw === "object" && !Array.isArray(rw) && !Array.isArray(rw.compound)) {
        toneRw = rw[activePinyin] ?? Object.values(rw)[0] ?? rw;
    }
    const hasHan = Boolean(
        (vocabulary.hanTraditional ?? "").trim() ||
        (vocabulary.hanSimplified ?? "").trim() ||
        (vocabulary.hanHongKong ?? "").trim(),
    );
    if (!hasHan) return null;

    // Ngôn ngữ của TỪ ĐANG XEM quyết định kho nguồn & form hán tự (2026-09-08):
    //   - Cantonese → CHỈ tìm trong kho Cantonese, CHỈ dựa trên hanHongKong (KHÔNG fallback).
    //   - Mandarin  → CHỈ tìm trong kho Mandarin, CHỈ dựa trên hanziSimplified (KHÔNG fallback).
    const isCantonese = Boolean(String(vocabulary.hanHongKong ?? "").trim());
    const mainHan = useMemo(() => {
        // Không fallback: dùng đúng form của ngôn ngữ đang xem.
        return isCantonese
            ? String(vocabulary.hanHongKong ?? "").trim()
            : String(vocabulary.hanSimplified ?? "").trim();
    }, [isCantonese, vocabulary.hanHongKong, vocabulary.hanSimplified]);

    // Kho nguồn theo ĐÚNG ngôn ngữ của từ (không phụ thuộc bank đang active).
    const langVocabularies = useMemo(
        () => (isCantonese ? cantoneseVocabularies : mandarinVocabularies),
        [isCantonese, cantoneseVocabularies, mandarinVocabularies],
    );

    // Map han → vocab CÓ TRONG KHO ĐÚNG NGÔN NGỮ (để chip chỉ link khi từ tồn tại trong DB —
    // từ chưa có thì hiện mờ, không click → tránh ra trang "not found"). (2026-08-22)
    const vocabByHan = useMemo(() => {
        const map = new Map();
        for (const v of langVocabularies) {
            const trad = (v.hanTraditional || "").trim();
            const simp = (v.hanSimplified || "").trim();
            const hk = (v.hanHongKong || "").trim();
            if (trad && !map.has(trad)) map.set(trad, v);
            if (simp && !map.has(simp)) map.set(simp, v);
            if (hk && !map.has(hk)) map.set(hk, v);
        }
        return map;
    }, [langVocabularies]);

    // ── Gợi ý "Từ ghép / Cấu tạo" TỰ ĐỘNG (2026-08-25, mở rộng 2026-09-08) ──
    // ⚠️ KHÔNG dùng dữ liệu compound từ relatedWords (Hanzii) — gợi ý đó lệch form/lạc kho (đã bỏ
    // 2026-09-08). Luôn tự tính từ kho ĐÚNG ngôn ngữ:
    //   - Từ đơn (1 ký tự)   → các từ ghép (dài hơn) CÓ CHỨA nó trong kho.
    //   - Từ ghép (≥2 ký tự) → các từ đơn CẤU TẠO nên nó (từng ký tự Hán duy nhất).
    // Giới hạn 10 từ cho trường hợp từ đơn.
    const isSingleChar = useMemo(() => Boolean(mainHan) && Array.from(mainHan).length === 1, [mainHan]);

    const autoItems = useMemo(() => {
        if (!mainHan) return [];
        const seen = new Set();
        // Từ ghép → các từ đơn cấu tạo nên nó (mỗi ký tự Hán duy nhất của chính nó).
        if (!isSingleChar) {
            const items = [];
            for (const ch of Array.from(mainHan)) {
                if (!seen.has(ch)) {
                    seen.add(ch);
                    items.push(ch);
                }
            }
            return items;
        }
        // Từ đơn → từ ghép trong kho có chứa nó (dài hơn), giới hạn 10.
        const items = [];
        for (const v of langVocabularies) {
            // Chỉ so với đúng form của ngôn ngữ đang xem (không fallback chéo form).
            const f = isCantonese ? String(v.hanHongKong ?? "").trim() : String(v.hanSimplified ?? "").trim();
            if (!f) continue;
            if (f.length > 1 && f.includes(mainHan) && !seen.has(f)) {
                seen.add(f);
                items.push(f);
            }
            if (items.length >= 10) break;
        }
        return items;
    }, [isCantonese, isSingleChar, mainHan, langVocabularies]);

    const sections = [
        {
            key: "compound",
            // ⚠️ 2026-09-08: CHỈ dùng gợi ý TỰ ĐỘNG từ kho đúng ngôn ngữ (autoItems). KHÔNG dùng
            // dữ liệu compound từ Hanzii/relatedWords (gợi ý sai form/lạc kho — đã bỏ).
            label: isSingleChar
                ? (t.wordDetail?.compoundWords ?? "Từ ghép")
                : (t.wordDetail?.compoundParts ?? "Từ đơn cấu tạo"),
            items: autoItems,
        },
        {
            key: "synonyms",
            label: t.wordDetail?.synonyms ?? "Từ đồng nghĩa",
            items: Array.isArray(toneRw.synonyms) ? toneRw.synonyms : [],
        },
        {
            key: "antonyms",
            label: t.wordDetail?.antonyms ?? "Từ trái nghĩa",
            items: Array.isArray(toneRw.antonyms) ? toneRw.antonyms : [],
        },
    ];

    return (
        <div className="w-full flex flex-col gap-6">
            <div className="w-full px-4 py-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
                    {sections.map((group, gi) => (
                        <Fragment key={group.key}>
                            {gi > 0 && (
                                <Separator
                                    orientation="vertical"
                                    className="hidden h-auto w-px shrink-0 bg-border lg:block"
                                />
                            )}
                            <div className="flex min-h-24 flex-1 flex-col items-center justify-start gap-2 px-3 py-4 text-center">
                                <p className="m-0 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                                    {group.label}
                                </p>
                                {group.items.length ? (
                                    <div className="flex flex-wrap justify-center gap-2">
                                        {(() => {
                                            // Loại chip TRÙNG hán tự (dữ liệu Hanzii có thể lặp, VD "开发" 2 lần) →
                                            // tránh duplicate key + chip lặp. (2026-09-08)
                                            const seenHan = new Set();
                                            return group.items.map((it) => {
                                                // Item = hanzi (string); vẫn chấp nhận {han} cũ.
                                                const han = typeof it === "string" ? it : (it?.han ?? "");
                                                if (!han || seenHan.has(han)) return null;
                                                seenHan.add(han);
                                                // Từ đã có trong kho → click mở detail trong app; chưa có trong kho
                                                // → click mở Hanzii tìm từ đó (2026-09-08). Chip thiếu dữ liệu app vẫn
                                                // MỜ để phân biệt, hover lên để biết là bấm được.
                                                const exists = vocabByHan.has(han);
                                                // Sino TỰ CẬP NHẬT TỪ DATA APP (store) — không lấy từ Hanzii. (2026-08-22)
                                                const appSino = exists
                                                    ? (vocabByHan.get(han)?.sinoVietnamese ?? "")
                                                    : "";
                                                const inner = (
                                                    <>
                                                        {appSino && (
                                                            <span className="text-xs font-semibold text-muted-foreground leading-tight">
                                                                {appSino}
                                                            </span>
                                                        )}
                                                        <span
                                                            className={cn(
                                                                "wd-han text-base font-semibold leading-tight",
                                                                isCantonese ? "text-han-trad" : "text-han-simp",
                                                            )}
                                                        >
                                                            {han}
                                                        </span>
                                                    </>
                                                );
                                                const baseChipClass =
                                                    "flex flex-col items-center gap-0.5 rounded-lg border border-border/70 bg-muted px-2.5 py-1.5 transition-colors cursor-pointer hover:border-primary/25 hover:bg-primary/10";
                                                const chipTitle = exists
                                                    ? appSino
                                                        ? `${appSino} ${han}`
                                                        : han
                                                    : `${han} · ${t.wordDetail?.notInBank ?? "Chưa có trong kho từ vựng"} — ${(
                                                          t.wordDetail?.openHanzii ?? "Tra Hanzii"
                                                      ).replace("{hanTraditional}", han)}`;
                                                return exists ? (
                                                    <button
                                                        key={han}
                                                        type="button"
                                                        className={baseChipClass}
                                                        onClick={() => navigate(vocabularyDetailPath(han))}
                                                        title={chipTitle}
                                                    >
                                                        {inner}
                                                    </button>
                                                ) : (
                                                    <a
                                                        key={han}
                                                        href={hanziiWordUrl(han, locale) ?? "#"}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className={cn(
                                                            baseChipClass,
                                                            "no-underline opacity-50 hover:opacity-100",
                                                        )}
                                                        title={chipTitle}
                                                        aria-label={chipTitle}
                                                    >
                                                        {inner}
                                                    </a>
                                                );
                                            });
                                        })()}
                                    </div>
                                ) : (
                                    <p className="m-0 text-sm italic text-muted-foreground">
                                        {t.wordDetail?.noRelatedData ?? "Chưa có dữ liệu"}
                                    </p>
                                )}
                            </div>
                        </Fragment>
                    ))}
                </div>
            </div>
        </div>
    );
}

function HanSubField({ label, children }) {
    return (
        <div className={hanCellClass}>
            {label ? (
                <div className="flex flex-col items-center gap-1">
                    <p className={subLabelClass}>{label}</p>
                </div>
            ) : null}
            <div className={hanCellBodyClass}>{children}</div>
        </div>
    );
}

/**
 * Compact lexicon metadata chips (boost/movie/book rank) rendered in the
 * top-left of the word detail, sharing the header row with the HSK label.
 */
/**
 * Read-only related words stored in the DB (tw field).
 * Numeric lexicon stats now live in the top-left header (LexiconMetaChips).
 */
function LexiconInfo({ vocabulary, t }) {
    const navigate = useNavigate();
    const relatedWords = Array.isArray(vocabulary.relatedWords) ? vocabulary.relatedWords : [];
    const allVocabs = useVocabularies();
    // Lookup map han → vocabulary (vietMeanings, pinyin, jyutping, sinoVietnamese)
    const vocabByHan = useMemo(() => {
        const map = new Map();
        for (const v of allVocabs) {
            const trad = (v.hanTraditional || "").trim();
            const simp = (v.hanSimplified || "").trim();
            if (trad && !map.has(trad)) map.set(trad, v);
            if (simp && simp !== trad && !map.has(simp)) map.set(simp, v);
        }
        return map;
    }, [allVocabs]);

    // Only show related words that exist in the vocabularies DB (avoid dangling entries).
    const matched = useMemo(
        () => relatedWords.filter((rw) => vocabByHan.has(String(rw?.trad || rw?.word || "").trim())),
        [relatedWords, vocabByHan],
    );

    if (matched.length === 0) return null;

    return (
        <div className="w-full flex flex-col gap-6">
            <Separator />
            <div className="rounded-xl bg-muted/40 p-4">
                <h3 className="m-0 mb-3 text-center text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    {t.wordDetail.relatedWords}
                </h3>
                <div className="flex flex-wrap gap-2">
                    {matched.map((rw, i) => {
                        const han = rw?.trad || rw?.word;
                        const rv = vocabByHan.get(han);
                        const viet = rv?.vietMeanings;
                        const pinyin = rv?.pinyin;
                        const jyutping = rv?.jyutping;
                        const sino = rv?.sinoVietnamese;
                        const chipClass =
                            "flex flex-col items-center gap-1 rounded-lg border border-border/70 bg-background px-3 py-2 text-sm text-center";
                        const inner = (
                            <>
                                {sino && <span className="text-xs font-semibold text-foreground">{sino}</span>}
                                <span className="wd-han text-lg leading-none text-han-trad font-semibold">{han}</span>
                                {(pinyin || jyutping) && (
                                    <ReadingPair
                                        left={pinyin}
                                        right={jyutping}
                                        leftClass="text-xs text-pinyin font-semibold"
                                        rightClass="text-xs text-jyutping font-semibold"
                                        containerClass="gap-1.5 w-auto min-w-0"
                                    />
                                )}
                                {viet && <span className="text-xs font-medium text-foreground">{viet}</span>}
                                <span className="text-xs text-muted-foreground">
                                    {capitalizeSentences(rw?.gloss) || han}
                                </span>
                            </>
                        );
                        return (
                            <button
                                key={i}
                                type="button"
                                className={cn(
                                    chipClass,
                                    "cursor-pointer transition-colors hover:border-primary/25 hover:bg-primary/10",
                                )}
                                onClick={() =>
                                    navigate(
                                        vocabularyDetailPath(rv.hanSimplified || rv.hanHongKong || rv.hanTraditional),
                                    )
                                }
                                title={rv.hanSimplified || rv.hanHongKong || rv.hanTraditional || han}
                            >
                                {inner}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

/** Indicator check trùng lặp — hiển thị ngay dưới ô hán đang điền (từng cột riêng). */
function DupIndicator({ dupCheck, onShow, hanValue, t }) {
    if (!dupCheck) return null;
    const hasHan = typeof hanValue === "string" && hanValue.trim().length > 0;
    if (!hasHan) return null;
    if (dupCheck.checking) {
        return (
            <p className="m-0 flex items-center gap-2 rounded-lg border border-border bg-muted px-4 py-2 text-sm text-muted-foreground">
                <Spinner className="size-3.5" />
                {t.wordDetail.duplicateChecking}
            </p>
        );
    }
    if (dupCheck.matches && dupCheck.matches.length > 0) {
        return (
            <button
                type="button"
                className="m-0 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-left hover:bg-destructive/20 transition-colors cursor-pointer"
                onClick={() => onShow?.(dupCheck.matches)}
            >
                <span className="text-destructive font-medium">
                    {t.wordDetail.duplicateWarning.replace("{count}", String(dupCheck.matches.length))}
                </span>
            </button>
        );
    }
    return (
        <p className="m-0 flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-4 py-2 text-sm text-success">
            {t.wordDetail.duplicateNone}
        </p>
    );
}

/** Chuẩn hóa 1 bản ghi trùng (summary find-by-han HOẶC full by-ids) → view popup chi tiết (2026-09-09). */
function dupVocabToView(v, lang) {
    const isC = lang === "cantonese";
    const han = isC
        ? String(v?.hanziTraditionalHk ?? v?.hanHongKong ?? "").trim()
        : String(v?.hanziSimplified ?? v?.hanziTraditional ?? "").trim();
    const hsk = !isC ? String(v?.hskLevel ?? "").trim() : "";
    const pure = isC ? Boolean(v?.pureCantonese) : false;
    if (Array.isArray(v?.readings) && v.readings.length > 0) {
        return {
            id: v?.id ?? "",
            han,
            isC,
            hsk,
            pure,
            readings: v.readings.map((r) => ({
                roman: String(r?.[isC ? "jyutping" : "pinyin"] ?? "").trim(),
                sino: String(r?.sinoVietnamese ?? "").trim(),
                meanings: (r?.meanings ?? [])
                    .map((m) => ({
                        gloss: !isC ? String(m?.zh ?? "").trim() : "",
                        vi: String(m?.vi ?? "").trim(),
                        en: String(m?.en ?? "").trim(),
                        examples: (m?.examples ?? []).length,
                    }))
                    .filter((m) => m.gloss || m.vi || m.en),
            })),
        };
    }
    // Summary (find-by-han): 1 reading gộp + meaning đầu tiên.
    return {
        id: v?.id ?? "",
        han,
        isC,
        hsk,
        pure,
        readings: [
            {
                roman: String(v?.[isC ? "jyutping" : "pinyin"] ?? "").trim(),
                sino: String(v?.sinoVietnamese ?? "").trim(),
                meanings: [
                    {
                        gloss: "",
                        vi: String(v?.vietMeanings ?? "").trim(),
                        en: String(v?.engMeanings ?? "").trim(),
                        examples: 0,
                    },
                ].filter((m) => m.vi || m.en),
            },
        ].filter((r) => r.roman || r.sino || r.meanings.length > 0),
    };
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
    pureCantonese,
    column,
    dupCheck = null,
    onShowDuplicates,
    showSuggestion = true, // Cantonese hero: tắt cột "Gợi ý giản thể" khi đã có cột Mandarin riêng (2 cột layout)
    hanziAudio = null,
    englishAudio = null,
    autoFocus = false, // Add mode: auto-focus ô hán tự đầu tiên (2026-08-29)
}) {
    const { t } = useLocale();
    // Gợi ý giản thể (HK → giản thể, chỉ khi tìm thấy trong kho Mandarin) — cột phải hero
    // Cantonese. ⚠️ 2026-09-02: tra ON-DEMAND qua /api/hanzi/simplified-suggestion khi xem vocab
    // (xóa hkSuggestionMap precompute) — loading hiện skeleton. pinyin/sino lấy từ store
    // mandarinVocabularies bằng cách tra theo simplified.
    const hkForm = !editing ? String(display?.hongKong ?? "").trim() : "";
    const { suggestion, loading: suggestionLoading } = useHkSuggestion(hkForm);
    const mandarinVocabularies = useMandarinVocabularies();
    // Vocab mandarin khớp với simplified gợi ý → lấy pinyin/sino để render cột gợi ý.
    const suggestedVocab = useMemo(() => {
        const simp = (suggestion?.simplified ?? "").trim();
        if (!simp) return null;
        return mandarinVocabularies.find((v) => (v.hanSimplified ?? "").trim() === simp) ?? null;
    }, [suggestion, mandarinVocabularies]);

    /** Copy a han phrase to clipboard. */
    const copyHanChar = (ch) => {
        const text = String(ch ?? "");
        if (!text) return;
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(text).catch(() => {});
        } else {
            const ta = document.createElement("textarea");
            ta.value = text;
            ta.setAttribute("readonly", "");
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            try {
                document.execCommand("copy");
            } catch {
                /* ignore */
            }
            document.body.removeChild(ta);
        }
    };

    /** Render text as one clickable han phrase (click = copy the whole phrase).
     *  Mỗi ký tự nằm trong <span> riêng để đồng nhất cấu trúc DOM với
     *  renderHanWithDiff — tránh khác biệt rasterize (độ dày nét) giữa 2 cột. */
    function renderHanText(text) {
        if (!text) return null;
        return (
            <button
                type="button"
                className="relative inline cursor-pointer border-0 bg-transparent p-0 font-inherit text-inherit leading-tight rounded transition-opacity duration-150 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
                onClick={(e) => {
                    e.stopPropagation();
                    copyHanChar(text);
                }}
                title={`${text} — ${t.common?.copy ?? "Copy"}`}
            >
                {[...text].map((c, i) => (
                    <span key={i}>{c}</span>
                ))}
            </button>
        );
    }

    /** Render text giữ nguyên màu cột (xanh cho Mandarin), chữ KHÁC bản kia
     *  được gạch chân chấm để nhận biết — không đổi màu chữ. */
    function renderHanWithDiffMark(text, diffChars) {
        if (!text) return null;
        const hasDiff = diffChars && diffChars.length > 0 && text.length > 1;
        if (!hasDiff) return renderHanText(text);
        return (
            <button
                type="button"
                className="relative inline cursor-pointer border-0 bg-transparent p-0 font-inherit text-inherit leading-tight rounded transition-opacity duration-150 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
                onClick={(e) => {
                    e.stopPropagation();
                    copyHanChar(text);
                }}
                title={`${text} — ${t.common?.copy ?? "Copy"}`}
            >
                {diffChars.map((c, i) => (
                    <span key={i} className={cn("relative inline-flex", !c.same && "")}>
                        {!c.same && (
                            <span
                                className="absolute -top-2 left-1/2 -translate-x-1/2 size-1.5 rounded-full bg-yellow-500"
                                aria-hidden="true"
                            />
                        )}
                        {c.char}
                    </span>
                ))}
            </button>
        );
    }

    const shellClass = hanShellClass;

    // Chữ khác giữa Mandarin (simp) và Cantonese (HK) — để chấm vàng.
    const same = display.traditional === (display.simplified || display.traditional);
    const hanDiff = same ? null : diffHanChars({ traditional: display.traditional, simplified: display.simplified });

    const hanText = display.simplified || display.traditional;

    if (editing) {
        // Dùng class wd-han (CSS thật trong globals.css, cùng size view mode 54.6px)
        // thay vì text-[clamp(...)] arbitrary (Tailwind không generate → rơi về 15px base input).
        const hanEditClass =
            "wd-han font-semibold bg-transparent border-b-2 border-border focus-visible:border-primary/25 text-center h-auto py-4 px-0 leading-none rounded-none";
        // Edit: 2 field — Giản thể + Phồn thể (HK). Khi có `column` → chỉ render 1 cột
        // (dùng trong layout 2 container trái/phải tách biệt, giống view mode).
        if (column === "mandarin") {
            return (
                <div className="flex w-full flex-col items-center gap-4">
                    {/* 2026-08-21: 2 title TÁCH 2 BÊN — mỗi title trên mỗi cột (Giản thể | Phồn thể) */}
                    <div className="grid w-full grid-cols-2 items-stretch gap-4">
                        <div className="flex flex-col items-center gap-2">
                            <p className={subLabelClassLg}>{t.wordBank.colHanTitleMandarin}</p>
                            <Input
                                className={cn(hanEditClass, "text-han-simp w-full")}
                                autoFocus={autoFocus}
                                value={draft.hanSimplified ?? ""}
                                onChange={(e) => onDraftChange("hanSimplified", e.target.value)}
                            />
                        </div>
                        <div className="flex flex-col items-center gap-2">
                            <p className={subLabelClassLg}>{t.wordBank.colHanTitleMandarinTrad}</p>
                            <Input
                                className={cn(hanEditClass, "text-han-mtrad w-full")}
                                value={draft.hanTraditional ?? ""}
                                onChange={(e) => onDraftChange("hanTraditional", e.target.value)}
                            />
                        </div>
                    </div>
                    <DupIndicator dupCheck={dupCheck} onShow={onShowDuplicates} hanValue={draft.hanSimplified} t={t} />
                </div>
            );
        }
        if (column === "cantonese") {
            return (
                <div className="flex flex-col items-center gap-4">
                    <p className={subLabelClassLg}>{t.wordBank.colHanTitleCantonese}</p>
                    <div className={cn(hanCellBodyClass, "w-full")}>
                        <Input
                            className={cn(hanEditClass, "text-han-trad w-full")}
                            autoFocus={autoFocus}
                            value={draft.hanHongKong ?? ""}
                            onChange={(e) => onDraftChange("hanHongKong", e.target.value)}
                        />
                    </div>
                    <DupIndicator dupCheck={dupCheck} onShow={onShowDuplicates} hanValue={draft.hanHongKong} t={t} />
                </div>
            );
        }
        return (
            <div className={shellClass}>
                <div className={cn("grid grid-cols-1 items-stretch sm:grid-cols-2 sm:gap-6")}>
                    <HanSubField label={t.wordBank.colHanTitleMandarin}>
                        <Input
                            className={cn(hanEditClass, "text-han-simp")}
                            autoFocus={autoFocus}
                            value={draft.hanSimplified ?? ""}
                            onChange={(e) => onDraftChange("hanSimplified", e.target.value)}
                        />
                    </HanSubField>
                    <HanSubField label={t.wordBank.colHanTitleCantonese}>
                        <Input
                            className={cn(hanEditClass, "text-han-trad")}
                            value={draft.hanHongKong ?? ""}
                            onChange={(e) => onDraftChange("hanHongKong", e.target.value)}
                        />
                    </HanSubField>
                </div>
            </div>
        );
    }

    // View mode — render 1 cột riêng (Mandarin / Cantonese) cho layout 2 cột chính.
    // 3 dòng sino / hanzi / romanization căn thẳng CỘT DỌC theo từng ký tự Hán
    // (line hanzi làm chuẩn — áp dụng mọi từ).
    // Mandarin (2026-08-18): hiển thị ĐỦ 2 cột — Giản thể (simp + pinyin) | Phồn thể (trad).
    if (!editing && column === "mandarin") {
        const hanStandard = display.simplified?.trim() ? display.simplified : "";
        const tradStandard = display.traditional?.trim() ? display.traditional : "";
        const columns = buildAlignedColumns(hanStandard, sinoVietnamese, pinyin);
        const tradColumns = buildAlignedColumns(tradStandard, sinoVietnamese, pinyin);
        return (
            <div className="flex w-full flex-col items-center gap-6">
                <div className="grid w-full grid-cols-1 items-stretch gap-6 sm:grid-cols-2">
                    <div className="flex min-h-32 flex-col items-start justify-center gap-4">
                        <p className="m-0 text-xl font-medium tracking-wide text-center text-viet">
                            {t.wordBank.colHanTitleMandarin}
                        </p>
                        <div className="flex min-h-0 flex-1 items-center justify-center gap-3">
                            {columns.length > 0 ? (
                                <AlignedHanColumns
                                    columns={columns}
                                    hanClass="text-han-simp text-6xl!"
                                    romanClass="text-muted-foreground"
                                    diffFlags={null}
                                    copyText={hanStandard}
                                    onCopy={copyHanChar}
                                    t={t}
                                />
                            ) : (
                                <span className="italic text-muted-foreground">-</span>
                            )}
                            {/* 🔊 Mandarin (giản thể): ƯU TIÊN gTTS zh-CN (server, cache R2), fallback giọng Windows. (2026-08-25)
                                ⚠️ 2026-09-17: size="icon" (36px/20px) + màu muted → ĐỒNG NHẤT với nút mark ★🔖 ở header. */}
                            {hanStandard && (
                                <AudioPlayButton
                                    mandarinText={hanStandard}
                                    title={t.wordDetail?.listenHan}
                                    size="icon"
                                    className="text-muted-foreground"
                                />
                            )}
                        </div>
                    </div>
                    <div className="flex min-h-32 flex-col items-start justify-center gap-4">
                        <p className="m-0 text-xl font-medium tracking-wide text-center text-viet">
                            {t.wordBank.colHanTitleMandarinTrad}
                        </p>
                        {tradColumns.length > 0 ? (
                            <AlignedHanColumns
                                columns={tradColumns}
                                hanClass="text-han-mtrad text-6xl!"
                                romanClass="text-muted-foreground"
                                diffFlags={hanDiff?.trad ?? null}
                                copyText={tradStandard}
                                onCopy={copyHanChar}
                                t={t}
                            />
                        ) : (
                            <span className="italic text-muted-foreground">-</span>
                        )}
                    </div>
                </div>
            </div>
        );
    }
    if (!editing && column === "cantonese") {
        // Trái = Phồn thể HK (luôn). Phải = Gợi ý giản thể Mandarin — CHỈ render khi tìm
        // thấy gợi ý; không có → KHÔNG hiện title/div nào cả. Đang tra gợi ý ON-DEMAND
        // (2026-09-02) → hiện skeleton. (showSuggestion=false: layout 2 cột Quảng|Quan thoại
        // → chỉ 1 cột HK, bỏ cột gợi ý.)
        const hk = display.hongKong?.trim() ? display.hongKong : "";
        const hkColumns = buildAlignedColumns(hk, sinoVietnamese, jyutping);
        // Cột gợi ý: simplified từ response gợi ý + pinyin/sino từ store mandarin (tra theo simplified).
        const suggest = showSuggestion && suggestedVocab ? suggestedVocab : null;
        const suggestColumns = suggest
            ? buildAlignedColumns(
                  (suggest.hanSimplified ?? "").trim(),
                  (suggest.sinoVietnamese ?? "").trim(),
                  (suggest.pinyin ?? "").trim(),
              )
            : [];
        // items-start: cụm hero sát TRÁI (giống mandarin hero) — 2026-08-21
        const columnShell = "flex min-h-32 flex-col items-start gap-4";
        return (
            <div className="flex w-full flex-col items-center gap-6">
                <div
                    className={cn(
                        "grid w-full items-stretch gap-6",
                        showSuggestion ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1",
                    )}
                >
                    {/* Trái: Phồn thể HK */}
                    <div className={columnShell}>
                        <div className="shrink-0">
                            <p className="m-0 text-xl font-medium tracking-wide text-center text-viet">
                                {t.wordBank.colHanTitleCantonese}
                            </p>
                        </div>
                        <div className="flex min-h-0 flex-1 items-center justify-center gap-3">
                            {hkColumns.length > 0 ? (
                                <AlignedHanColumns
                                    columns={hkColumns}
                                    hanClass="text-han-trad text-6xl!"
                                    romanClass="text-muted-foreground"
                                    diffFlags={null}
                                    copyText={hk}
                                    onCopy={copyHanChar}
                                    t={t}
                                />
                            ) : (
                                <span className="italic text-muted-foreground">-</span>
                            )}
                            {/* Nút audio từ — 🔊 hán ở hero; size="icon" (36px/20px) + màu muted → ĐỒNG NHẤT
                                với nút mark ★🔖 ở header (2026-09-17). 🔊 Anh đưa xuống nghĩa tiếng Anh (2026-08-22)
                                Cantonese: ƯU TIÊN gTTS yue (server, cache R2), fallback giọng Windows Tracy. (2026-08-25) */}
                            {hk && (
                                <AudioPlayButton
                                    cantoneseText={hk}
                                    title={t.wordDetail?.listenHan}
                                    size="icon"
                                    className="text-muted-foreground"
                                />
                            )}
                        </div>
                    </div>
                    {/* Phải: Gợi ý giản thể — LUÔN giữ 2 cột (tránh giật khung khi load từ khác);
                        không có gợi ý → div TRỐNG (không title, không details). Đang tra on-demand
                        (2026-09-02) → hiện skeleton thay cho div trống. */}
                    {showSuggestion && (
                        <div className={columnShell}>
                            {suggestionLoading ? (
                                <div className="flex min-h-32 w-full flex-col items-center justify-center gap-4">
                                    <Skeleton className="h-8 w-40 rounded-lg" />
                                    <Skeleton className="h-6 w-28 rounded-lg" />
                                </div>
                            ) : (
                                suggest && (
                                    <>
                                        <div className="shrink-0">
                                            <p className="m-0 text-xl font-medium tracking-wide text-center text-viet">
                                                {t.wordBank.colHanSuggestedSimplified}
                                            </p>
                                        </div>
                                        <div className="flex min-h-0 flex-1 items-center justify-center">
                                            {suggestColumns.length > 0 ? (
                                                <AlignedHanColumns
                                                    columns={suggestColumns}
                                                    hanClass="text-han-simp text-6xl!"
                                                    romanClass="text-muted-foreground"
                                                    diffFlags={null}
                                                    copyText={suggest.simplified}
                                                    onCopy={copyHanChar}
                                                    t={t}
                                                />
                                            ) : (
                                                <span className="italic text-muted-foreground">-</span>
                                            )}
                                        </div>
                                    </>
                                )
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className={shellClass}>
            {sinoVietnamese?.trim() && (
                <p className={cn(pinyinLineClass, "text-center mb-4 text-foreground font-medium")}>
                    {displaySinoVietnameseAligned(sinoVietnamese, hanText)}
                </p>
            )}
            <div className="grid grid-cols-1 items-stretch sm:grid-cols-2 sm:gap-6">
                <HanSubField label={t.wordBank.colHanTitleMandarin}>
                    <span className={cn(hanGlyphClass, "font-semibold text-han-simp")}>
                        {display.simplified?.trim() ? (
                            hanDiff ? (
                                renderHanWithDiffMark(display.simplified, hanDiff.simp)
                            ) : (
                                renderHanText(display.simplified)
                            )
                        ) : (
                            <span className="italic text-muted-foreground">-</span>
                        )}
                    </span>
                    <p className={cn(pinyinLineClass, "text-center")}>
                        {pinyin || <span className="italic text-muted-foreground">-</span>}
                    </p>
                </HanSubField>
                <HanSubField label={t.wordBank.colHanTitleCantonese}>
                    <span className={cn(hanGlyphClass, "font-semibold text-han-trad")}>
                        {display.hongKong?.trim() ? (
                            renderHanText(display.hongKong)
                        ) : (
                            <span className="italic text-muted-foreground">-</span>
                        )}
                    </span>
                    <p className={cn(romanLineClass, "text-center")}>
                        {jyutping || <span className="italic text-muted-foreground">-</span>}
                    </p>
                </HanSubField>
            </div>
        </div>
    );
}

/** Header ngắn cho 1 reading: `Mandarin · NHẤT | yī` hoặc `Cantonese · NHẤT | jat1`.
 *  Khi có `readings` (mảng): render TOÀN BỘ chip cách đọc dạng ToggleGroup, item active
 *  được tô đậm; bấm item để chọn cách đọc khác. */
function ReadingHeader({ type, reading, readings, activeKey, onSelect, trailing }) {
    const { t } = useLocale();
    const isPinyin = type === "pinyin";
    const valueOf = (r) => (isPinyin ? (r?.pinyin ?? "") : (r?.jyutping ?? ""));

    // Dedupe readings trùng phiên âm → chỉ render 1 chip/1 giá trị.
    // Reading CHƯA điền value (rỗng — reading mới trong edit) giữ riêng từng chip (key riêng).
    const uniqueReadings = (
        Array.isArray(readings)
            ? readings.filter((r, i, arr) => {
                  const v = valueOf(r);
                  if (!v) return true;
                  return arr.findIndex((x) => valueOf(x) === v) === i;
              })
            : []
    ).sort((a, b) => (isPinyin ? comparePinyinTone(valueOf(a), valueOf(b)) : 0));
    // Chỉ hiện group switch khi từ có NHIỀU hơn 1 phiên âm KHÁC NHAU (dedupe trùng).
    // Không có switch (rỗng hoặc chỉ 1 phiên âm) → ẩn tabs NHƯNG VẪN render trailing
    // (VD fast-link cột mandarin) nếu có. (2026-08-23)
    const multi = new Set(uniqueReadings.map((r) => valueOf(r)).filter(Boolean)).size > 1;
    if (uniqueReadings.length === 0 || !multi) {
        return trailing ? <div className="flex flex-wrap items-center justify-start gap-2">{trailing}</div> : null;
    }
    return (
        <div className="flex flex-wrap items-center justify-start gap-2">
            <Tabs
                value={activeKey ?? ""}
                onValueChange={(key) => {
                    if (key && key !== activeKey) onSelect?.(key);
                }}
                aria-label={isPinyin ? t.wordDetail.cyclePinyin : t.wordDetail.cycleJyutping}
                className="w-fit"
            >
                <TabsList>
                    {uniqueReadings.map((r) => {
                        const rValue = valueOf(r);
                        const active = Boolean(onSelect && r.key === activeKey);
                        return (
                            <TabsTrigger key={r.key} value={r.key} className="min-w-[6ch]" aria-label={rValue}>
                                {rValue && <span className="text-sm font-medium text-foreground">{rValue}</span>}
                            </TabsTrigger>
                        );
                    })}
                </TabsList>
            </Tabs>
            {/* Fast-link đặt SAU group switch phiên âm (cùng hàng) — 2026-08-23 */}
            {trailing}
        </div>
    );
}

/** Dropdown chọn "Độ phổ biến" (5 mức) — dùng trong EDIT (thay pill view). 2026-09-05. */
function PopularityLevelEdit({ value, onChange }) {
    const { t } = useLocale();
    return (
        <div className="flex flex-wrap items-center justify-start gap-2">
            <span className="text-sm font-medium text-foreground">{t.wordPopularity.title}:</span>
            <Select value={String(value ?? "")} onValueChange={(v) => onChange(v ? Number(v) : null)}>
                <SelectTrigger className="h-9 w-auto min-w-44 rounded-full">
                    <SelectValue>
                        {(val) => {
                            const n = Number(val);
                            // ⚠️ 2026-09-20: màu chữ theo cấp (giống chip ở view mode).
                            return (
                                <span
                                    className={
                                        normalizePopularityLevel(n)
                                            ? popularityLevelTextClass(n)
                                            : "text-muted-foreground"
                                    }
                                >
                                    {n ? t.wordPopularity.levels[n - 1] : t.wordPopularity.unset}
                                </span>
                            );
                        }}
                    </SelectValue>
                </SelectTrigger>
                <SelectContent>
                    <SelectGroup>
                        <SelectItem value="">{t.wordPopularity.unset}</SelectItem>
                        {t.wordPopularity.levels.map((label, i) => (
                            <SelectItem key={i + 1} value={String(i + 1)}>
                                {label}
                            </SelectItem>
                        ))}
                    </SelectGroup>
                </SelectContent>
            </Select>
        </div>
    );
}

/**
 * Khối meanings của 1 reading (Mandarin hoặc Cantonese) ở view mode.
 * Nghĩa nhóm theo dict nguồn (words.hk → 粵典–words.hk, CC-Canto), ví dụ
 * collapse được. Rỗng → hiện noMeaningsYet.
 */
function ReadingMeaningsBlock({
    reading,
    type,
    t,
    fmt,
    hanTraditional,
    hanSimplified,
    hanHongKong,
    onAddMeaning,
    showHeader = true,
    showEmpty = true,
    englishAudio = null, // audio nghĩa tiếng Anh của TỪ (CC101) — hiện cạnh nghĩa Anh đầu tiên
}) {
    return (
        <div className="flex flex-col gap-8">
            {showHeader && <ReadingHeader type={type} reading={reading} />}
            {/* ⚠️ 2026-09-19: thân (nghĩa + ví dụ) đã tách sang `VocabularyMeaningsBlock`
                (`VocabularyContent.jsx`) — DÙNG CHUNG với thẻ flashcard, hết 2 bản markup song song. */}
            <VocabularyMeaningsBlock
                meanings={reading?.meanings ?? []}
                type={type}
                t={t}
                fmt={fmt}
                hanTraditional={hanTraditional}
                hanSimplified={hanSimplified}
                hanHongKong={hanHongKong}
                englishAudio={englishAudio}
                showEmpty={showEmpty}
                onAddMeaning={onAddMeaning}
            />
        </div>
    );
}

export function VocabularyDetailContent({
    vocabulary,
    // ⚠️ 2026-09-19: bản ghi SẼ ĐƯỢC SỬA — khi cùng 1 hán có NHIỀU row DB (mỗi row 1 phiên âm
    // + nghĩa riêng, VD 追: `zeoi1` 7 nghĩa / `zeoi1 pou1` 1 nghĩa) thì view gộp readings của
    // mọi row thành tab, nhưng form Sửa chỉ dựng được từ 1 row. Trước đây luôn lấy row[0]
    // ⇒ xem tab này nhưng Sửa lại ra dữ liệu của row khác (thiếu nghĩa). Page truyền vào row
    // sở hữu reading đang active; fallback về `vocabulary` khi không có.
    editVocabulary = null,
    canEdit,
    onSave,
    onNextRandom,
    onBack,
    onDelete,
    initialEditing = false,
    addMode = false,
    showLexiconMetaChips = true,
    headerRef,
    footerRef,
    pronunciationBar,
    activePinyinId,
    activeJyutpingId,
    pinyinReadings,
    jyutpingReadings,
    activePinyinKey,
    activeJyutpingKey,
    onSelectPinyin,
    onSelectJyutping,
    loading = false,
}) {
    const { t, locale, fmt } = useLocale();
    const {
        showMeaningEn,
        showMeaningGloss,
        showExampleEn,
        examplesDefaultOpen,
        toggleMeaningEn,
        toggleMeaningGloss,
        toggleExampleEn,
        toggleExamplesDefaultOpen,
        showMandarinCol,
        toggleMandarinCol,
    } = useDisplaySettings();
    const display = vocabularyLookupDisplay(vocabulary);
    // Bản ghi dùng cho EDIT (draft + save). View vẫn dùng `vocabulary` như cũ.
    const editTarget = editVocabulary ?? vocabulary;
    // Hán tự tham chiếu cho link Hanzii/Google — chỉ dùng cặp simp + hk
    const hanRef = (vocabulary.hanSimplified || vocabulary.hanHongKong || vocabulary.hanTraditional || "").trim();

    const [editing, setEditing] = useState(initialEditing);
    const [draft, setDraft] = useState(() => buildVocabularyDraft(vocabulary, { seedEmptyReadings: false }));
    const [validationError, setValidationError] = useState("");
    // Nonce để toast lỗi lặp lại (cùng message) vẫn hiện lại MỖI LẦN bấm Save.
    // (React bỏ qua setState cùng giá trị → effect không chạy lại → lỗi chỉ hiện 1 lần.)
    const [validationNonce, setValidationNonce] = useState(0);
    const showValidationError = (msg) => {
        setValidationError(msg);
        setValidationNonce((n) => n + 1);
    };
    // Gợi ý Mandarin (cột phải hero Cantonese) — target của nút "Full Sync" footer (view mode).
    // ⚠️ 2026-09-02: tra ON-DEMAND qua /api/hanzi/simplified-suggestion (xóa hkSuggestionMap
    // precompute) + bank mandarin để lấy vocab đầy đủ (id, readings).
    const mandarinVocabularies = useMandarinVocabularies();
    const cantoneseModeNow = useAppStore.getState().language === "cantonese";
    const hkFormHere = !editing && cantoneseModeNow ? String(display?.hongKong ?? "").trim() : "";
    const { suggestion: mandarinSuggestion } = useHkSuggestion(hkFormHere);
    const suggestedMandarinVocab = useMemo(() => {
        const simp = (mandarinSuggestion?.simplified ?? "").trim();
        if (!simp) return null;
        return mandarinVocabularies.find((v) => (v.hanSimplified ?? "").trim() === simp) ?? null;
    }, [mandarinSuggestion, mandarinVocabularies]);
    // Check trùng lặp TÁCH RIÊNG theo từng ô hán (Mandarin / Cantonese).
    // null = không scan (edit mode giữ nguyên hán) → không hiện indicator.
    const [dupCheck, setDupCheck] = useState({ mandarin: null, cantonese: null });
    const [dupDetail, setDupDetail] = useState({ open: false, lang: null, matches: null, full: null, loading: false });
    // Quick link: mở thẳng trang chi tiết của từ duplicate — route theo NGÔN NGỮ của bản ghi đó.
    const navigate = useNavigate();
    const openDuplicate = (v, lang) => {
        const han =
            lang === "cantonese"
                ? String(v?.hanziTraditionalHk ?? v?.hanHongKong ?? "").trim()
                : String(v?.hanziSimplified ?? v?.hanziTraditional ?? v?.hanSimplified ?? "").trim();
        if (!han) return;
        setDupDetail((d) => ({ ...d, open: false, matches: null, full: null, loading: false }));
        navigate(`/${languageRoutePrefix(lang)}/vocabulary/${encodeURIComponent(han)}`);
    };
    // Fetch FULL vocab (theo id, đúng ngôn ngữ) để popup trùng hiển thị chi tiết đầy đủ (2026-09-09).
    useEffect(() => {
        const { open: isOpen, matches, lang, full } = dupDetail;
        if (!isOpen || !matches?.length || !lang || full) return;
        const ids = matches.map((m) => m?.id).filter(Boolean);
        if (!ids.length) return;
        let cancelled = false;
        setDupDetail((d) => ({ ...d, loading: true }));
        api.fetchVocabulariesByIdsLang(lang, ids)
            .then((items) => {
                if (cancelled) return;
                setDupDetail((d) => ({ ...d, loading: false, full: Array.isArray(items) ? items : [] }));
            })
            .catch(() => {
                if (!cancelled) setDupDetail((d) => ({ ...d, loading: false }));
            });
        return () => {
            cancelled = true;
        };
    }, [dupDetail.open, dupDetail.matches, dupDetail.lang, dupDetail.full]);
    const [deleteOpen, setDeleteOpen] = useState(false);

    // Reading đang được sửa (local) — chip trong edit mode chọn reading nào để edit meaning.
    const [editPyId, setEditPyId] = useState(activePinyinId);
    const [editJpId, setEditJpId] = useState(activeJyutpingId);
    useEffect(() => {
        if (editing) {
            setEditPyId(activePinyinId);
            setEditJpId(activeJyutpingId);
        }
    }, [editing, activePinyinId, activeJyutpingId]);

    // Hiển thị lỗi validation dạng toast (góc phải), như shadcn toast.
    // Deps gồm validationNonce → bấm Save lặp lại với cùng lỗi vẫn hiện toast mới.
    useEffect(() => {
        if (!validationError) return;
        toast.add({
            type: "error",
            title: t.common?.error ?? "Lỗi",
            description: validationError,
            duration: 4000,
        });
    }, [validationError, validationNonce, t]);

    // ── Reading helpers (pinyin = Mandarin, jyutping = Cantonese) ──
    // Key ổn định cho 1 reading trong edit mode: ưu tiên _tempId (reading mới) → id (DB) → "".
    const readingKeyOf = (r) => (r ? (r._tempId ?? r.id ?? "") : "");
    // Tìm index của entry active cho 1 loại reading trong draft.romanization.
    const findActiveIdx = (roms, type, activeId) => {
        const list = Array.isArray(roms) ? roms : [];
        if (activeId) {
            const i = list.findIndex((r) => r.type === type && (r.id === activeId || r._tempId === activeId));
            if (i >= 0) return i;
        }
        return list.findIndex((r) => r.type === type);
    };
    const readingsOf = (type) => (draft.romanization ?? []).filter((r) => r.type === type);
    // Meanings của reading active để đưa vào MeaningsEditor.
    const activeMeaningsOf = (type, activeId) => {
        const roms = Array.isArray(draft.romanization) ? draft.romanization : [];
        const idx = findActiveIdx(roms, type, activeId);
        return idx >= 0 ? (roms[idx]?.meanings ?? []) : [];
    };
    // Entry active của từng loại reading trong draft (cho ReadingHeader edit mode).
    const activePinyinDraftEntry = (() => {
        const roms = Array.isArray(draft.romanization) ? draft.romanization : [];
        const idx = findActiveIdx(roms, "pinyin", editPyId);
        return idx >= 0 ? roms[idx] : null;
    })();
    const activeJyutpingDraftEntry = (() => {
        const roms = Array.isArray(draft.romanization) ? draft.romanization : [];
        const idx = findActiveIdx(roms, "jyutping", editJpId);
        return idx >= 0 ? roms[idx] : null;
    })();
    // Track the vocab being edited. When switching to a different vocabulary
    // (e.g. pronunciation toggle / next random) while in edit mode, exit edit
    // and reset the draft so the previous vocab's values aren't reused.
    const vocabIdRef = useRef(vocabulary.id);
    useEffect(() => {
        if (vocabIdRef.current !== vocabulary.id) {
            vocabIdRef.current = vocabulary.id;
            // ⚠️ 2026-08-22: Add mode KHÔNG được thoát edit — tránh modal "broken" (view mode 2 cột
            // + "-") sau khi mở do stub bị thay thế → id đổi → trước đây reset editing=false.
            if (!addMode) setEditing(false);
            setValidationError("");
            setDupCheck({ mandarin: null, cantonese: null });
            setDupDetail({ open: false, matches: null });
            setDraft(buildVocabularyDraft(vocabulary, { seedEmptyReadings: false }));
        }
    }, [vocabulary, addMode]);

    // Add mode: LUÔN ở edit mode — đề phòng editing bị reset bởi bất kỳ path nào khác.
    useEffect(() => {
        if (addMode && !editing) setEditing(true);
    }, [addMode, editing]);

    useEffect(() => {
        if (!editing) setDraft(buildVocabularyDraft(vocabulary, { seedEmptyReadings: false }));
    }, [vocabulary, editing]);

    // Duplicate check — hỏi DATABASE sau 0.7s debounce, TÁCH RIÊNG từng ô hán.
    // Add mode: scan khi có hán. Edit mode: CHỈ scan khi user THAY ĐỔI hán so với
    // bản gốc (xóa hán hiện tại + điền mới) — giữ nguyên hán thì không hiện gì.
    // ⚠️ 2026-08-22: dùng prop `addMode` THẬT thay heuristic cũ (!hanTraditional && !hanSimplified)
    // — từ Cantonese chỉ có hanHongKong (không hanTraditional/Simplified) bị heuristic nhầm thành
    // add mode → khi EDIT vẫn chạy scan duplicate → báo "already exists" cho chính từ đang sửa.
    const isAddMode = addMode;
    const normHan = (v) => String(v ?? "").replace(/\s+/g, "");
    // Scan theo TỪNG CỘT: chỉ cột nào có hán KHÁC bản gốc (edit) hoặc có hán (add).
    const origSimpTrad = normHan(vocabulary.hanSimplified) || normHan(vocabulary.hanTraditional);
    const draftSimpTrad = normHan(draft.hanSimplified) || normHan(draft.hanTraditional);
    const origHk = normHan(vocabulary.hanHongKong);
    const draftHk = normHan(draft.hanHongKong);
    const shouldScanM = isAddMode ? Boolean(draftSimpTrad) : Boolean(draftSimpTrad) && draftSimpTrad !== origSimpTrad;
    const shouldScanC = isAddMode ? Boolean(draftHk) : Boolean(draftHk) && draftHk !== origHk;

    useEffect(() => {
        const reset = () => setDupCheck((s) => ({ ...s, mandarin: null }));
        if (!shouldScanM || !editing) {
            reset();
            return;
        }
        const han = (draft.hanSimplified || draft.hanTraditional || "").trim();
        if (!han) {
            reset();
            return;
        }
        let cancelled = false;
        setDupCheck((s) => ({ ...s, mandarin: { checking: true, matches: null } }));
        const timer = setTimeout(async () => {
            try {
                // ⚠️ 2026-08-21: check theo BANK MANDARIN (không phụ thuộc mode hiện tại).
                const res = await api.findVocabularyByHanLang(han, "mandarin");
                const matches = Array.isArray(res?.items) ? res.items : [];
                if (!cancelled)
                    setDupCheck((s) => ({
                        ...s,
                        mandarin: { checking: false, matches: matches.length ? matches : null },
                    }));
            } catch {
                if (!cancelled) reset();
            }
        }, SEARCH_DEBOUNCE_MS); // delay 0.7s
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [draft.hanSimplified, draft.hanTraditional, shouldScanM, editing]);

    useEffect(() => {
        const reset = () => setDupCheck((s) => ({ ...s, cantonese: null }));
        if (!shouldScanC || !editing) {
            reset();
            return;
        }
        const han = (draft.hanHongKong || "").trim();
        if (!han) {
            reset();
            return;
        }
        let cancelled = false;
        setDupCheck((s) => ({ ...s, cantonese: { checking: true, matches: null } }));
        const timer = setTimeout(async () => {
            try {
                // ⚠️ 2026-08-21: check theo BANK CANTONESE (không phụ thuộc mode hiện tại).
                const res = await api.findVocabularyByHanLang(han, "cantonese");
                const matches = Array.isArray(res?.items) ? res.items : [];
                if (!cancelled)
                    setDupCheck((s) => ({
                        ...s,
                        cantonese: { checking: false, matches: matches.length ? matches : null },
                    }));
            } catch {
                if (!cancelled) reset();
            }
        }, SEARCH_DEBOUNCE_MS); // delay 0.7s
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [draft.hanHongKong, shouldScanC, editing]);

    const setDraftField = (field, value) => {
        setDraft((d) => ({ ...d, [field]: value }));
        if (validationError) setValidationError("");
    };

    // Keep meanings edited in MeaningsEditor in sync with the ACTIVE reading
    // entry, so switching reading (toggle) later does not lose the edit.
    const handleRomanizationChange = (roms) => {
        setDraftField("romanization", roms);
    };

    // Thay thế các row của 1 loại reading trong draft.romanization (giữ loại kia).
    const replaceReadingType = (type, nextRows) => {
        const roms = Array.isArray(draft.romanization) ? draft.romanization : [];
        return [...roms.filter((r) => r.type !== type), ...nextRows];
    };

    const handlePinyinMeaningsChange = (newMeanings) => {
        setDraft((d) => {
            const roms = Array.isArray(d.romanization) ? d.romanization : [];
            const idx = findActiveIdx(roms, "pinyin", editPyId);
            if (idx < 0) return d;
            return { ...d, romanization: roms.map((r, i) => (i === idx ? { ...r, meanings: newMeanings } : r)) };
        });
    };

    const handleJyutpingMeaningsChange = (newMeanings) => {
        setDraft((d) => {
            const roms = Array.isArray(d.romanization) ? d.romanization : [];
            const idx = findActiveIdx(roms, "jyutping", editJpId);
            if (idx < 0) return d;
            return { ...d, romanization: roms.map((r, i) => (i === idx ? { ...r, meanings: newMeanings } : r)) };
        });
    };

    const [scrapingHanzii, setScrapingHanzii] = useState(false);
    // Ref tới MeaningsEditor của từng cột (pinyin/jyutping) + editor đang active (focus gần nhất).
    // Footer "Thêm nhóm" gọi addGroup của editor active để thêm nhóm vào đúng reading.
    const pyMeaningsRef = useRef(null);
    const jpMeaningsRef = useRef(null);
    const [activeMeaningsEditor, setActiveMeaningsEditor] = useState(null);
    // Lấy ref MeaningsEditor active (editor đang focus / có card hiển thị).
    const activeMeaningsRef = () => {
        const pyVisible = Boolean(pyMeaningsRef.current);
        const jpVisible = Boolean(jpMeaningsRef.current);
        if (activeMeaningsEditor === "jyutping" && jpVisible) return jpMeaningsRef.current;
        if (activeMeaningsEditor === "pinyin" && pyVisible) return pyMeaningsRef.current;
        if (pyVisible) return pyMeaningsRef.current;
        if (jpVisible) return jpMeaningsRef.current;
        return null;
    };
    const [syncViEnProgress, setSyncViEnProgress] = useState(null); // {done, total}
    const [saving, setSaving] = useState(false); // chống double-submit khi lưu
    // Đánh dấu nút GỘP (Hanzii + Đồng bộ) đang chạy → nút "Đồng bộ nghĩa" riêng KHÔNG hiện cùng step.
    const [combinedOp, setCombinedOp] = useState(false);
    // Nút footer nào đang chạy — CHỈ nút đó spin/hiện tiến trình (trước đây mọi nút dùng chung
    // combinedOp → Fill Missing Data cũng spin theo Full Sync). (2026-08-22)
    // Giá trị: "fullSyncMandarin" | "fullSync" | "fullSyncCantonese" | "fillMissing"
    const [activeOp, setActiveOp] = useState(null);
    // Step hiện tại của nút Full Sync (mandarin): null | "hanzii" | "examples" | "missing"
    // — hiển thị đúng bước khi button đang spinning (1. Getting data from Hanzii →
    //   2. Fill examples pinyin → 3. Fill missing data).
    const [fullSyncStep, setFullSyncStep] = useState(null);
    // Có async đang chạy → disable mọi nút footer (tránh thao tác đè lên nhau).
    // Gồm cả `combinedOp` (quy trình gộp Hanzii+Đồng bộ) — trong khoảng chờ giữa 2 step
    // (waitEditorHasJobs) scrapingHanzii/syncingViEn đều false → nếu không có combinedOp,
    // button sẽ sáng lên (enabled) giữa chừng rồi mới disabled lại.
    const busy = scrapingHanzii || saving || combinedOp;
    // Chống chạy song song: `busy` đọc từ state (setState bất đồng bộ) → click nhanh 2 lần
    // (trước khi re-render) có thể chạy 2 luồng cùng ghi syncViEnProgress → tiến độ tụt lùi
    // (vd 10/12 → 8/12). Ref này set ĐỒNG BỘ trước await đầu tiên → chặn ngay lập tức. (2026-08-24)
    const syncBusyRef = useRef(false);
    // Footer "Đồng bộ nghĩa Việt - Anh": 1 click sync TẤT CẢ meaning + ví dụ của editor active.
    // Footer "Fill Missing Data" = STEP 2 + 3 của nút Full Sync (KHÔNG scrap Hanzii):
    //   Step 2 — fill pinyin (Mandarin) / jyutping (Cantonese) cho ví dụ thiếu.
    //   Step 3 — fill missing meanings (Eng→Việt→Zh) cho mọi reading. ⚠️ 2026-08-22: cantonese bỏ gloss yue.
    // Chạy TRỰC TIẾP trên draft (không qua editor state — tránh race, giống full sync). (2026-08-21)
    const handleSyncAllViEnFromFooter = async ({ silent } = {}) => {
        if (syncBusyRef.current || busy) return 0;
        const isCantonese = useAppStore.getState().language === "cantonese";
        syncBusyRef.current = true;
        setCombinedOp(true);
        setActiveOp("fillMissing");
        setFullSyncStep("examples");
        setSyncViEnProgress(null);
        try {
            const srcRoms = Array.isArray(draft.romanization) ? draft.romanization : [];
            // Deep copy để patch rồi setDraft 1 lần (không mutate draft hiện tại).
            const base = srcRoms.map((r) => ({
                ...r,
                meanings: (r.meanings ?? []).map((m) => ({
                    ...m,
                    examples: (m.examples ?? []).map((e) => ({ ...e })),
                })),
            }));
            // ═══ STEP 2: fill pinyin/jyutping cho ví dụ thiếu ═══
            for (const rom of base) {
                for (const m of rom.meanings ?? []) {
                    for (const ex of m.examples ?? []) {
                        if (isCantonese) {
                            const exHan = stripCjkPunct(
                                (ex.hanTraditional ?? "").trim() || (ex.hanSimplified ?? "").trim(),
                            );
                            if (exHan && !(ex.jyutpingExample ?? "").trim()) {
                                try {
                                    const jp = await api.toJyutping(exHan);
                                    ex.jyutpingExample = cleanRomanization(jp?.jyutping ?? "");
                                } catch {
                                    ex.jyutpingExample = "";
                                }
                            }
                        } else {
                            const exHan = stripCjkPunct(
                                (ex.hanSimplified ?? "").trim() || (ex.hanTraditional ?? "").trim(),
                            );
                            if (exHan && !(ex.pinyinExample ?? "").trim()) {
                                try {
                                    const py = await api.toPinyin(exHan);
                                    ex.pinyinExample = cleanRomanization(String(py?.pinyin ?? ""));
                                } catch {
                                    ex.pinyinExample = "";
                                }
                            }
                        }
                    }
                }
            }
            // ═══ STEP 3: fill missing meanings (Eng→Việt→Zh) cho mọi reading ═══
            // ⚠️ 2026-08-22: cantonese KHÔNG còn gloss (bỏ yue) — chỉ sync vi↔en + jyutping ví dụ.
            setFullSyncStep("missing");
            const allRoms = base.filter((r) => (isCantonese ? r.type === "jyutping" : r.type === "pinyin"));
            const totalJobs = allRoms.reduce(
                (acc, r) =>
                    acc + (isCantonese ? countCantoneseSyncJobs(r.meanings) : countViEnSyncJobs(r.meanings, "pinyin")),
                0,
            );
            setSyncViEnProgress(totalJobs ? { done: 0, total: totalJobs } : null);
            let done = 0;
            let synced = 0;
            for (const rom of allRoms) {
                const jobsInReading = isCantonese
                    ? countCantoneseSyncJobs(rom.meanings)
                    : countViEnSyncJobs(rom.meanings, "pinyin");
                const { meanings, synced: syncedThis } = isCantonese
                    ? await syncMeaningsCantonese(rom.meanings, (d) =>
                          setSyncViEnProgress({ done: done + d, total: totalJobs }),
                      )
                    : await syncMeaningsViEn(rom.meanings, "pinyin", (d) =>
                          setSyncViEnProgress({ done: done + d, total: totalJobs }),
                      );
                rom.meanings = meanings;
                synced += syncedThis;
                done += jobsInReading;
            }
            setDraft((d) => ({ ...d, romanization: base }));
            if (!silent) {
                toast.add({
                    type: synced > 0 ? "success" : "info",
                    title: synced > 0 ? (t.common?.done ?? "Xong") : "Thông báo",
                    description: synced > 0 ? `Đã đồng bộ ${synced} mục` : "Không có mục nào cần đồng bộ",
                    duration: 3000,
                });
            }
            return synced;
        } finally {
            syncBusyRef.current = false;
            setFullSyncStep(null);
            setCombinedOp(false);
            setActiveOp(null);
            setSyncViEnProgress(null);
        }
    };
    // Footer "Đồng bộ nghĩa + Jyutping" (chỉ cantonese) — ĐÃ XÓA (2026-08-21): thừa vì nút
    // "Fill Missing Data" giờ là step 2+3 của full sync (đã bao gồm fill jyutping + nghĩa).
    // Button gộp 3 bước (MANDARIN "fill data from hanzii - fill meanings"):
    //   1) Scrap Hanzii → nếu KHÔNG có data → báo lỗi "không có data" và DỪNG (không sync).
    //      Nếu có → clear toàn bộ cặp phiên âm pinyin + meanings + ví dụ, fill từ Hanzii.
    //      Chỉ lấy hán-simplified (KHÔNG lấy traditional trong []). Pinyin từ chính lấy từ
    //      Hanzii làm gốc (KHÔNG thay bằng pinyin-pro).
    //   2) Sau khi step 1 xong HOÀN TOÀN → fill pinyin bằng pinyin-pro cho các VÍ DỤ (nếu có).
    //      (Backend hanToPinyin đã fill lúc scrap; chỉ bổ sung nếu ví dụ còn thiếu pinyin.)
    //   3) Sau khi step 2 xong → fill meanings còn thiếu (ưu tiên Eng > Việt > Zh).
    const handleScrapThenSync = async () => {
        if (syncBusyRef.current || busy) return;
        syncBusyRef.current = true;
        setCombinedOp(true);
        setActiveOp("fullSync");
        setFullSyncStep("hanzii");
        setSyncViEnProgress(null);
        try {
            // ═══ BƯỚC 0: Fill hanzi_traditional nếu trống (OpenCC s2t) ═══ (2026-08-22)
            const simpHan = (draft.hanSimplified ?? "").trim();
            const tradHan = (draft.hanTraditional ?? "").trim();
            if (simpHan && !tradHan) {
                try {
                    const conv = await api.toTraditional(simpHan);
                    const converted = String(conv?.traditional ?? "").trim();
                    if (converted && converted !== simpHan) setDraftField("hanTraditional", converted);
                } catch {
                    /* bỏ qua — không chặn các bước sau */
                }
            }
            // ═══ BƯỚC 1: Scrap Hanzii ═══
            const nextRoms = await handleScrapAllPinyin({ silent: true });
            // Không có data (chữ Hán / Hanzii không có từ / HTTP lỗi) → báo lỗi và DỪNG.
            if (!Array.isArray(nextRoms)) {
                toast.add({
                    type: "error",
                    title: t.common?.error ?? "Lỗi",
                    description: "Không có dữ liệu từ Hanzii cho từ này",
                    duration: 3000,
                });
                return;
            }
            const base = nextRoms;
            // ═══ BƯỚC 2: Fill pinyin-pro cho các VÍ DỤ (nếu ví dụ còn thiếu pinyin) ═══
            setFullSyncStep("examples");
            for (const rom of base) {
                for (const m of rom.meanings ?? []) {
                    for (const ex of m.examples ?? []) {
                        const exHan = stripCjkPunct(
                            (ex.hanSimplified ?? "").trim() || (ex.hanTraditional ?? "").trim(),
                        );
                        if (exHan && !(ex.pinyinExample ?? "").trim()) {
                            try {
                                const pyRes = await api.toPinyin(exHan);
                                ex.pinyinExample = cleanRomanization(String(pyRes?.pinyin ?? ""));
                            } catch {
                                ex.pinyinExample = "";
                            }
                        }
                    }
                }
            }
            // ═══ BƯỚC 3: Fill meanings còn thiếu (Eng → Việt → Zh) cho TẤT CẢ readings ═══
            setFullSyncStep("missing");
            const allRoms = base.filter((r) => r.type === "pinyin" || r.type === "jyutping");
            const totalJobs = allRoms.reduce((acc, r) => acc + countViEnSyncJobs(r.meanings, r.type), 0);
            setSyncViEnProgress(totalJobs ? { done: 0, total: totalJobs } : null);
            let done = 0;
            let synced = 0;
            for (const rom of allRoms) {
                const jobsInReading = countViEnSyncJobs(rom.meanings, rom.type);
                const { meanings, synced: syncedThis } = await syncMeaningsViEn(rom.meanings, rom.type, (d) =>
                    setSyncViEnProgress({ done: done + d, total: totalJobs }),
                );
                rom.meanings = meanings;
                synced += syncedThis;
                done += jobsInReading;
            }
            // ⚠️ 2026-08-22: xóa meaning trùng 100% (vi + en giống nhau) — không lưu duplicate.
            for (const rom of allRoms) rom.meanings = dedupeMeanings(rom.meanings);
            setDraft((d) => ({ ...d, romanization: base }));
            toast.add({
                type: "success",
                title: t.common?.done ?? "Xong",
                description: synced > 0 ? `Đã đồng bộ ${synced} nghĩa/ví dụ` : "Không có mục nào cần đồng bộ",
                duration: 3000,
            });
        } finally {
            syncBusyRef.current = false;
            setFullSyncStep(null);
            setCombinedOp(false);
            setActiveOp(null);
            setSyncViEnProgress(null);
        }
    };
    // Button gộp cho CANTONESE: 1) Lấy từ Hanzii (scrap nghĩa/ví dụ — KHÔNG tạo pinyin),
    // 2) Đồng bộ nghĩa (vi↔en) + điền Jyutping còn thiếu. ⚠️ 2026-08-22: bỏ gloss yue.
    // ⚠️ 2026-08-21: sync TRỰC TIẾP trên base (giống Mandarin handleScrapThenSync) — KHÔNG
    // qua editor.syncAllCantonese (phụ thuộc localCategories propagate từ setDraft → race:
    // sync chạy trên state cũ, meaning scrap có en/gloss không được sync).
    const handleScrapThenSyncCantonese = async () => {
        if (syncBusyRef.current || busy) return;
        syncBusyRef.current = true;
        setCombinedOp(true);
        setActiveOp("fullSyncCantonese");
        setFullSyncStep("hanzii");
        setSyncViEnProgress(null);
        try {
            // ═══ BƯỚC 0: Fill hán tự HK (hanHongKong) nếu trống — OpenCC s2t (giống Mandarin) ═══ (2026-08-22)
            const hkHan0 = (draft.hanHongKong ?? "").trim();
            const simpC0 = (draft.hanSimplified ?? "").trim();
            if (!hkHan0 && simpC0) {
                try {
                    const conv = await api.toTraditional(simpC0);
                    const converted = String(conv?.traditional ?? "").trim();
                    if (converted && converted !== simpC0) setDraftField("hanHongKong", converted);
                } catch {
                    /* bỏ qua — không chặn các bước sau */
                }
            }
            // Bước 1: scrap Hanzii (best-effort). Fail → vẫn sync nghĩa/jyutping cho readings hiện có.
            const nextRoms = await handleScrapAllPinyin({ silent: true });
            const base = Array.isArray(nextRoms)
                ? nextRoms
                : Array.isArray(draft.romanization)
                  ? draft.romanization
                  : [];
            // Bước 2: đồng bộ nghĩa (vi↔en) + điền Jyutping còn thiếu — chạy trên base.
            // ⚠️ 2026-08-22: cantonese bỏ gloss yue — chỉ sync vi↔en + jyutping ví dụ.
            setFullSyncStep("missing");
            const allRoms = base.filter((r) => r.type === "jyutping");
            const totalJobs = allRoms.reduce((acc, r) => acc + countCantoneseSyncJobs(r.meanings), 0);
            setSyncViEnProgress(totalJobs ? { done: 0, total: totalJobs } : null);
            let done = 0;
            let synced = 0;
            for (const rom of allRoms) {
                const jobsInReading = countCantoneseSyncJobs(rom.meanings);
                const { meanings, synced: syncedThis } = await syncMeaningsCantonese(rom.meanings, (d) =>
                    setSyncViEnProgress({ done: done + d, total: totalJobs }),
                );
                rom.meanings = meanings;
                synced += syncedThis;
                done += jobsInReading;
            }
            // ⚠️ 2026-08-22: xóa meaning trùng 100% (vi + en giống nhau) — không lưu duplicate.
            for (const rom of allRoms) rom.meanings = dedupeMeanings(rom.meanings);
            setDraft((d) => ({ ...d, romanization: base }));
            toast.add({
                type: "success",
                title: t.common?.done ?? "Xong",
                description:
                    synced > 0 ? `Đã đồng bộ ${synced} mục (nghĩa/ví dụ/jyutping)` : "Không có mục nào cần đồng bộ",
                duration: 3000,
            });
        } finally {
            syncBusyRef.current = false;
            setFullSyncStep(null);
            setCombinedOp(false);
            setActiveOp(null);
            setSyncViEnProgress(null);
        }
    };
    // ═══ FULL SYNC cho từ MANDARIN (cột gợi ý) — chạy ngay từ detail Cantonese, view mode ═══
    // Scrap Hanzii → fill pinyin examples → fill missing meanings → LƯU thẳng DB qua
    // editVocabularyLang (language-explicit, không đổi mode). (2026-08-21)
    const handleFullSyncMandarinSuggestion = async () => {
        if (syncBusyRef.current || busy) return;
        const target = suggestedMandarinVocab;
        if (!target) {
            toast.add({
                type: "info",
                title: "Thông báo",
                description: "Không tìm thấy từ Mandarin gợi ý để đồng bộ",
                duration: 2500,
            });
            return;
        }
        const han = (target.hanSimplified || target.hanTraditional || "").trim();
        if (!han) {
            toast.add({
                type: "error",
                title: t.common?.error ?? "Lỗi",
                description: "Từ Mandarin không có chữ Hán",
                duration: 3000,
            });
            return;
        }
        syncBusyRef.current = true;
        setCombinedOp(true);
        setActiveOp("fullSyncMandarin");
        setFullSyncStep("hanzii");
        setSyncViEnProgress(null);
        try {
            // 1) Scrap Hanzii (all tones) → build pinyin readings + meanings.
            const res = await api.hanziiMeanings(han);
            const tones = (res?.tones ?? [])
                .map((tm) => ({
                    pinyin: String(tm.pinyin ?? "").trim(),
                    // Hán-Việt + HSK riêng theo từng tone từ Hanzii (VD 長: zhǎng→TRƯỞNG/HSK 6,
                    // cháng→TRƯỜNG/HSK 2). (2026-08-22)
                    sinoVietnamese: String(tm.sinoVietnamese ?? "").trim(),
                    hskLevel: String(tm.hskLevel ?? "").trim(),
                    meanings: buildScrapMeanings(tm.groups ?? [], true),
                }))
                .filter((tm) => tm.pinyin && tm.meanings.length);
            if (!tones.length) {
                toast.add({
                    type: "error",
                    title: t.common?.error ?? "Lỗi",
                    description: "Không có dữ liệu từ Hanzii cho từ này",
                    duration: 3000,
                });
                return;
            }
            const existingRoms = Array.isArray(target.romanization) ? target.romanization : [];
            const fallbackSino =
                String(res?.sinoVietnamese ?? "").trim() ||
                existingRoms.find((rd) => rd.type === "pinyin" && (rd.sinoVietnamese ?? "").trim())?.sinoVietnamese ||
                "";
            const nonPinyinRoms = existingRoms.filter((rd) => rd.type !== "pinyin");
            const base = [
                ...nonPinyinRoms,
                ...tones.map((tm) => {
                    const existing = existingRoms.find(
                        (rd) => rd.type === "pinyin" && normScrapPinyin(rd.pinyin) === normScrapPinyin(tm.pinyin),
                    );
                    return {
                        id: existing?.id,
                        _tempId: existing?._tempId ?? crypto.randomUUID(),
                        type: "pinyin",
                        sinoVietnamese: (tm.sinoVietnamese ?? "").trim() || existing?.sinoVietnamese || fallbackSino,
                        pinyin: tm.pinyin,
                        jyutping: "",
                        meanings: tm.meanings,
                    };
                }),
            ];
            // 2) Fill pinyin-pro cho ví dụ thiếu pinyin.
            setFullSyncStep("examples");
            for (const rom of base) {
                for (const m of rom.meanings ?? []) {
                    for (const ex of m.examples ?? []) {
                        const exHan = stripCjkPunct(
                            (ex.hanSimplified ?? "").trim() || (ex.hanTraditional ?? "").trim(),
                        );
                        if (exHan && !(ex.pinyinExample ?? "").trim()) {
                            try {
                                const pyRes = await api.toPinyin(exHan);
                                ex.pinyinExample = cleanRomanization(String(pyRes?.pinyin ?? ""));
                            } catch {
                                ex.pinyinExample = "";
                            }
                        }
                    }
                }
            }
            // 3) Fill missing meanings (Eng→Việt→Zh) cho tất cả reading pinyin.
            setFullSyncStep("missing");
            const allRoms = base.filter((r) => r.type === "pinyin");
            const totalJobs = allRoms.reduce((acc, r) => acc + countViEnSyncJobs(r.meanings, "pinyin"), 0);
            setSyncViEnProgress(totalJobs ? { done: 0, total: totalJobs } : null);
            let done = 0;
            let synced = 0;
            for (const rom of allRoms) {
                const jobsInReading = countViEnSyncJobs(rom.meanings, "pinyin");
                const { meanings, synced: syncedThis } = await syncMeaningsViEn(rom.meanings, "pinyin", (d) =>
                    setSyncViEnProgress({ done: done + d, total: totalJobs }),
                );
                rom.meanings = meanings;
                synced += syncedThis;
                done += jobsInReading;
            }
            // ⚠️ 2026-08-22: xóa meaning trùng 100% (vi + en giống nhau) — không lưu duplicate.
            for (const rom of allRoms) rom.meanings = dedupeMeanings(rom.meanings);
            // 4) Build payload per-language + lưu thẳng DB (store action language-explicit).
            // Fill cấp độ HSK từ Hanzii (tone đầu tiên có HSK) — vd 長 → "HSK 6". (2026-08-22)
            const scrapHsk = (tones.find((tm) => tm.hskLevel) ?? {}).hskLevel ?? "";
            // 4b) Fill hanzi_traditional nếu trống (OpenCC s2t). (2026-08-22)
            let filledTrad = target.hanTraditional;
            const simpTrad = (target.hanSimplified ?? "").trim();
            if (!(filledTrad ?? "").trim() && simpTrad) {
                try {
                    const conv = await api.toTraditional(simpTrad);
                    const converted = String(conv?.traditional ?? "").trim();
                    if (converted && converted !== simpTrad) filledTrad = converted;
                } catch {
                    /* bỏ qua — không chặn lưu */
                }
            }
            const payload = vocabularyLangPayload(
                {
                    ...target,
                    hanTraditional: filledTrad,
                    hskLevel: scrapHsk || target.hskLevel,
                    romanization: base,
                },
                "mandarin",
            );
            await useAppStore.getState().editVocabularyLang(target.id, "mandarin", payload);
            toast.add({
                type: "success",
                title: t.common?.done ?? "Xong",
                description: `Đã full sync từ Mandarin: ${synced} mục`,
                duration: 3000,
            });
        } catch (err) {
            toast.add({
                type: "error",
                title: t.common?.error ?? "Lỗi",
                description: String(err instanceof Error ? err.message : err),
                duration: 4000,
            });
        } finally {
            syncBusyRef.current = false;
            setFullSyncStep(null);
            setCombinedOp(false);
            setActiveOp(null);
            setSyncViEnProgress(null);
        }
    };
    // ═══ FULL SYNC CANTONESE (view mode) — chạy ngay từ detail, LƯU thẳng DB ═══ (2026-08-22)
    // Scrap Hanzii → sync vi↔en + fill jyutping → payload cantonese → editVocabularyLang.
    // (Nút edit-mode cũ chỉ cập nhật draft — view mode này save luôn để fast sync.)
    const handleFullSyncCantonese = async () => {
        if (syncBusyRef.current || busy) return;
        syncBusyRef.current = true;
        setCombinedOp(true);
        setActiveOp("fullSyncCantonese");
        setFullSyncStep("hanzii");
        setSyncViEnProgress(null);
        try {
            // Bước 0: fill hán tự HK nếu trống (OpenCC s2t — giống edit mode).
            const hkHan0 = (draft.hanHongKong ?? "").trim();
            const simpC0 = (draft.hanSimplified ?? "").trim();
            if (!hkHan0 && simpC0) {
                try {
                    const conv = await api.toTraditional(simpC0);
                    const converted = String(conv?.traditional ?? "").trim();
                    if (converted && converted !== simpC0) setDraftField("hanHongKong", converted);
                } catch {
                    /* bỏ qua — không chặn các bước sau */
                }
            }
            // Bước 1: scrap Hanzii (best-effort) — KHÔNG abort nếu Hanzii không có dữ liệu;
            // fallback sang readings hiện có và VẪN fill missing data (vi↔en + jyutping).
            const nextRoms = await handleScrapAllPinyin({ silent: true });
            const base = Array.isArray(nextRoms)
                ? nextRoms
                : Array.isArray(draft.romanization)
                  ? draft.romanization
                  : [];
            // Bước 2: đồng bộ nghĩa (vi↔en) + điền Jyutping còn thiếu.
            setFullSyncStep("missing");
            const allRoms = base.filter((r) => r.type === "jyutping");
            const totalJobs = allRoms.reduce((acc, r) => acc + countCantoneseSyncJobs(r.meanings), 0);
            setSyncViEnProgress(totalJobs ? { done: 0, total: totalJobs } : null);
            let done = 0;
            let synced = 0;
            for (const rom of allRoms) {
                const jobsInReading = countCantoneseSyncJobs(rom.meanings);
                const { meanings, synced: syncedThis } = await syncMeaningsCantonese(rom.meanings, (d) =>
                    setSyncViEnProgress({ done: done + d, total: totalJobs }),
                );
                rom.meanings = meanings;
                synced += syncedThis;
                done += jobsInReading;
            }
            // ⚠️ 2026-08-22: xóa meaning trùng 100% (vi + en giống nhau) — không lưu duplicate.
            for (const rom of allRoms) rom.meanings = dedupeMeanings(rom.meanings);
            // Bước 3: build payload cantonese (giữ audio/yue) + LƯU thẳng DB.
            const payload = vocabularyLangPayload({ ...draft, romanization: base }, "cantonese");
            await useAppStore.getState().editVocabularyLang(vocabulary.id, "cantonese", payload);
            // ⚠️ 2026-08-29: từ trống (no readings) + Hanzii có Hán-Việt → scrap đã TẠO reading
            // jyutping mới (to-jyutping + sino). synced=0 nhưng vẫn có giá trị → đừng báo
            // "không có mục" gây hiểu nhầm.
            const hasJyutping = allRoms.some((r) => (r.jyutping ?? "").trim() && (r.sinoVietnamese ?? "").trim());
            toast.add({
                type: "success",
                title: t.common?.done ?? "Xong",
                description:
                    synced > 0
                        ? `Đã full sync từ Cantonese: ${synced} mục`
                        : hasJyutping
                          ? "Đã cập nhật phiên âm Jyutping + Hán-Việt (không có nghĩa để đồng bộ)"
                          : "Không có mục nào cần đồng bộ",
                duration: 3000,
            });
        } catch (err) {
            toast.add({
                type: "error",
                title: t.common?.error ?? "Lỗi",
                description: String(err instanceof Error ? err.message : err),
                duration: 4000,
            });
        } finally {
            syncBusyRef.current = false;
            setFullSyncStep(null);
            setCombinedOp(false);
            setActiveOp(null);
            setSyncViEnProgress(null);
        }
    };
    // ═══ FULL SYNC MANDARIN (view mode) — chạy ngay từ detail, LƯU thẳng DB ═══ (2026-08-26)
    // Giống handleFullSyncCantonese nhưng cho từ Mandarin: scrap Hanzii → fill pinyin ví dụ
    // → sync vi↔en + gloss → payload mandarin → editVocabularyLang. (Nút footer view mode —
    // trước đây chỉ có bên Cantonese, giờ bổ sung bên Mandarin theo yêu cầu user.)
    const handleFullSyncMandarin = async () => {
        if (syncBusyRef.current || busy) return;
        syncBusyRef.current = true;
        setCombinedOp(true);
        setActiveOp("fullSyncMandarin");
        setFullSyncStep("hanzii");
        setSyncViEnProgress(null);
        try {
            // Bước 0: fill hanzi_traditional nếu trống (OpenCC s2t — giống edit mode).
            const simpHan0 = (draft.hanSimplified ?? "").trim();
            const tradHan0 = (draft.hanTraditional ?? "").trim();
            if (simpHan0 && !tradHan0) {
                try {
                    const conv = await api.toTraditional(simpHan0);
                    const converted = String(conv?.traditional ?? "").trim();
                    if (converted && converted !== simpHan0) setDraftField("hanTraditional", converted);
                } catch {
                    /* bỏ qua — không chặn các bước sau */
                }
            }
            // Bước 1: scrap Hanzii (best-effort) — KHÔNG abort nếu Hanzii không có dữ liệu;
            // fallback sang readings hiện có và VẪN fill missing data (vi↔en + gloss).
            const nextRoms = await handleScrapAllPinyin({ silent: true });
            const base = Array.isArray(nextRoms)
                ? nextRoms
                : Array.isArray(draft.romanization)
                  ? draft.romanization
                  : [];
            // Bước 2: fill pinyin (pinyin-pro) cho các VÍ DỤ còn thiếu.
            setFullSyncStep("examples");
            for (const rom of base) {
                for (const m of rom.meanings ?? []) {
                    for (const ex of m.examples ?? []) {
                        const exHan = stripCjkPunct(
                            (ex.hanSimplified ?? "").trim() || (ex.hanTraditional ?? "").trim(),
                        );
                        if (exHan && !(ex.pinyinExample ?? "").trim()) {
                            try {
                                const pyRes = await api.toPinyin(exHan);
                                ex.pinyinExample = cleanRomanization(String(pyRes?.pinyin ?? ""));
                            } catch {
                                ex.pinyinExample = "";
                            }
                        }
                    }
                }
            }
            // Bước 3: đồng bộ nghĩa (vi↔en + gloss zh) cho pinyin readings.
            setFullSyncStep("missing");
            const allRoms = base.filter((r) => r.type === "pinyin");
            const totalJobs = allRoms.reduce((acc, r) => acc + countViEnSyncJobs(r.meanings, "pinyin"), 0);
            setSyncViEnProgress(totalJobs ? { done: 0, total: totalJobs } : null);
            let done = 0;
            let synced = 0;
            for (const rom of allRoms) {
                const jobsInReading = countViEnSyncJobs(rom.meanings, "pinyin");
                const { meanings, synced: syncedThis } = await syncMeaningsViEn(rom.meanings, "pinyin", (d) =>
                    setSyncViEnProgress({ done: done + d, total: totalJobs }),
                );
                rom.meanings = meanings;
                synced += syncedThis;
                done += jobsInReading;
            }
            // ⚠️ 2026-08-22: xóa meaning trùng 100% (vi + en giống nhau) — không lưu duplicate.
            for (const rom of allRoms) rom.meanings = dedupeMeanings(rom.meanings);
            // Bước 4: build payload mandarin + LƯU thẳng DB.
            const payload = vocabularyLangPayload({ ...draft, romanization: base }, "mandarin");
            await useAppStore.getState().editVocabularyLang(vocabulary.id, "mandarin", payload);
            toast.add({
                type: "success",
                title: t.common?.done ?? "Xong",
                description: synced > 0 ? `Đã full sync từ Mandarin: ${synced} mục` : "Không có mục nào cần đồng bộ",
                duration: 3000,
            });
        } catch (err) {
            toast.add({
                type: "error",
                title: t.common?.error ?? "Lỗi",
                description: String(err instanceof Error ? err.message : err),
                duration: 4000,
            });
        } finally {
            syncBusyRef.current = false;
            setFullSyncStep(null);
            setCombinedOp(false);
            setActiveOp(null);
            setSyncViEnProgress(null);
        }
    };
    // Chuẩn hóa pinyin để so khớp thanh điệu (bỏ khoảng trắng, lowercase, giữ thanh điệu).
    const normScrapPinyin = (s) =>
        String(s ?? "")
            .replace(/\s+/g, "")
            .toLowerCase();
    // Chọn Hán-Việt tốt hơn khi sync — ưu tiên:
    //   1) Giá trị KHÔNG chứa placeholder (thiếu Hán-Việt: "-" / "•" / "·" / "_") — VD cũ
    //      "HẢO -" + Hanzii "HẢO HUỀ" → lấy "HẢO HUỀ" (trước đây đếm "-" thành 1 âm tiết → 2==2
    //      → giữ "HẢO -" SAI). (2026-08-23)
    //   2) Nhiều âm tiết thật hơn — VD 用嚟: cũ "DỤNG" (thiếu 嚟) + Hanzii "DỤNG LAI" → "DỤNG LAI".
    // Rỗng → fill.
    const pickBetterSino = (existing, fallback) => {
        const cur = String(existing ?? "").trim();
        const fb = String(fallback ?? "").trim();
        if (!fb) return cur;
        if (!cur) return fb;
        const isPh = (t) => t === "-" || t === "•" || t === "·" || /^_+$/.test(t);
        const hasPh = (s) => s.split(/\s+/).some(isPh);
        const real = (s) => s.split(/\s+/).filter((t) => !isPh(t)).length;
        if (hasPh(cur) && !hasPh(fb)) return fb;
        if (!hasPh(cur) && hasPh(fb)) return cur;
        return real(fb) > real(cur) ? fb : cur;
    };
    // Xóa meaning trùng 100% (vi VÀ en giống nhau) VÀ gộp meaning có viet OVERLAP
    // (giữ meaning đầu, nối en + gộp examples qua mergeMeaningInto) — VD 2 meaning
    // "Sổ mũi" en khác nhau → gộp thành 1. (2026-08-23)
    const dedupeMeanings = (meanings) => {
        const out = [];
        for (const m of meanings ?? []) {
            // Meaning trống (chưa có vi/en) → giữ riêng, không merge.
            if (!String(m.vietMeanings ?? "").trim() && !String(m.engMeanings ?? "").trim()) {
                out.push(m);
                continue;
            }
            const mSenses = splitSenseParts(m.vietMeanings);
            const target = out.find((o) => sensesOverlap(splitSenseParts(o.vietMeanings), mSenses));
            if (target) {
                out[out.indexOf(target)] = mergeMeaningInto(target, m);
            } else {
                out.push(m);
            }
        }
        return out;
    };
    // Chuyển groups [{title, meanings:[{vi,zh,examples}]}] từ Hanzii → meanings array của draft.
    const buildScrapMeanings = (groups, onlySimplified = false) => {
        const meanings = [];
        let pos = 0;
        for (const grp of groups) {
            for (const m of grp.meanings ?? []) {
                meanings.push({
                    _tempId: crypto.randomUUID(),
                    vietMeanings: String(m.vi ?? "")
                        .replace(/^\s*\d+\.\s*/, "")
                        .trim(),
                    engMeanings: "",
                    gloss: (m.zh ?? "").trim(),
                    position: pos++,
                    examples: (m.examples ?? [])
                        .map((ex) => {
                            const parts = splitHanBracketed(ex.zh);
                            return {
                                _tempId: crypto.randomUUID(),
                                hanSimplified: parts.hanSimplified,
                                // onlySimplified=true (mandarin): KHÔNG lấy traditional trong []
                                hanTraditional: onlySimplified ? "" : parts.hanTraditional,
                                jyutpingExample: "",
                                pinyinExample: (ex.pinyin ?? "").trim(),
                                vietExamples: (ex.vi ?? "").trim(),
                                engExamples: "",
                            };
                        })
                        .filter((ex) => ex.hanSimplified || ex.hanTraditional || ex.pinyinExample || ex.vietExamples),
                });
            }
        }
        return meanings;
    };
    // ═══ MERGE meaning khi scrap Hanzii (2026-08-22) ═══
    // Nếu meaning scrap có viet "overlap" với meaning cũ (1 list sense nằm trong list kia —
    // vd cũ "trái cam, trái cây, hoa quả" + scrap "trái cây, hoa quả") → GỘP VÀO meaning cũ:
    // nối viet (không trùng), nối en, gộp examples (không trùng han), giữ id/_tempId/category cũ.
    // Meaning scrap không overlap → thêm mới.
    const splitSenseParts = (v) =>
        String(v ?? "")
            .split(/[,;，；/]+/)
            .map((s) => s.trim())
            .filter(Boolean);
    const joinSenses = (partsA, partsB) => {
        const out = [...partsA];
        const seen = new Set(partsA.map((p) => p.toLowerCase()));
        for (const p of partsB) {
            const k = p.toLowerCase();
            if (!seen.has(k)) {
                out.push(p);
                seen.add(k);
            }
        }
        return out.join(", ");
    };
    const exHanParts = (ex) => {
        const simp = String(ex?.hanSimplified ?? "").trim();
        const trad = String(ex?.hanTraditional ?? "").trim();
        if (simp || trad) return { hanSimplified: simp, hanTraditional: trad };
        const lines = String(ex?.hanExample ?? "")
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean);
        return { hanSimplified: lines[0] ?? "", hanTraditional: lines[1] ?? "" };
    };
    // ⚠️ 2026-08-30: bỏ group/category — merge giữ gloss, không còn category.
    const mergeMeaningInto = (target, sc) => {
        const next = {
            ...target,
            vietMeanings: joinSenses(splitSenseParts(target.vietMeanings), splitSenseParts(sc.vietMeanings)),
            engMeanings: joinSenses(splitSenseParts(target.engMeanings), splitSenseParts(sc.engMeanings)),
            gloss: (target.gloss ?? "").trim() || sc.gloss?.trim() || "",
        };
        // ⚠️ Dedup ví dụ: ưu tiên theo ROMANIZATION (jyutping/pinyin — không bị lệch giản/phồn),
        // fallback theo chữ Hán (không phân biệt cột simp/trad — example cũ lưu han ở hanTraditional,
        // scrap lưu ở hanSimplified). Chỉ dedup theo han KHÔNG đủ: scrap là giản thể "我们种了小麦"
        // còn DB lưu phồn "我們種了小麥" → key han khác nhau dù CÙNG ví dụ. (2026-08-25)
        const normHanKey = (s) =>
            String(s ?? "")
                .replace(/[\u3000-\u303F\uFF00-\uFFEF，。！？、；：（）《》「」『』【】—…,.;:!?()"'“”]+/g, "")
                .trim();
        const normRom = (s) =>
            String(s ?? "")
                .toLowerCase()
                .replace(/\s+/g, "")
                .trim();
        const exDedupKey = (ex) => {
            const rom = normRom(ex?.jyutpingExample) || normRom(ex?.pinyinExample);
            if (rom) return `rom:${rom}`;
            const p = exHanParts(ex);
            const han = normHanKey(p.hanSimplified) || normHanKey(p.hanTraditional);
            return han ? `han:${han}` : "";
        };
        const seenEx = new Set((target.examples ?? []).map((ex) => exDedupKey(ex)));
        const added = (sc.examples ?? []).filter((ex) => {
            const k = exDedupKey(ex);
            if (!k) return true; // không có romanization + han → giữ
            if (seenEx.has(k)) return false;
            seenEx.add(k);
            return true;
        });
        next.examples = [...(target.examples ?? []), ...added];
        return next;
    };
    const sensesOverlap = (exSenses, scSenses) => {
        if (!exSenses.length || !scSenses.length) return false;
        const exSet = new Set(exSenses.map((s) => s.toLowerCase()));
        const scSet = new Set(scSenses.map((s) => s.toLowerCase()));
        let common = 0;
        for (const s of scSet) if (exSet.has(s)) common += 1;
        if (!common) return false;
        const contained = [...scSet].every((s) => exSet.has(s)) || [...exSet].every((s) => scSet.has(s));
        return contained || common >= Math.min(exSet.size, scSet.size);
    };
    const mergeScrapMeanings = (existing, scraped) => {
        const used = new Set();
        const out = (existing ?? []).map((ex) => {
            const exSenses = splitSenseParts(ex.vietMeanings);
            let merged = { ...ex, examples: [...(ex.examples ?? [])] };
            (scraped ?? []).forEach((sc, i) => {
                if (used.has(i)) return;
                if (sensesOverlap(exSenses, splitSenseParts(sc.vietMeanings))) {
                    used.add(i);
                    merged = mergeMeaningInto(merged, sc);
                }
            });
            return merged;
        });
        (scraped ?? []).forEach((sc, i) => {
            if (!used.has(i)) out.push(sc);
        });
        return out;
    };
    // Bỏ dấu câu CJK/ASCII khi tra Hanzii/OpenCC — VD "嗨。" → "嗨" (2026-08-22).
    const stripCjkPunct = (s) =>
        String(s ?? "")
            .replace(/[\u3000-\u303F\uFF00-\uFFEF，。！？、；：（）《》「」『』【】—…,.;:!?()"'“”]+/g, "")
            .trim();
    // Scrap TOÀN BỘ reading pinyin của từ từ Hanzii:
    //   - GHI ĐÈ toàn bộ meaning của reading pinyin hiện có (khớp theo thanh điệu).
    //   - THÊM reading pinyin mới cho phiên âm Hanzii có mà từ chưa có — kể cả khi
    //     user đã xóa hết phiên âm (nút vẫn tái tạo lại).
    const handleScrapAllPinyin = async ({ silent } = {}) => {
        if (scrapingHanzii) return false;
        const isCantonese = useAppStore.getState().language === "cantonese";
        const han = isCantonese
            ? (draft.hanHongKong ?? "").trim() ||
              (draft.hanSimplified ?? "").trim() ||
              (draft.hanTraditional ?? "").trim()
            : (draft.hanSimplified ?? "").trim() || (draft.hanTraditional ?? "").trim();
        if (!han) {
            if (!silent) {
                toast.add({
                    type: "error",
                    title: t.common?.error ?? "Lỗi",
                    description: "Chưa có chữ Hán để tra Hanzii",
                    duration: 3000,
                });
            }
            return false;
        }
        // Bỏ dấu câu để tra Hanzii — "嗨。" → "嗨" (Hanzii không nhận dấu câu).
        const lookupHan = stripCjkPunct(han);
        setScrapingHanzii(true);
        try {
            // Không truyền pinyin → backend trả { word, tones: [{ pinyin, groups }], relatedWords }.
            // relatedWords = MAP theo pinyin ({ "zhǎng": {...}, "cháng": {...} }) — đổi reading
            // (romanization) là đổi từ ghép/đồng nghĩa/trái nghĩa. (2026-08-22)
            const res = await api.hanziiMeanings(lookupHan);
            const roms = Array.isArray(draft.romanization) ? draft.romanization : [];
            // Hán-Việt cho reading tái tạo: ưu tiên backend tính từ chữ Hán của từ
            // (sino-vietnamese.json — backend giờ trả cả khi Hanzii KHÔNG có entry:
            // 我係 → NGÃ HỆ), fallback SANG SINO TỪ TONE HANZII (cn_vi — VD 啲→ĐÍCH),
            // rồi reading pinyin cũ.
            // ⚠️ Tính TRƯỚC check tones rỗng để cantonese vẫn fill được sino khi Hanzii
            // không có entry (VD phrase 我係 — SSR không include, chỉ load client-side). (2026-08-22)
            const fallbackSino =
                String(res?.sinoVietnamese ?? "").trim() ||
                (res?.tones ?? []).find((t) => String(t.sinoVietnamese ?? "").trim())?.sinoVietnamese ||
                roms.find((rd) => rd.type === "pinyin" && (rd.sinoVietnamese ?? "").trim())?.sinoVietnamese ||
                "";
            // Hán-Việt từ HANZII (chỉ nguồn Hanzii — không tính pinyin-sino cũ).
            // ⚠️ 2026-08-23: nếu Hanzii CÓ sino → GHI ĐÈ sino hiện có, vì nguồn Hanzii
            // (cn_vi / hero DOM) chính xác hơn sino đang lưu. Không dùng pickBetterSino
            // giữ sino cũ khi Hanzii có giá trị.
            const hanziiSino =
                String(res?.sinoVietnamese ?? "").trim() ||
                (res?.tones ?? []).find((t) => String(t.sinoVietnamese ?? "").trim())?.sinoVietnamese ||
                "";
            const tones = (res?.tones ?? [])
                .map((tm) => {
                    const pinyin = String(tm.pinyin ?? "").trim();
                    return {
                        pinyin,
                        // Hán-Việt + HSK riêng theo từng tone từ Hanzii (VD 長: zhǎng→TRƯỞNG/HSK 6,
                        // cháng→TRƯỜNG/HSK 2). (2026-08-22)
                        sinoVietnamese: String(tm.sinoVietnamese ?? "").trim(),
                        hskLevel: String(tm.hskLevel ?? "").trim(),
                        // ⚠️ Mandarin: CHỈ lấy hán-simplified cho ví dụ (KHÔNG lấy traditional
                        // trong [] — như user yêu cầu). Cantonese giữ cả 2 (jyutping cần phồn).
                        meanings: buildScrapMeanings(tm.groups ?? [], !isCantonese),
                    };
                })
                .filter((tm) => tm.pinyin && tm.meanings.length);
            if (!tones.length) {
                // ⚠️ 2026-09-02: chỉ đếm reading JYUTPING thật của từ Cantonese — draft có thể bị
                // nhét reading PINYIN của từ Mandarin gợi ý (merge 2 cột ở detail) dù từ Cantonese
                // thật sự TRỐNG → trước đây tưởng "đã có reading" nên không tạo jyutping, full sync
                // báo "không có mục" + không fill gì.
                const cantRoms = isCantonese ? roms.filter((r) => r.type === "jyutping") : roms;
                // Cantonese: Hanzii không có entry (VD phrase 我係) → KHÔNG abort — vẫn fill
                // Hán-Việt (fallback map per-char qua backend) vào reading jyutping hiện có. (2026-08-22)
                if (isCantonese && cantRoms.length) {
                    const nextRoms = roms.map((rd) =>
                        rd.type === "jyutping"
                            ? { ...rd, sinoVietnamese: pickBetterSino(rd.sinoVietnamese, fallbackSino) }
                            : rd,
                    );
                    setDraft((d) => ({ ...d, romanization: nextRoms }));
                    if (!silent) {
                        toast.add({
                            type: "success",
                            title: t.common?.done ?? "Xong",
                            description: "Đã điền Hán-Việt (Hanzii không có entry cho từ này)",
                            duration: 3000,
                        });
                    }
                    return nextRoms;
                }
                // Cantonese + từ KHÔNG có reading nào (trống) + Hanzii có Hán-Việt → vẫn TẠO
                // reading jyutping bằng to-jyutping + gắn Hán-Việt (Hanzii có sino dù không có
                // meanings). Trước đây bỏ sót → từ trống full sync báo "không có mục". (2026-08-29)
                if (isCantonese && !cantRoms.length) {
                    let jyutping = "";
                    try {
                        const jp = await api.toJyutping(lookupHan);
                        jyutping = cleanRomanization(jp?.jyutping ?? "");
                    } catch {
                        jyutping = "";
                    }
                    if (jyutping) {
                        const nextRoms = [
                            {
                                id: undefined,
                                _tempId: crypto.randomUUID(),
                                type: "jyutping",
                                jyutping,
                                pinyin: "",
                                sinoVietnamese: fallbackSino,
                                meanings: [],
                            },
                        ];
                        setDraft((d) => ({ ...d, romanization: nextRoms }));
                        if (!silent) {
                            toast.add({
                                type: "success",
                                title: t.common?.done ?? "Xong",
                                description: "Đã điền phiên âm Jyutping + Hán-Việt (Hanzii không có nghĩa)",
                                duration: 3000,
                            });
                        }
                        return nextRoms;
                    }
                }
                if (!silent) {
                    toast.add({
                        type: "error",
                        title: t.common?.error ?? "Lỗi",
                        description: "Không tìm thấy phiên âm nào trên Hanzii",
                        duration: 3000,
                    });
                }
                return false;
            }
            // ⚠️ 2026-09-08: KHÔNG fill relatedWords (từ ghép/đồng nghĩa/trái nghĩa Hanzii) vào draft
            // nữa — chỉ dùng gợi ý tự động từ app (đã xóa data related_words trong DB).
            // ⚠️ XÓA hết pinyin readings CŨ (chỉ giữ non-pinyin — jyutping), rồi tạo lại HOÀN TOÀN
            // từ tones Hanzii. Trước đây dùng roms.map() giữ reading pinyin không match → sinh thêm
            // cặp sino-pinyin thừa (VD 一口气: reading cũ giữ + reading mới thêm → 2 cặp). (2026-08-21)
            // ⚠️ Cantonese: KHÔNG có pinyin → KHÔNG tạo reading pinyin (bỏ pinyin-pro).
            // Gộp meanings từ Hanzii, gắn vào reading jyutping hiện có. Ví dụ jyutping lấy
            // qua pipeline 3 fallback (words.hk → CC-Canto → to-jyutping = api.toJyutping).
            if (isCantonese) {
                const allMeanings = tones.flatMap((tm) => tm.meanings ?? []);
                for (const m of allMeanings) {
                    for (const ex of m.examples ?? []) {
                        const exHan = stripCjkPunct(
                            (ex.hanTraditional ?? "").trim() || (ex.hanSimplified ?? "").trim(),
                        );
                        if (exHan) {
                            try {
                                const jp = await api.toJyutping(exHan);
                                ex.jyutpingExample = cleanRomanization(jp?.jyutping ?? "");
                            } catch {
                                ex.jyutpingExample = "";
                            }
                        }
                        ex.pinyinExample = "";
                    }
                }
                const jyutRoms = roms.filter((rd) => rd.type === "jyutping");
                let nextRoms;
                if (jyutRoms.length) {
                    // Gắn meanings vào reading jyutping đầu tiên (giữ id/_tempId).
                    // ⚠️ 2026-08-23: Hanzii có sino → GHI ĐÈ (Hanzii chính xác hơn sino hiện có);
                    // chỉ giữ sino cũ khi Hanzii KHÔNG có giá trị. Không còn pickBetterSino.
                    nextRoms = roms.map((rd) =>
                        rd.type === "jyutping"
                            ? {
                                  ...rd,
                                  sinoVietnamese: hanziiSino || rd.sinoVietnamese,
                                  // ⚠️ Merge meaning scrap vào meaning cũ (overlap) thay vì append trùng. (2026-08-22)
                                  meanings: mergeScrapMeanings(rd.meanings ?? [], allMeanings),
                              }
                            : rd,
                    );
                } else {
                    let jyutping = "";
                    try {
                        const jp = await api.toJyutping(lookupHan);
                        jyutping = cleanRomanization(jp?.jyutping ?? "");
                    } catch {
                        jyutping = "";
                    }
                    nextRoms = [
                        ...roms,
                        {
                            id: undefined,
                            _tempId: crypto.randomUUID(),
                            type: "jyutping",
                            jyutping,
                            pinyin: "",
                            sinoVietnamese: fallbackSino,
                            meanings: allMeanings,
                        },
                    ];
                }
                setDraft((d) => ({ ...d, romanization: nextRoms }));
                if (!silent) {
                    toast.add({
                        type: "success",
                        title: t.common?.done ?? "Xong",
                        description: "Đã cập nhật nghĩa từ Hanzii",
                        duration: 3000,
                    });
                }
                return nextRoms;
            }
            // Mandarin: build pinyin readings từ Hanzii tones.
            const nonPinyinRoms = roms.filter((rd) => rd.type !== "pinyin");
            let added = 0;
            const nextRoms = [
                ...nonPinyinRoms,
                ...tones.map((tm) => {
                    added += 1;
                    // Giữ id/_tempId/sinoVietnamese của reading cũ có cùng pinyin (để không đổi id
                    // nếu đã lưu DB), còn không → tạo mới.
                    const existing = roms.find(
                        (rd) => rd.type === "pinyin" && normScrapPinyin(rd.pinyin) === normScrapPinyin(tm.pinyin),
                    );
                    return {
                        id: existing?.id,
                        _tempId: existing?._tempId ?? crypto.randomUUID(),
                        type: "pinyin",
                        sinoVietnamese: (tm.sinoVietnamese ?? "").trim() || existing?.sinoVietnamese || fallbackSino,
                        pinyin: tm.pinyin,
                        jyutping: "",
                        related: tm.related,
                        // ⚠️ Merge meaning scrap vào meaning cũ (overlap) thay vì ghi đè trắng. (2026-08-22)
                        meanings: mergeScrapMeanings(existing?.meanings ?? [], tm.meanings),
                    };
                }),
            ];
            setDraft((d) => ({ ...d, romanization: nextRoms }));
            // Fill cấp độ HSK từ Hanzii (tone đầu tiên có HSK) — vd 長 → "HSK 6". (2026-08-22)
            const scrapHsk = (tones.find((tm) => tm.hskLevel) ?? {}).hskLevel ?? "";
            if (scrapHsk) setDraftField("hskLevel", scrapHsk);
            // ⚠️ KHÔNG thay pinyin từ chính bằng pinyin-pro — pinyin từ chính lấy từ Hanzii
            // làm gốc. pinyin-pro CHỈ dùng cho VÍ DỤ (backend hanToPinyin đã làm lúc scrap).
            // Nếu reading active hiện tại không có nghĩa → chuyển sang reading có nghĩa
            // (thường là reading vừa thêm/update từ Hanzii) để nghĩa hiện ra ngay trên UI.
            const activeIdx = findActiveIdx(nextRoms, "pinyin", editPyId);
            const activeHasMeanings = activeIdx >= 0 && (nextRoms[activeIdx]?.meanings ?? []).length > 0;
            if (!activeHasMeanings) {
                const firstWithMeanings = nextRoms.find((r) => r.type === "pinyin" && (r.meanings ?? []).length > 0);
                if (firstWithMeanings) {
                    setEditPyId(firstWithMeanings._tempId ?? firstWithMeanings.id ?? "");
                }
            }
            if (!silent) {
                toast.add({
                    type: "success",
                    title: t.common?.done ?? "Xong",
                    description: added
                        ? `Đã cập nhật nghĩa + thêm ${added} phiên âm từ Hanzii`
                        : "Đã cập nhật nghĩa từ Hanzii",
                    duration: 3000,
                });
            }
            // Trả mảng romanization mới (đã scrap meanings) — để handleScrapThenSync sync
            // Việt-Anh cho TẤT CẢ reading pinyin (từ đa phiên âm) thay vì chỉ editor active.
            return nextRoms;
        } catch (err) {
            // Dịch lỗi HTTP từ Hanzii upstream thành thông báo dễ hiểu (429/5xx = tạm thời).
            const msg = String(err?.message ?? "");
            const m = msg.match(/Hanzii HTTP (\d{3})/);
            let description = msg;
            if (m) {
                const code = Number(m[1]);
                if (code === 429) description = "Hanzii đang giới hạn truy cập (429) — thử lại sau vài phút";
                else if (code >= 500) description = `Hanzii đang lỗi tạm thời (${code}) — thử lại sau`;
            }
            // silent → KHÔNG toast lỗi (nút gộp Hanzii+Đồng bộ sẽ tự hiện 1 toast tổng hợp cuối cùng).
            if (!silent) {
                toast.add({
                    type: "error",
                    title: t.common?.error ?? "Lỗi",
                    description: description || "Lỗi khi lấy dữ liệu từ Hanzii",
                    duration: 4000,
                });
            }
            return false;
        } finally {
            setScrapingHanzii(false);
        }
    };

    const startEdit = () => {
        setDraft(buildVocabularyDraft(editTarget, { seedEmptyReadings: false }));
        setValidationError("");
        setEditing(true);
    };

    const cancelEdit = () => {
        setDraft(buildVocabularyDraft(editTarget, { seedEmptyReadings: false }));
        setValidationError("");
        setEditing(false);
    };

    // Add mode: nút "clear" — xóa toàn bộ field, GIỮ nguyên edit mode (không xóa component).
    const clearForm = () => {
        setDraft(buildVocabularyDraft(editTarget, { seedEmptyReadings: false }));
        setValidationError("");
        setDupCheck({ mandarin: null, cantonese: null });
        setDupDetail({ open: false, matches: null });
    };

    const saveEdit = async () => {
        if (saving) return; // chống double-submit (click + Enter) → tránh 2 PUT đồng thời gây 500
        const language = useAppStore.getState().language;
        // Add mode tách theo ngôn ngữ (2026-08-18): Cantonese chỉ nhập Phồn thể (hanHongKong),
        // Mandarin nhập Giản thể/Phồn thể (hanSimplified/hanTraditional).
        const han =
            language === "cantonese"
                ? (draft.hanHongKong ?? "").trim()
                : (draft.hanTraditional || draft.hanSimplified || "").trim();
        const roms = Array.isArray(draft.romanization) ? draft.romanization : [];
        // ⚠️ 2026-08-21: chỉ cần hanzi (Cantonese = hanHongKong, Mandarin = hanSimplified/hanTraditional)
        // là có thể save — không còn bắt buộc phải có phiên âm.
        if (!han) {
            showValidationError(t.addWord.requiredFields);
            return;
        }
        const allMeanings = roms.flatMap((r) => r.meanings ?? []);
        const hasBlankMeaning = allMeanings.some((m) => isMeaningBlank(m));
        if (hasBlankMeaning) {
            showValidationError(t.addWord.blankMeaning);
            return;
        }
        const hasBlankExample = allMeanings.some((m) => (m.examples ?? []).some((ex) => isExampleBlank(ex)));
        if (hasBlankExample) {
            showValidationError(t.addWord.blankExample);
            return;
        }
        const legacyPayload = vocabularyDraftPayloadLegacy(draft, { activePinyinId, activeJyutpingId });
        // ⚠️ 2026-08-21: nhánh "không có thay đổi" CHỈ áp dụng cho edit mode. Add mode nếu
        // trùng content sẽ thoát SILENT (không toast, không save) → gây "bấm Save không được,
        // không báo lỗi". Với Add: luôn đi tiếp tới validation/save.
        if (
            !addMode &&
            vocabularyContentEqual(editTarget, normalizeVocabularyFields({ ...editTarget, ...legacyPayload }))
        ) {
            setEditing(false);
            return;
        }
        const payload = vocabularyLangPayload(draft, language);
        setSaving(true);
        try {
            await onSave?.(editTarget, payload);
            setEditing(false);
            toast.add({
                type: "success",
                title: t.wordDetail.savedTitle ?? "Đã lưu",
                description: t.wordDetail.savedDescription ?? "Đã lưu thay đổi thành công.",
                duration: 3000,
            });
        } catch (err) {
            showValidationError(err instanceof Error ? err.message : String(err));
        } finally {
            setSaving(false);
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

    // Cantonese: cấp độ LUÔN = YSK, không có lựa chọn khác (2026-08-19).
    const isCantoneseMode = useAppStore.getState().language === "cantonese";
    // ⚠️ 2026-09-20 (rename từ "important" 2026-09-02): cặp đánh dấu theo user — ❤️ yêu thích /
    // 🚫 không muốn học (LOẠI TRỪ NHAU). Mọi user đã đăng nhập, KHÔNG phải admin-only.
    const signedIn = useIsSignedIn();
    const favoriteVocabularyIds = useFavoriteVocabularyIds();
    const dislikedVocabularyIds = useDislikedVocabularyIds();
    const isFavorite = signedIn && favoriteVocabularyIds.includes(vocabulary.id);
    const isDisliked = signedIn && dislikedVocabularyIds.includes(vocabulary.id);
    const lang = isCantoneseMode ? "cantonese" : "mandarin";
    const toastFlagResult = (promise, { on, marked, unmarked }) => {
        promise
            .then(() => {
                toast.add({
                    type: on ? "success" : "info",
                    title: on ? marked : unmarked,
                    duration: 2000,
                });
            })
            .catch(() => {
                // Store đã rollback; không cần toast lỗi (toast lỗi chung đã có trong api).
            });
    };
    const handleToggleFavorite = () => {
        if (!signedIn) return;
        const next = !isFavorite;
        toastFlagResult(useAppStore.getState().toggleVocabularyFavorite(vocabulary.id, lang, next), {
            on: next,
            marked: t.wordDetail.markedFavorite,
            unmarked: t.wordDetail.unmarkedFavorite,
        });
    };
    const handleToggleDisliked = () => {
        if (!signedIn) return;
        const next = !isDisliked;
        toastFlagResult(useAppStore.getState().toggleVocabularyDisliked(vocabulary.id, lang, next), {
            on: next,
            marked: t.wordDetail.markedDisliked,
            unmarked: t.wordDetail.unmarkedDisliked,
        });
    };

    // ⚠️ 2026-09-02: nút "lưu vào bộ từ" (bookmark) kế star — mọi user đã đăng nhập.
    // ⚠️ 2026-09-20: từ nằm trong bộ nào thì icon bookmark mang MÀU của bộ đó
    // (ưu tiên bộ VỪA thêm trong phiên này; nhiều bộ → lấy bộ đầu tiên).
    const vocabSets = useVocabularySets();
    const [bookmarkSetId, setBookmarkSetId] = useState(null);
    const setMembershipKey = isCantoneseMode ? "cantoneseVocabularyIds" : "mandarinVocabularyIds";
    const membershipSets = vocabSets.filter((s) => (s[setMembershipKey] ?? []).includes(vocabulary.id));
    // Ưu tiên bộ VỪA bấm (có màu ngay, không chờ store cập nhật) → rồi tới bộ đầu tiên chứa từ.
    const bookmarkSet = vocabSets.find((s) => s.id === bookmarkSetId) ?? membershipSets[0] ?? null;
    // Bộ chưa có màu (color rỗng) → dùng màu mặc định của palette (giống chấm màu trong picker).
    const bookmarkColor = bookmarkSet ? bookmarkSet.color || SET_COLORS[0] : null;
    // Đổi từ khác → quên bộ vừa bấm (tránh giữ màu sai).
    useEffect(() => {
        setBookmarkSetId(null);
    }, [vocabulary.id]);
    // Nạp danh sách bộ từ khi mở trang detail (nếu store chưa có) → icon bookmark có màu ngay.
    useEffect(() => {
        if (!signedIn || vocabSets.length > 0) return;
        useAppStore
            .getState()
            .fetchVocabularySets()
            ?.catch(() => {});
    }, [signedIn, vocabSets.length]);
    // ⚠️ 2026-09-05: độ phổ biến = level 1–5 lưu thẳng DB (bỏ percentile theo bank).
    const popLevel = normalizePopularityLevel(vocabulary.popularityLevel ?? null);
    // Full Sync footer (ngoài detail card) chỉ hiện cho admin (2026-08-24).
    const isAdmin = useIsAdmin();
    // ⚠️ 2026-09-27: tag đã gắn cho từ — hiển thị chip CÙNG HÀNG, SAU chip "Độ phổ biến".
    // Tag là metadata dùng chung (không phải per-user) nên ai cũng thấy (kể cả guest).
    const vocabTags = useVocabularyTags(lang, vocabulary.id, true);
    // Nguồn dịch đang chạy (google | libretranslate) — hiển thị trong tiến độ Fill missing data.
    // (2026-08-25) Khi fallback LibreTranslate, hiển thị "Google + mã HTTP lỗi" (403/429...) thay
    // vì text "Google bị chặn" — để user thấy mã lỗi thực tế từ Google. (2026-08-26)
    const fmtTranslateSource = () => {
        const src = api.lastTranslateSource;
        if (src === "libretranslate") {
            const code = api.lastGoogleCode;
            const codeText = code ? ` (Google ${code})` : " (Google)";
            return ` — LibreTranslate${codeText}`;
        }
        if (src === "google") return " — Google";
        return "";
    };

    const headerBar = (
        <div className={cn(headerBarClass, "shrink-0")}>
            <div className="flex flex-1 justify-start items-center gap-2">
                {/* ⚠️ 2026-09-20: cặp icon đánh dấu theo user — ❤️ yêu thích + 🚫 không muốn học
                    (thay ★ "quan trọng" cũ). 2 trạng thái loại trừ nhau. Mọi user đã đăng nhập (view mode). */}
                {signedIn && !editing && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                            "rounded-full",
                            // ⚠️ 2026-09-27: ❤️ yêu thích = màu ĐỎ (token `text-favorite`), không dùng amber.
                            isFavorite ? "text-favorite hover:text-favorite/80" : "text-muted-foreground",
                        )}
                        onClick={handleToggleFavorite}
                        aria-pressed={Boolean(isFavorite)}
                        aria-label={isFavorite ? t.wordDetail.unmarkFavorite : t.wordDetail.markFavorite}
                        title={isFavorite ? t.wordDetail.unmarkFavorite : t.wordDetail.markFavorite}
                    >
                        <Heart className={cn("size-5", isFavorite && "fill-current")} />
                    </Button>
                )}
                {signedIn && !editing && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className={cn("rounded-full", isDisliked ? "text-destructive" : "text-muted-foreground")}
                        onClick={handleToggleDisliked}
                        aria-pressed={Boolean(isDisliked)}
                        aria-label={isDisliked ? t.wordDetail.unmarkDisliked : t.wordDetail.markDisliked}
                        title={isDisliked ? t.wordDetail.unmarkDisliked : t.wordDetail.markDisliked}
                    >
                        <HeartOff className={cn("size-5", isDisliked && "fill-current")} />
                    </Button>
                )}
                {/* ⚠️ 2026-09-02: nút lưu từ vào bộ từ (bookmark) — kế nút star, mọi user đã đăng nhập.
                    Nội dung dropdown DÙNG CHUNG với trang table (VocabularySetPicker) — giống hệt nhau. */}
                {signedIn && !editing && (
                    <DropdownMenu>
                        <DropdownMenuTrigger
                            render={
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className={cn("rounded-full", !bookmarkColor && "text-muted-foreground")}
                                    aria-label={t.vocabSets.addToSet}
                                    title={
                                        bookmarkSet
                                            ? `${t.vocabSets.addToSet}: ${bookmarkSet.name}`
                                            : t.vocabSets.addToSet
                                    }
                                >
                                    <Bookmark
                                        className={cn("size-5", bookmarkColor && "fill-current")}
                                        style={bookmarkColor ? { color: bookmarkColor } : undefined}
                                    />
                                </Button>
                            }
                        />
                        <DropdownMenuContent align="start" className="min-w-56">
                            <VocabularySetPicker
                                vocabId={vocabulary.id}
                                lang={isCantoneseMode ? "cantonese" : "mandarin"}
                                onToggle={(set, inSet) => setBookmarkSetId(inSet ? set.id : null)}
                            />
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
                {/* ⚠️ 2026-09-27: nút TAG (chỉ admin) — mở danh mục tag toàn app để gắn/gỡ cho từ này,
                    tạo tag mới, xóa tag. Icon đổi màu khi từ đang có tag. */}
                {isAdmin && !editing && (
                    <DropdownMenu>
                        <DropdownMenuTrigger
                            render={
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className={cn(
                                        "rounded-full",
                                        vocabTags.length > 0 ? "text-foreground" : "text-muted-foreground",
                                    )}
                                    aria-label={t.tags.addToTag}
                                    title={
                                        vocabTags.length > 0
                                            ? t.tags.tagged.replace("{count}", vocabTags.length)
                                            : t.tags.addToTag
                                    }
                                >
                                    <Tag className={cn("size-5", vocabTags.length > 0 && "fill-current")} />
                                </Button>
                            }
                        />
                        <DropdownMenuContent align="start" className="min-w-56">
                            {/* ⚠️ Base UI: DropdownMenuLabel PHẢI nằm trong DropdownMenuGroup. */}
                            <DropdownMenuGroup>
                                <DropdownMenuLabel>{t.tags.title}</DropdownMenuLabel>
                            </DropdownMenuGroup>
                            <DropdownMenuSeparator />
                            <VocabularyTagPicker
                                vocabId={vocabulary.id}
                                lang={isCantoneseMode ? "cantonese" : "mandarin"}
                            />
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
                {!editing && (
                    <DropdownMenu>
                        <DropdownMenuTrigger
                            render={
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="rounded-full text-muted-foreground"
                                    aria-label={t.wordDetail.displaySettings}
                                    title={t.wordDetail.displaySettings}
                                >
                                    <Settings2 />
                                </Button>
                            }
                        />
                        <DropdownMenuContent align="end">
                            <DropdownMenuGroup>
                                <DropdownMenuLabel>{t.wordDetail.displaySettings}</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuCheckboxItem
                                    checked={showMeaningEn}
                                    onCheckedChange={() => toggleMeaningEn()}
                                >
                                    {t.wordDetail.displaySettingsShowMeaningEn}
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuCheckboxItem
                                    checked={showMeaningGloss}
                                    onCheckedChange={() => toggleMeaningGloss()}
                                >
                                    {t.wordDetail.displaySettingsShowMeaningGloss}
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuCheckboxItem
                                    checked={showExampleEn}
                                    onCheckedChange={() => toggleExampleEn()}
                                >
                                    {t.wordDetail.displaySettingsShowExampleEn}
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuCheckboxItem
                                    checked={examplesDefaultOpen}
                                    onCheckedChange={() => toggleExamplesDefaultOpen()}
                                >
                                    {t.wordDetail.displaySettingsShowExamplesOpen}
                                </DropdownMenuCheckboxItem>
                            </DropdownMenuGroup>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </div>
            {(showLexiconMetaChips || addMode) && (
                <div className="flex flex-1 justify-center items-center gap-2">
                    {addMode && <span className="text-xl font-semibold text-viet">{t.addWord.headerTitle}</span>}
                </div>
            )}
            <div className="flex flex-1 justify-end items-center gap-2">
                {/* Toggle ẩn/hiện cột Mandarin trong view mode 2 cột (khi từ có data Mandarin) (2026-08-28) */}
                {!editing && vocabulary.pinyinReading && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-full text-muted-foreground"
                        onClick={toggleMandarinCol}
                        aria-pressed={showMandarinCol}
                        title={
                            showMandarinCol ? t.wordDetail?.toggleMandarinColHide : t.wordDetail?.toggleMandarinColShow
                        }
                    >
                        {showMandarinCol ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                        <span>{t.wordDetail?.toggleMandarinCol}</span>
                    </Button>
                )}

                {hanRef && (
                    <>
                        <a
                            href={hanziiWordUrl(hanRef, locale) ?? "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center h-9 px-3 rounded-full text-sm font-semibold no-underline bg-card border border-border text-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/10 transition-all duration-200"
                            title={t.wordDetail.openHanzii?.replace("{hanTraditional}", hanRef) ?? "Tra Hanzii"}
                            aria-label={t.wordDetail.openHanzii?.replace("{hanTraditional}", hanRef) ?? "Tra Hanzii"}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <HanziiIcon className="size-5" />
                        </a>
                        <a
                            href={`https://translate.google.com/?sl=yue&tl=vi&text=${encodeURIComponent(hanRef)}&op=translate`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center h-9 px-3 rounded-full text-sm font-semibold no-underline bg-card border border-border text-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/10 transition-all duration-200"
                            title={fmt(t.wordDetail.translateWord, {
                                hanTraditional: hanRef,
                            })}
                            aria-label={fmt(t.wordDetail.translateWord, {
                                hanTraditional: hanRef,
                            })}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <GoogleIcon className="size-5" />
                        </a>
                        <a
                            href={`https://jyutdictionary.com/dictionary/search/auto/${encodeURIComponent(hanRef)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center h-9 px-3 rounded-full text-sm font-semibold no-underline bg-card border border-border text-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/10 transition-all duration-200"
                            title={`Tra "${hanRef}" trên JyutDict`}
                            aria-label={`Tra "${hanRef}" trên JyutDict`}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <JyutDictIcon className="size-5" />
                        </a>
                    </>
                )}
                {!editing && vocabulary.pureCantonese && <YskBadge />}
                {editing ? (
                    isCantoneseMode ? (
                        <YskBadge />
                    ) : (
                        <Select
                            value={draft.hskLevel ?? ""}
                            onValueChange={(v) => setDraftField("hskLevel", v || undefined)}
                        >
                            <SelectTrigger className="h-8 w-auto min-w-28 rounded-full">
                                <SelectValue placeholder={t.wordBank.selectLevel} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem value="">{t.wordBank.selectLevel}</SelectItem>
                                    <SelectItem value="HSK 1">HSK 1</SelectItem>
                                    <SelectItem value="HSK 2">HSK 2</SelectItem>
                                    <SelectItem value="HSK 3">HSK 3</SelectItem>
                                    <SelectItem value="HSK 4">HSK 4</SelectItem>
                                    <SelectItem value="HSK 5">HSK 5</SelectItem>
                                    <SelectItem value="HSK 6">HSK 6</SelectItem>
                                    <SelectItem value="HSK 7-9">HSK 7-9</SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                    )
                ) : !isCantoneseMode ? (
                    <span
                        className={cn(
                            "inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-4 py-2 text-sm font-semibold leading-none",
                            vocabulary.hskLevel
                                ? hskLevelBadgeClass(vocabulary.hskLevel)
                                : "border-muted text-muted-foreground/70",
                        )}
                    >
                        {vocabulary.hskLevel || "HSK"}
                    </span>
                ) : null}
            </div>
        </div>
    );

    // TÁCH theo ngôn ngữ (2026-08-19): edit mode cũng chỉ render card của ngôn ngữ đang chọn
    // — Cantonese edit KHÔNG có cột Mandarin (Cantonese chỉ dùng traditional HK + Jyutping).
    // Mandarin: simp + trad; Cantonese: chỉ 1 field Phồn thể HK.
    const activeLang = useAppStore.getState().language;
    const showMandarin = activeLang === "mandarin";
    const showCantonese = activeLang === "cantonese";
    // Card còn hiện khi có reading HOẶC có hán tự — xóa hết reading (phiên âm) không được
    // làm mất field hán tự (2026-08-18: trước đây xóa reading cuối làm unmount cả card).
    const hasMandarinHan = Boolean(
        (draft.hanSimplified ?? "").trim() ||
        (draft.hanTraditional ?? "").trim() ||
        (vocabulary.hanSimplified ?? "").trim() ||
        (vocabulary.hanTraditional ?? "").trim(),
    );
    const hasCantoneseHan = Boolean((draft.hanHongKong ?? "").trim() || (vocabulary.hanHongKong ?? "").trim());
    // ⚠️ 2026-08-21: add mode luôn hiện card ngôn ngữ đang chọn (showMandarin/showCantonese đã
    // giới hạn đúng 1 card) — dù chưa có reading/hán tự, để user gõ hanzi trước rồi save.
    const showMandarinCard = showMandarin && (addMode || readingsOf("pinyin").length > 0 || hasMandarinHan);
    const showCantoneseCard = showCantonese && (addMode || readingsOf("jyutping").length > 0 || hasCantoneseHan);

    return (
        <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-4" onKeyDown={handleFormKeyDown}>
            {headerRef?.current ? createPortal(headerBar, headerRef.current) : headerBar}

            {/* Pronunciation — luôn hiện toggle chip */}
            {pronunciationBar}

            <div className="flex min-h-0 flex-1 flex-col gap-4">
                <div
                    className={cn(
                        "mx-auto relative flex w-full min-w-0 flex-1 flex-col justify-start items-center",
                        fieldStackClass,
                    )}
                >
                    {/* View-mode hero — CHỈ render khi có flat meanings (legacy, không readings).
                        Từ trống (no readings + no meanings) render TRONG CARD (nhánh canEdit) để đồng
                        bộ cấu trúc với từ bình thường. */}
                    {!addMode &&
                        !editing &&
                        !(vocabulary.pinyinReading || vocabulary.jyutpingReading) &&
                        ((vocabulary.vietMeanings ?? "").trim() || (vocabulary.engMeanings ?? "").trim()) && (
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
                        )}

                    {/* Add mode: LUÔN render form edit (không bao giờ view mode). */}
                    {editing || addMode ? (
                        <div className="w-full">
                            <div
                                className={cn(
                                    "w-full grid gap-6 items-start",
                                    showMandarinCard && showCantoneseCard
                                        ? "grid-cols-1 lg:grid-cols-2"
                                        : "grid-cols-1",
                                )}
                            >
                                {showMandarinCard && (
                                    <Card className="flex h-full flex-col gap-2! overflow-hidden rounded-xl bg-card ring-0 pt-0! pb-0!">
                                        <CardContent className="flex flex-col gap-8 px-0!">
                                            <WordHanRomanBlock
                                                editing={editing}
                                                column="mandarin"
                                                draft={draft}
                                                display={display}
                                                onDraftChange={setDraftField}
                                                locale={locale}
                                                hanTraditional={vocabulary.hanTraditional}
                                                pinyin={vocabulary.pinyin}
                                                jyutping={vocabulary.jyutping}
                                                sinoVietnamese={vocabulary.sinoVietnamese}
                                                autoFocus={addMode}
                                                dupCheck={dupCheck.mandarin}
                                                onShowDuplicates={(matches) =>
                                                    setDupDetail({
                                                        open: true,
                                                        lang: "mandarin",
                                                        matches,
                                                        full: null,
                                                        loading: false,
                                                    })
                                                }
                                            />
                                            <ReadingHeader
                                                type="pinyin"
                                                reading={activePinyinDraftEntry}
                                                readings={readingsOf("pinyin").map((r) => ({
                                                    ...r,
                                                    key: readingKeyOf(r),
                                                }))}
                                                activeKey={readingKeyOf(activePinyinDraftEntry)}
                                                onSelect={(key) => setEditPyId(key)}
                                            />
                                            {/* ⚠️ 2026-09-05: chỉnh độ phổ biến (5 mức) khi edit — thay pill view */}
                                            <PopularityLevelEdit
                                                value={draft.popularityLevel ?? null}
                                                onChange={(v) => setDraftField("popularityLevel", v)}
                                            />
                                            <PronunciationEditor
                                                column="pinyin"
                                                pinyinReadings={readingsOf("pinyin")}
                                                activePinyinId={editPyId}
                                                onPinyinChange={(next) =>
                                                    handleRomanizationChange(replaceReadingType("pinyin", next))
                                                }
                                            />
                                            <div onFocusCapture={() => setActiveMeaningsEditor("pinyin")}>
                                                <MeaningsEditor
                                                    ref={pyMeaningsRef}
                                                    key={readingKeyOf(activePinyinDraftEntry)}
                                                    flat
                                                    column="pinyin"
                                                    meanings={activeMeaningsOf("pinyin", editPyId)}
                                                    hasReading={readingsOf("pinyin").some(
                                                        (r) =>
                                                            (r.sinoVietnamese ?? "").trim() || (r.pinyin ?? "").trim(),
                                                    )}
                                                    onChange={handlePinyinMeaningsChange}
                                                />
                                            </div>
                                        </CardContent>
                                    </Card>
                                )}
                                {showCantoneseCard && (
                                    <Card className="flex h-full flex-col gap-2! overflow-hidden rounded-xl bg-card ring-0 pt-0! pb-0!">
                                        <CardContent className="flex flex-col gap-8 px-0!">
                                            <WordHanRomanBlock
                                                editing={editing}
                                                column="cantonese"
                                                draft={draft}
                                                display={display}
                                                onDraftChange={setDraftField}
                                                locale={locale}
                                                hanTraditional={vocabulary.hanTraditional}
                                                pinyin={vocabulary.pinyin}
                                                jyutping={vocabulary.jyutping}
                                                sinoVietnamese={vocabulary.sinoVietnamese}
                                                autoFocus={addMode}
                                                dupCheck={dupCheck.cantonese}
                                                onShowDuplicates={(matches) =>
                                                    setDupDetail({
                                                        open: true,
                                                        lang: "cantonese",
                                                        matches,
                                                        full: null,
                                                        loading: false,
                                                    })
                                                }
                                            />
                                            <ReadingHeader
                                                type="jyutping"
                                                reading={activeJyutpingDraftEntry}
                                                readings={readingsOf("jyutping").map((r) => ({
                                                    ...r,
                                                    key: readingKeyOf(r),
                                                }))}
                                                activeKey={readingKeyOf(activeJyutpingDraftEntry)}
                                                onSelect={(key) => setEditJpId(key)}
                                            />
                                            {/* ⚠️ 2026-09-05: chỉnh độ phổ biến (5 mức) khi edit — thay pill view */}
                                            <PopularityLevelEdit
                                                value={draft.popularityLevel ?? null}
                                                onChange={(v) => setDraftField("popularityLevel", v)}
                                            />
                                            <PronunciationEditor
                                                column="jyutping"
                                                jyutpingReadings={readingsOf("jyutping")}
                                                activeJyutpingId={editJpId}
                                                onJyutpingChange={(next) =>
                                                    handleRomanizationChange(replaceReadingType("jyutping", next))
                                                }
                                            />
                                            <div onFocusCapture={() => setActiveMeaningsEditor("jyutping")}>
                                                <MeaningsEditor
                                                    ref={jpMeaningsRef}
                                                    key={readingKeyOf(activeJyutpingDraftEntry)}
                                                    flat
                                                    column="jyutping"
                                                    meanings={activeMeaningsOf("jyutping", editJpId)}
                                                    hasReading={readingsOf("jyutping").some(
                                                        (r) =>
                                                            (r.sinoVietnamese ?? "").trim() ||
                                                            (r.jyutping ?? "").trim(),
                                                    )}
                                                    onChange={handleJyutpingMeaningsChange}
                                                />
                                            </div>
                                        </CardContent>
                                    </Card>
                                )}
                            </div>
                        </div>
                    ) : vocabulary.pinyinReading || vocabulary.jyutpingReading ? (
                        <div className="w-full">
                            <div
                                className={cn(
                                    "w-full grid gap-6 items-start",
                                    showMandarinCol &&
                                        vocabulary.pinyinReading &&
                                        (vocabulary.jyutpingReading || isCantoneseMode)
                                        ? "grid-cols-1 lg:grid-cols-2"
                                        : "grid-cols-1",
                                )}
                            >
                                {/* Card Cantonese LUÔN hiện cho từ Cantonese (kể cả chưa có jyutping) —
                                    tránh bị merge mandarin che mất thành chỉ thấy cột Mandarin. */}
                                {(vocabulary.jyutpingReading || isCantoneseMode) && (
                                    <Card className="flex h-full flex-col gap-2! overflow-hidden rounded-xl bg-card ring-0 pt-0! pb-0!">
                                        <CardContent className="flex flex-col gap-4 px-0!">
                                            <div className="mb-4 flex min-h-32 w-full flex-col items-center justify-center gap-4">
                                                <WordHanRomanBlock
                                                    editing={editing}
                                                    draft={draft}
                                                    display={display}
                                                    onDraftChange={setDraftField}
                                                    locale={locale}
                                                    hanTraditional={vocabulary.hanTraditional}
                                                    pinyin={vocabulary.pinyin}
                                                    jyutping={vocabulary.jyutping}
                                                    sinoVietnamese={vocabulary.jyutpingReading?.sinoVietnamese}
                                                    pureCantonese={vocabulary.pureCantonese}
                                                    column="cantonese"
                                                    showSuggestion={false}
                                                    hanziAudio={vocabulary.hanziAudio}
                                                    englishAudio={vocabulary.englishAudio}
                                                />
                                            </div>
                                            {vocabulary.jyutpingReading ? (
                                                <>
                                                    {/* Group switch + Độ phổ biến + TAG CÙNG 1 hàng ngang (trailing) — 2026-09-01 */}
                                                    <ReadingHeader
                                                        type="jyutping"
                                                        reading={vocabulary.jyutpingReading}
                                                        readings={jyutpingReadings}
                                                        activeKey={activeJyutpingKey}
                                                        onSelect={onSelectJyutping}
                                                        trailing={
                                                            <>
                                                                <PopularityChip level={popLevel} />
                                                                {/* Tag của từ thuộc NGÔN NGỮ đang học → chỉ hiện ở cột tương ứng. */}
                                                                {isCantoneseMode && (
                                                                    <VocabularyTagChips tags={vocabTags} />
                                                                )}
                                                            </>
                                                        }
                                                    />
                                                    <ReadingMeaningsBlock
                                                        reading={vocabulary.jyutpingReading}
                                                        type="jyutping"
                                                        t={t}
                                                        fmt={fmt}
                                                        hanTraditional={vocabulary.hanTraditional}
                                                        hanSimplified={vocabulary.hanSimplified}
                                                        hanHongKong={vocabulary.hanHongKong}
                                                        onAddMeaning={
                                                            canEdit && onSave && !editing ? startEdit : undefined
                                                        }
                                                        showHeader={false}
                                                        englishAudio={vocabulary.englishAudio}
                                                    />
                                                </>
                                            ) : (
                                                /* Độ phổ biến cho từ chưa có jyutping — sau hero (2026-09-01) */
                                                <div className="flex flex-wrap items-center justify-start gap-2">
                                                    <PopularityChip level={popLevel} />
                                                    {isCantoneseMode && <VocabularyTagChips tags={vocabTags} />}
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                )}
                                {showMandarinCol && vocabulary.pinyinReading && (
                                    <Card className="flex h-full flex-col gap-2! overflow-hidden rounded-xl bg-card ring-0 pt-0! pb-0!">
                                        <CardContent className="flex flex-col gap-4 px-0!">
                                            <div className="mb-4 flex min-h-32 w-full flex-col items-center justify-center gap-4">
                                                <WordHanRomanBlock
                                                    editing={editing}
                                                    draft={draft}
                                                    display={display}
                                                    onDraftChange={setDraftField}
                                                    locale={locale}
                                                    hanTraditional={vocabulary.hanTraditional}
                                                    pinyin={vocabulary.pinyin}
                                                    jyutping={vocabulary.jyutping}
                                                    sinoVietnamese={vocabulary.pinyinReading?.sinoVietnamese}
                                                    pureCantonese={vocabulary.pureCantonese}
                                                    column="mandarin"
                                                />
                                            </div>
                                            {/* Chip cách đọc nằm DƯỚI div hán tự (2026-08-20) */}
                                            <ReadingHeader
                                                type="pinyin"
                                                reading={vocabulary.pinyinReading}
                                                readings={pinyinReadings}
                                                activeKey={activePinyinKey}
                                                onSelect={onSelectPinyin}
                                                trailing={(() => {
                                                    // Fast-link tới trang detail tiếng Quan Thoại (cột mandarin) —
                                                    // CHỈ hiện trên trang detail Cantonese (link sang Mandarin).
                                                    // Trên trang Mandarin đây là self-link vô nghĩa → ẩn. (2026-08-23)
                                                    const han = (
                                                        vocabulary.hanSimplified ||
                                                        vocabulary.hanTraditional ||
                                                        ""
                                                    ).trim();
                                                    return (
                                                        <>
                                                            {/* Độ phổ biến Mandarin — đứng trước anchor (2026-09-01) */}
                                                            <PopularityChip level={popLevel} />
                                                            {/* Tag (ngôn ngữ đang học) đứng sau độ phổ biến — 2026-09-27 */}
                                                            {!isCantoneseMode && (
                                                                <VocabularyTagChips tags={vocabTags} />
                                                            )}
                                                            {isCantoneseMode && han ? (
                                                                <Link
                                                                    to={`/m/vocabulary/${encodeURIComponent(han)}`}
                                                                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-primary/10"
                                                                    title={
                                                                        t.wordDetail?.openDetail ?? "Mở trang chi tiết"
                                                                    }
                                                                    aria-label={
                                                                        t.wordDetail?.openDetail ?? "Mở trang chi tiết"
                                                                    }
                                                                >
                                                                    <ArrowUpRight className="size-4" />
                                                                    <span>{han}</span>
                                                                </Link>
                                                            ) : null}
                                                        </>
                                                    );
                                                })()}
                                            />
                                            <ReadingMeaningsBlock
                                                reading={vocabulary.pinyinReading}
                                                type="pinyin"
                                                t={t}
                                                fmt={fmt}
                                                hanTraditional={vocabulary.hanTraditional}
                                                hanSimplified={vocabulary.hanSimplified}
                                                hanHongKong={vocabulary.hanHongKong}
                                                showHeader={false}
                                                showEmpty={false}
                                            />
                                        </CardContent>
                                    </Card>
                                )}
                            </div>
                        </div>
                    ) : (vocabulary.vietMeanings ?? "").trim() || (vocabulary.engMeanings ?? "").trim() ? (
                        <div className="w-full flex flex-col gap-4">
                            <Card className="bg-card shadow-sm ring-0 border border-border/60">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm font-semibold text-foreground">
                                        {t.wordDetail.meaning}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="flex flex-col gap-4">
                                    {(vocabulary.vietMeanings ?? "").trim() && (
                                        <span className="text-sm font-semibold text-foreground">
                                            {vocabulary.vietMeanings}
                                        </span>
                                    )}
                                    {(vocabulary.engMeanings ?? "").trim() && (
                                        <span className="text-sm text-foreground">{vocabulary.engMeanings}</span>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    ) : (
                        // Từ trống (no readings + no meanings) — LUÔN render card (hero + hint) kể cả
                        // khi không phải admin (canEdit=false) — tránh trang trống khi chưa login.
                        // Nút Edit chỉ hiện khi canEdit. (2026-08-22)
                        <div className="w-full">
                            <Card className="flex h-full flex-col gap-2! overflow-hidden rounded-xl bg-card ring-0 pt-0! pb-0!">
                                <CardContent className="flex flex-col gap-4 px-0!">
                                    <div className="mb-4 flex min-h-32 w-full flex-col items-center justify-center gap-4">
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
                                            pureCantonese={vocabulary.pureCantonese}
                                            column={isCantoneseMode ? "cantonese" : "mandarin"}
                                            showSuggestion={false}
                                            hanziAudio={isCantoneseMode ? vocabulary.hanziAudio : null}
                                            englishAudio={isCantoneseMode ? vocabulary.englishAudio : null}
                                        />
                                    </div>
                                    {/* Empty content — từ rỗng chỉ hiện hero hán tự, KHÔNG hiện
                                        message + nút Edit trong card (2026-08-22: user ko cần div này) */}
                                </CardContent>
                            </Card>
                        </div>
                    )}

                    {/* Separator dọc — đặt ở BODY container (relative) để kéo dài 100% body (2026-08-21).
                        Ẩn cùng cột Mandarin khi toggle tắt (2026-08-29). */}
                    {((!editing && showMandarinCol && vocabulary.pinyinReading && vocabulary.jyutpingReading) ||
                        (editing &&
                            showMandarin &&
                            readingsOf("pinyin").length > 0 &&
                            showCantonese &&
                            readingsOf("jyutping").length > 0)) && (
                        <span
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-px -translate-x-1/2 bg-border lg:block"
                        />
                    )}

                    {dupDetail.open && dupDetail.matches?.length > 0 && (
                        <Dialog open={dupDetail.open} onOpenChange={(open) => setDupDetail((d) => ({ ...d, open }))}>
                            <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
                                <DialogHeader>
                                    <DialogTitle>
                                        {fmt(t.wordDetail.duplicateRecords, {
                                            hanTraditional:
                                                dupVocabToView(dupDetail.matches[0], dupDetail.lang).han || "…",
                                            count: dupDetail.matches.length,
                                        })}
                                    </DialogTitle>
                                    <DialogDescription className="sr-only">
                                        {t.wordDetail.duplicateHint}
                                    </DialogDescription>
                                </DialogHeader>
                                {dupDetail.loading && !dupDetail.full?.length ? (
                                    <div className="flex flex-col gap-4">
                                        {[0, 1].map((i) => (
                                            <Skeleton key={i} className="h-36 w-full rounded-xl" />
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-4">
                                        {(dupDetail.full?.length ? dupDetail.full : dupDetail.matches).map((v, i) => {
                                            const item = dupVocabToView(v, dupDetail.lang);
                                            return (
                                                <div
                                                    key={item.id || i}
                                                    className="flex flex-col gap-2 rounded-xl bg-card p-4"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <span
                                                            className={cn(
                                                                "wd-han text-lg font-semibold leading-tight",
                                                                item.isC ? "text-han-trad" : "text-han-simp",
                                                            )}
                                                        >
                                                            {item.han || "-"}
                                                        </span>
                                                        {item.isC ? (
                                                            item.pure && (
                                                                <Badge
                                                                    variant="outline"
                                                                    className="rounded-full px-2 py-0 text-xs"
                                                                >
                                                                    YSK
                                                                </Badge>
                                                            )
                                                        ) : item.hsk ? (
                                                            <Badge
                                                                variant="outline"
                                                                className={cn(
                                                                    "rounded-full px-2 py-0 text-xs",
                                                                    hskLevelBadgeClass(item.hsk),
                                                                )}
                                                            >
                                                                {item.hsk}
                                                            </Badge>
                                                        ) : null}
                                                    </div>
                                                    {item.readings.map((r, ri) => (
                                                        <div key={ri} className="flex flex-col gap-1">
                                                            {(r.sino || r.roman) && (
                                                                <div className="flex flex-wrap items-baseline gap-x-2">
                                                                    {r.roman && (
                                                                        <span
                                                                            className={cn(
                                                                                "text-sm font-semibold",
                                                                                item.isC
                                                                                    ? "text-jyutping"
                                                                                    : "text-pinyin",
                                                                            )}
                                                                        >
                                                                            {r.roman}
                                                                        </span>
                                                                    )}
                                                                    {r.sino && (
                                                                        <span className="text-xs text-muted-foreground">
                                                                            {r.sino}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            )}
                                                            {r.meanings.map((m, mi) => (
                                                                <div
                                                                    key={mi}
                                                                    className="flex items-baseline gap-2 text-sm"
                                                                >
                                                                    <span className="w-4 shrink-0 text-right text-xs font-semibold text-muted-foreground tabular-nums">
                                                                        {mi + 1}.
                                                                    </span>
                                                                    <span className="flex min-w-0 flex-col gap-0.5">
                                                                        {m.vi && (
                                                                            <span className="text-foreground">
                                                                                {displayMeaning(m.vi)}
                                                                            </span>
                                                                        )}
                                                                        {m.en && (
                                                                            <span className="text-muted-foreground">
                                                                                {displayMeaning(m.en)}
                                                                            </span>
                                                                        )}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ))}
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        className="mt-1 self-start"
                                                        onClick={() => openDuplicate(v, dupDetail.lang)}
                                                    >
                                                        {t.wordDetail.duplicateOpen}
                                                    </Button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </DialogContent>
                        </Dialog>
                    )}
                </div>

                {!editing && <LexiconInfo vocabulary={vocabulary} t={t} />}

                {/* Từ ghép/đồng nghĩa/trái nghĩa — hiện CẢ edit + view. Lúc edit đọc draft.relatedWords
                    (fill ngay sau Full Sync), lúc view đọc vocabulary.relatedWords (sau khi lưu).
                    Theo reading active (đổi romanization là đổi related). (2026-08-22) */}
                <HanCharactersBreakdown
                    vocabulary={vocabulary}
                    relatedWords={editing ? draft.relatedWords : undefined}
                    activePinyin={
                        editing ? (activePinyinDraftEntry?.pinyin ?? "") : (vocabulary.pinyinReading?.pinyin ?? "")
                    }
                />
            </div>

            {(() => {
                const actionBar = (
                    <div className={cn(actionBarClass, "shrink-0 bg-card px-0 pt-4 pb-4")}>
                        <div className="flex justify-start items-center gap-2">
                            {/* ⚠️ 2026-09-02: nút "Quay lại" — trái ngoài cùng, quay về từ vừa xem trước đó.
                                Primary GIỐNG nút "Từ tiếp theo" (cặp điều hướng trước/sau cùng style). */}
                            {onBack && !editing && (
                                <Button
                                    className="bg-primary text-primary-foreground border-primary hover:enabled:bg-primary/90 min-w-28"
                                    onClick={onBack}
                                    disabled={loading || busy}
                                >
                                    <ArrowLeft data-icon="inline-start" />
                                    {t.wordDetail.backWord}
                                </Button>
                            )}
                            {canEdit && onSave && !editing && (
                                <Button
                                    className="bg-amber-500 text-white hover:bg-amber-600 border-amber-600 min-w-28"
                                    onClick={startEdit}
                                    disabled={busy}
                                >
                                    {t.common.edit}
                                </Button>
                            )}
                            {canEdit &&
                                onSave &&
                                editing &&
                                (addMode ? (
                                    <Button
                                        variant="destructive"
                                        onClick={clearForm}
                                        className="min-w-28"
                                        disabled={busy}
                                    >
                                        {t.common.clear}
                                    </Button>
                                ) : (
                                    <Button
                                        variant="destructive"
                                        onClick={cancelEdit}
                                        className="min-w-28"
                                        disabled={busy}
                                    >
                                        {t.common.cancel}
                                    </Button>
                                ))}
                            {onDelete && !addMode && (
                                <Button
                                    variant="destructive"
                                    onClick={() => setDeleteOpen(true)}
                                    className="min-w-28"
                                    disabled={busy}
                                >
                                    {t.common.delete}
                                </Button>
                            )}
                        </div>

                        <div className="flex justify-end items-center gap-2">
                            {/* Full Sync MANDARIN (view mode) — scrap + sync vi↔en + lưu thẳng DB */}
                            {isAdmin && !editing && !isCantoneseMode && (
                                <Button
                                    type="button"
                                    className="bg-primary text-primary-foreground border-primary hover:enabled:bg-primary/90 min-w-28"
                                    onClick={handleFullSyncMandarin}
                                    disabled={busy}
                                    title={t.addWord?.fetchHanziiSyncHint}
                                >
                                    {combinedOp && activeOp === "fullSyncMandarin" && <Spinner className="size-3.5" />}
                                    {combinedOp && activeOp === "fullSyncMandarin"
                                        ? fullSyncStep === "hanzii"
                                            ? "1. Getting data from Hanzii…"
                                            : fullSyncStep === "examples"
                                              ? "2. Fill examples pinyin…"
                                              : fullSyncStep === "missing"
                                                ? syncViEnProgress
                                                    ? `3. Fill missing data (${syncViEnProgress.done}/${syncViEnProgress.total})${fmtTranslateSource()}`
                                                    : "3. Fill missing data…"
                                                : "Full Sync - Mandarin"
                                        : "Full Sync - Mandarin"}
                                </Button>
                            )}
                            {/* Full Sync CANTONESE (view mode) — scrap + sync vi↔en + lưu thẳng DB */}
                            {isAdmin && !editing && isCantoneseMode && (
                                <Button
                                    type="button"
                                    className="bg-primary text-primary-foreground border-primary hover:enabled:bg-primary/90 min-w-28"
                                    onClick={handleFullSyncCantonese}
                                    disabled={busy}
                                    title={t.addWord?.fetchHanziiSyncCantoneseHint}
                                >
                                    {combinedOp && activeOp === "fullSyncCantonese" && <Spinner className="size-3.5" />}
                                    {combinedOp && activeOp === "fullSyncCantonese"
                                        ? fullSyncStep === "hanzii"
                                            ? "1. Getting data from Hanzii…"
                                            : fullSyncStep === "missing"
                                              ? syncViEnProgress
                                                  ? `3. Fill missing data (${syncViEnProgress.done}/${syncViEnProgress.total})${fmtTranslateSource()}`
                                                  : "3. Fill missing data…"
                                              : "Full Sync - Cantonese"
                                        : "Full Sync - Cantonese"}
                                </Button>
                            )}
                            {/* Full Sync cho từ MANDARIN (cột gợi ý) — chạy ngay từ detail Cantonese view mode.
                                ⚠️ 2026-09-01: ẩn khi KHÔNG hiển thị cột Mandarin (chưa bật showMandarinCol HOẶC
                                không có pinyinReading — cột mandarin chỉ render khi showMandarinCol && pinyinReading). */}
                            {isAdmin &&
                                !editing &&
                                isCantoneseMode &&
                                showMandarinCol &&
                                vocabulary.pinyinReading &&
                                suggestedMandarinVocab && (
                                    <Button
                                        type="button"
                                        className="bg-primary text-primary-foreground border-primary hover:enabled:bg-primary/90 min-w-28"
                                        onClick={handleFullSyncMandarinSuggestion}
                                        disabled={busy}
                                        title={t.addWord?.fetchHanziiSyncHint}
                                    >
                                        {combinedOp && activeOp === "fullSyncMandarin" && (
                                            <Spinner className="size-3.5" />
                                        )}
                                        {combinedOp && activeOp === "fullSyncMandarin"
                                            ? fullSyncStep === "hanzii"
                                                ? "1. Getting data from Hanzii…"
                                                : fullSyncStep === "examples"
                                                  ? "2. Fill examples pinyin…"
                                                  : fullSyncStep === "missing"
                                                    ? syncViEnProgress
                                                        ? `3. Fill missing data (${syncViEnProgress.done}/${syncViEnProgress.total})${fmtTranslateSource()}`
                                                        : "3. Fill missing data…"
                                                    : "Full Sync - Mandarin"
                                            : "Full Sync - Mandarin"}
                                    </Button>
                                )}
                            {onNextRandom && !editing && (
                                <Button
                                    className="bg-primary text-primary-foreground border-primary hover:enabled:bg-primary/90 min-w-28"
                                    onClick={onNextRandom}
                                    disabled={loading || busy}
                                >
                                    {t.wordDetail.nextWord}
                                    <ArrowRight data-icon="inline-end" />
                                </Button>
                            )}
                            {/* Nút Hanzii + Đồng bộ — MANDARIN (scrap pinyin + sync vi-en) */}
                            {canEdit && onSave && editing && showMandarinCard && (
                                <Button
                                    type="button"
                                    className="bg-primary text-primary-foreground border-primary hover:enabled:bg-primary/90 min-w-28"
                                    onClick={handleScrapThenSync}
                                    disabled={busy}
                                    title={t.addWord?.fetchHanziiSyncHint}
                                >
                                    {combinedOp && activeOp === "fullSync" && <Spinner className="size-3.5" />}
                                    {combinedOp && activeOp === "fullSync"
                                        ? fullSyncStep === "hanzii"
                                            ? "1. Getting data from Hanzii…"
                                            : fullSyncStep === "examples"
                                              ? "2. Fill examples pinyin…"
                                              : fullSyncStep === "missing"
                                                ? syncViEnProgress
                                                    ? `3. Fill missing data (${syncViEnProgress.done}/${syncViEnProgress.total})${fmtTranslateSource()}`
                                                    : "3. Fill missing data…"
                                                : (t.addWord?.fetchHanziiSync ?? "Lấy từ Hanzii + Đồng bộ")
                                        : (t.addWord?.fetchHanziiSync ?? "Lấy từ Hanzii + Đồng bộ")}
                                </Button>
                            )}
                            {/* Nút Hanzii + Đồng bộ + Jyutping — CANTONESE (scrap + sync vi↔en + fill jyutping) */}
                            {canEdit && onSave && editing && showCantoneseCard && (
                                <Button
                                    type="button"
                                    className="bg-primary text-primary-foreground border-primary hover:enabled:bg-primary/90 min-w-28"
                                    onClick={handleScrapThenSyncCantonese}
                                    disabled={busy}
                                    title={t.addWord?.fetchHanziiSyncCantoneseHint}
                                >
                                    {combinedOp && activeOp === "fullSyncCantonese" && <Spinner className="size-3.5" />}
                                    {combinedOp && activeOp === "fullSyncCantonese"
                                        ? fullSyncStep === "hanzii"
                                            ? "1. Getting data from Hanzii…"
                                            : fullSyncStep === "examples"
                                              ? "2. Fill examples jyutping…"
                                              : fullSyncStep === "missing"
                                                ? syncViEnProgress
                                                    ? `3. Fill missing data (${syncViEnProgress.done}/${syncViEnProgress.total})${fmtTranslateSource()}`
                                                    : "3. Fill missing data…"
                                                : (t.addWord?.fetchHanziiSync ?? "Full Sync")
                                        : (t.addWord?.fetchHanziiSync ?? "Full Sync")}
                                </Button>
                            )}
                            {canEdit && onSave && editing && (showMandarinCard || showCantoneseCard) && (
                                <Button
                                    type="button"
                                    className="min-w-28"
                                    onClick={handleSyncAllViEnFromFooter}
                                    disabled={busy}
                                    title={t.addWord?.syncAllViEnHint}
                                >
                                    {combinedOp && activeOp === "fillMissing" && <Spinner className="size-3.5" />}
                                    {combinedOp && activeOp === "fillMissing"
                                        ? fullSyncStep === "examples"
                                            ? "2. Fill examples…"
                                            : fullSyncStep === "missing"
                                              ? syncViEnProgress
                                                  ? `3. Fill missing data (${syncViEnProgress.done}/${syncViEnProgress.total})${fmtTranslateSource()}`
                                                  : "3. Fill missing data…"
                                              : (t.addWord?.syncAllViEn ?? "Fill Missing Data")
                                        : (t.addWord?.syncAllViEn ?? "Fill Missing Data")}
                                </Button>
                            )}
                            {canEdit && onSave && editing && (
                                <Button
                                    className="bg-primary text-primary-foreground border-primary hover:enabled:bg-primary/90 min-w-28"
                                    onClick={saveEdit}
                                    disabled={busy}
                                    aria-busy={saving}
                                >
                                    {/* ⚠️ 2026-09-19: SPIN cho tới khi BACKEND lưu xong (`saveEdit` await
                                        `onSave` → API PUT) — trước đây nút chỉ bị disable, không có dấu hiệu
                                        đang chạy nên tưởng treo. */}
                                    {saving && <Spinner className="size-3.5" />}
                                    {saving
                                        ? (t.common?.saving ?? "Đang lưu…")
                                        : addMode
                                          ? t.common.save
                                          : t.wordDetail.saveEdit}
                                </Button>
                            )}
                        </div>
                    </div>
                );
                if (footerRef?.current) return createPortal(actionBar, footerRef.current);
                return actionBar;
            })()}

            {deleteOpen && onDelete && (
                <ConfirmDialog
                    title={t.confirm.deleteTitle}
                    message={fmt(t.confirm.deleteVocabulary, { label: hanRef || String(vocabulary.id).slice(0, 8) })}
                    confirmLabel={t.confirm.deleteYes}
                    cancelLabel={t.common.cancel}
                    onConfirm={onDelete}
                    onCancel={() => setDeleteOpen(false)}
                    danger
                />
            )}
        </div>
    );
}
