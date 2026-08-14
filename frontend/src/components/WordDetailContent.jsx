import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { cn } from "../lib/cn.js";
import { Button } from "./shadcn/button.jsx";
import { useLocale } from "../store/localeStore.js";
import { vocabularyLookupDisplay } from "../lib/hanLookup.js";
import { diffHanChars } from "../lib/hanScriptDisplay.js";
import { WordPopularityPicker } from "./WordPopularityPicker.jsx";
import { WordSentenceSuggestions } from "./WordSentenceSuggestions.jsx";
import { WordFieldText } from "./WordFieldText.jsx";
import { buildVocabularyDraft, vocabularyDraftPayload, vocabularyDraftPayloadLegacy } from "./WordEditFields.jsx";
import { MeaningsEditor } from "./WordEditFields.jsx";
import { TagInput } from "./TagInput.jsx";
import { normalizePopularity } from "../lib/wordPopularity.js";
import { displaySinoVietnameseAligned } from "../lib/sinoVietnameseReadings.js";
import {
    normalizeVocabularyFields,
    capitalizeSentences,
    displayMeaning,
    vocabularyContentEqual,
} from "../lib/wordNormalize.js";
import { useVocabularies } from "../store/appStore.js";
import { vocabularyDetailPath } from "../lib/wordRoutes.js";
import { hanziiWordUrl } from "../lib/hanzii.js";
import { computeHanCharacters } from "../lib/hanBreakdown.js";
import { ReadingPair } from "./ReadingPair.jsx";
import { ConfirmDialog } from "./ConfirmDialog.jsx";
import { PronunciationEditor } from "./PronunciationEditor.jsx";
import { GoogleIcon } from "./GoogleIcon.jsx";
import { HanziiIcon, JyutDictIcon } from "./BrandIcons.jsx";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "./shadcn/select.jsx";
import { Tabs, TabsList, TabsTrigger } from "./shadcn/tabs.jsx";
import { Switch } from "./shadcn/switch.jsx";
import { Input } from "./shadcn/input.jsx";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./shadcn/dialog.jsx";
import { Card, CardContent, CardHeader, CardTitle } from "./shadcn/card.jsx";
import { toast } from "./shadcn/toast.jsx";
import { Separator } from "./shadcn/separator.jsx";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "./shadcn/collapsible.jsx";
import { ChevronDown } from "lucide-react";

const detailTextClass = "wd-text m-0 max-w-full leading-normal break-normal";

const fieldStackClass = "word-detail-content flex w-full min-w-0 flex-col gap-4";

const valueShellClass = "w-full min-w-0";

const subLabelClass = "wd-sub m-0 font-semibold uppercase tracking-wide text-viet text-center";

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

const highlightMarkClass = "rounded bg-transparent font-semibold text-amber-600 dark:text-amber-300";

/** Set of han characters in the word (both traditional & simplified forms). */
function vocabCharSet(hanTraditional, hanSimplified) {
    const charSet = new Set();
    for (const form of [hanTraditional, hanSimplified]) {
        if (!form) continue;
        for (const ch of form) {
            if (/\p{Script=Han}/u.test(ch)) charSet.add(ch);
        }
    }
    return charSet;
}

/**
 * Highlight characters in text that match the vocabulary word's han characters
 * (both traditional and simplified forms), so e.g. 飞 in a simplified example
 * is highlighted even though the word's traditional form uses 飛.
 */
function highlightVocabChars(exampleText, hanTraditional, hanSimplified) {
    if (!exampleText) return exampleText;
    const charSet = vocabCharSet(hanTraditional, hanSimplified);
    if (charSet.size === 0) return exampleText;
    const pattern = [...charSet].map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const regex = new RegExp(`(${pattern})`, "gu");
    const parts = exampleText.split(regex);
    return parts.map((part, i) => {
        regex.lastIndex = 0; // reset before test (regex has /g flag)
        const matched = part.length > 0 && regex.test(part);
        if (matched) {
            return (
                <mark key={i} className={highlightMarkClass}>
                    {part}
                </mark>
            );
        }
        return part;
    });
}

/**
 * Highlight syllables in a pinyin/jyutping example that correspond (by position)
 * to the han characters highlighted in the han example — so the romanization of
 * the target han char gets the same amber mark as the han char itself.
 */
function highlightRomanization(romanText, exampleHan, hanTraditional, hanSimplified) {
    if (!romanText) return romanText;
    const charSet = vocabCharSet(hanTraditional, hanSimplified);
    if (charSet.size === 0) return romanText;
    const hanChars = [...(exampleHan ?? "")].filter((ch) => /\p{Script=Han}/u.test(ch));
    if (hanChars.length === 0) return romanText;
    const highlighted = hanChars.map((ch) => charSet.has(ch));
    const parts = romanText.split(/(\s+)/);
    let tokenIdx = 0;
    return parts.map((part, i) => {
        if (/^\s*$/.test(part)) return part;
        const isHit = tokenIdx < highlighted.length && highlighted[tokenIdx];
        tokenIdx += 1;
        if (isHit) {
            return (
                <mark key={i} className={highlightMarkClass}>
                    {part}
                </mark>
            );
        }
        return part;
    });
}

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
function HanCharactersBreakdown({ vocabulary }) {
    const { t, locale, fmt } = useLocale();
    // Breakdown tính lại ở frontend từ readings (model mới không còn hanCharacters JSONB).
    const breakdown = useMemo(() => computeHanCharacters(vocabulary), [vocabulary]);

    const list = useMemo(() => {
        if (!Array.isArray(breakdown) || breakdown.length === 0) return [];
        return breakdown.map((item, i) => {
            const ch = String(item?.hanTraditional ?? item?.character ?? "").trim();
            if (!ch) return null;
            const simp = String(item?.hanSimplified ?? "").trim() || undefined;
            return {
                key: `${ch}-${i}`,
                character: ch,
                hanSimplified: simp && simp !== ch ? simp : undefined,
                pinyin: String(item?.pinyin ?? "").trim() || null,
                jyutping: String(item?.jyutping ?? "").trim() || null,
            };
        });
    }, [breakdown]);

    if (list.length === 0) return null;

    return (
        <div className="w-full flex flex-col gap-6">
            <Separator />
            <div className="w-full rounded-xl bg-muted/40 px-4 py-4">
                <p className={cn(subLabelClass, "mb-4")}>{t.wordBank?.colHanCharsDetail ?? "Chữ Hán & Phiên âm"}</p>
                <div className="flex flex-wrap justify-center gap-2">
                    {list.map((item) => {
                        const cell = (
                            <div className="flex min-w-14 flex-col items-center gap-1 rounded-lg border border-border/70 bg-background px-3 py-2 transition-colors">
                                <span className="flex items-baseline justify-center gap-0.5 leading-none">
                                    {item.hanSimplified ? (
                                        <>
                                            <span
                                                className={cn(
                                                    detailTextClass,
                                                    "wd-roman font-semibold not-italic tracking-wide text-3xl leading-none",
                                                    "text-han-simp",
                                                )}
                                            >
                                                {item.hanSimplified}
                                            </span>
                                            <span
                                                className={cn(
                                                    detailTextClass,
                                                    "wd-roman font-semibold not-italic tracking-wide text-3xl leading-none",
                                                    "text-han-trad",
                                                )}
                                            >
                                                {item.character}
                                            </span>
                                        </>
                                    ) : (
                                        <span
                                            className={cn(
                                                detailTextClass,
                                                "wd-roman font-semibold not-italic tracking-wide text-3xl leading-none",
                                                "text-han-trad",
                                            )}
                                        >
                                            {item.character}
                                        </span>
                                    )}
                                </span>
                                <ReadingPair
                                    left={item.pinyin || null}
                                    right={item.jyutping || null}
                                    leftClass={cn(
                                        detailTextClass,
                                        "wd-roman font-semibold not-italic tracking-wide text-xs text-pinyin",
                                    )}
                                    rightClass={cn(
                                        detailTextClass,
                                        "wd-roman font-semibold not-italic tracking-wide text-xs text-jyutping",
                                    )}
                                    containerClass="gap-1 max-w-none"
                                    fallback="-"
                                    fallbackClass="italic text-muted-foreground"
                                />
                            </div>
                        );
                        const url = hanziiWordUrl(item.character, locale);
                        if (!url) {
                            return <div key={item.key}>{cell}</div>;
                        }
                        return (
                            <a
                                key={item.key}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="cursor-pointer rounded-lg border-0 bg-transparent p-0 no-underline transition-opacity duration-150 hover:opacity-80 focus:outline-2 focus:outline-accent focus:outline-offset-2"
                                title={fmt(t.wordDetail.openHanzii, { hanTraditional: item.character })}
                            >
                                {cell}
                            </a>
                        );
                    })}
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
function LexiconMetaChips({ vocabulary, t }) {
    const allVocabs = useVocabularies();
    // Boost (popularity) is a score, not a rank: higher = more common. Show its max
    // plus a relative level label based on store percentiles so readers can tell
    // whether a value is high or low.
    const boostMax = useMemo(() => {
        let max = 0;
        for (const v of allVocabs) max = Math.max(max, Number(v.boost) || 0);
        return max;
    }, [allVocabs]);
    const boostLevels = useMemo(() => {
        const vals = allVocabs
            .map((v) => Number(v.boost) || 0)
            .filter((n) => n > 0)
            .sort((a, b) => a - b);
        if (vals.length < 4) return [0, 0, 0, 0];
        const p = (q) => vals[Math.min(vals.length - 1, Math.floor(q * (vals.length - 1)))];
        return [p(0.25), p(0.5), p(0.75), p(0.9)];
    }, [allVocabs]);
    const boostLevelLabel = (value) => {
        const n = Number(value) || 0;
        const [p25, p50, p75, p90] = boostLevels;
        if (!p90) return null;
        if (n >= p90) return t.wordPopularity?.levels?.[4] ?? null; // Very high
        if (n >= p75) return t.wordPopularity?.levels?.[3] ?? null; // High
        if (n >= p50) return t.wordPopularity?.levels?.[2] ?? null; // Medium
        if (n >= p25) return t.wordPopularity?.levels?.[1] ?? null; // Low
        return t.wordPopularity?.levels?.[0] ?? null; // Rare
    };
    // Frequency (tần suất xuất hiện) — dùng chung cơ chế level theo percentile như boost
    const freqMax = useMemo(() => {
        let max = 0;
        for (const v of allVocabs) max = Math.max(max, Number(v.frequency) || 0);
        return max;
    }, [allVocabs]);
    const freqLevels = useMemo(() => {
        const vals = allVocabs
            .map((v) => Number(v.frequency) || 0)
            .filter((n) => n > 0)
            .sort((a, b) => a - b);
        if (vals.length < 4) return [0, 0, 0, 0];
        const p = (q) => vals[Math.min(vals.length - 1, Math.floor(q * (vals.length - 1)))];
        return [p(0.25), p(0.5), p(0.75), p(0.9)];
    }, [allVocabs]);
    const freqLevelLabel = (value) => {
        const n = Number(value) || 0;
        const [p25, p50, p75, p90] = freqLevels;
        if (!p90) return null;
        if (n >= p90) return t.wordPopularity?.levels?.[4] ?? null; // Very high
        if (n >= p75) return t.wordPopularity?.levels?.[3] ?? null; // High
        if (n >= p50) return t.wordPopularity?.levels?.[2] ?? null; // Medium
        if (n >= p25) return t.wordPopularity?.levels?.[1] ?? null; // Low
        return t.wordPopularity?.levels?.[0] ?? null; // Rare
    };
    const boostLabel = boostLevelLabel(vocabulary.boost);
    const freqLabel = freqLevelLabel(vocabulary.frequency);
    // Luôn hiện các chip; khi thiếu dữ liệu hiển thị "—" để dev/biết field đang trống
    const hasValue = (v) => v !== undefined && v !== null && v !== "";
    const meta = [
        {
            label: t.wordDetail.boost,
            value: hasValue(vocabulary.boost) ? vocabulary.boost : "—",
            missing: !hasValue(vocabulary.boost),
            max: boostMax || undefined,
            noMax: true,
            level: boostLabel,
            onlyBadge: true,
        },
        {
            label: t.wordDetail.frequency,
            value: hasValue(vocabulary.frequency) ? vocabulary.frequency : "—",
            missing: !hasValue(vocabulary.frequency),
            max: freqMax || undefined,
            level: freqLabel,
            onlyBadge: true,
        },
    ];
    if (meta.length === 0) return null;

    // Badge level đổi màu theo cấp độ (Rất cao→Cao→TB→Thấp→Hiếm) — dùng chung palette LEVEL_BADGE_CLASSES.
    const levelBadgeClass = (label) => {
        const idx = (t.wordPopularity?.levels ?? []).indexOf(label);
        if (idx < 0) return LEVEL_BADGE_CLASSES[0];
        return LEVEL_BADGE_CLASSES[idx];
    };

    return (
        <div className="flex flex-wrap items-center gap-2">
            {meta.map((m) => (
                <span
                    key={m.label}
                    className="inline-flex items-baseline gap-1.5 rounded-lg border border-border/70 bg-card px-2.5 py-1 text-xs shadow-sm"
                >
                    <span
                        className={cn("uppercase tracking-wide text-[10px] font-semibold leading-none text-foreground")}
                    >
                        {m.label}
                    </span>
                    <span className="inline-flex items-baseline gap-1.5 font-semibold text-foreground">
                        {m.onlyBadge ? (
                            m.missing || !m.level ? (
                                <span className="leading-none text-muted-foreground">—</span>
                            ) : (
                                <span
                                    className={cn(
                                        "self-center rounded px-1.5 py-px text-[10px] font-semibold leading-none",
                                        levelBadgeClass(m.level),
                                    )}
                                >
                                    {m.level}
                                </span>
                            )
                        ) : (
                            <>
                                <span className={cn("leading-none", m.missing && "text-muted-foreground")}>
                                    {m.value}
                                </span>
                                {!m.missing && m.max && !m.noMax ? (
                                    <span className="font-semibold text-muted-foreground leading-none"> / {m.max}</span>
                                ) : null}
                                {!m.missing && m.level ? (
                                    <span
                                        className={cn(
                                            "self-center rounded px-1.5 py-px text-[10px] font-semibold leading-none",
                                            levelBadgeClass(m.level),
                                        )}
                                    >
                                        {m.level}
                                    </span>
                                ) : null}
                            </>
                        )}
                    </span>
                </span>
            ))}
        </div>
    );
}

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
    column,
}) {
    const { t } = useLocale();
    const [copied, setCopied] = useState(null);
    const copyTimer = useRef(null);
    useEffect(() => () => clearTimeout(copyTimer.current), []);

    /** Copy a han phrase to clipboard and show "Copied" right next to it. */
    const copyHanChar = (ch) => {
        const text = String(ch ?? "");
        if (!text) return;
        const done = () => {
            setCopied(text);
            if (copyTimer.current) clearTimeout(copyTimer.current);
            copyTimer.current = setTimeout(() => setCopied(null), 1200);
        };
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(text).then(done).catch(done);
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
            done();
        }
    };

    /** Render text as one clickable han phrase (click = copy the whole phrase).
     *  Mỗi ký tự nằm trong <span> riêng để đồng nhất cấu trúc DOM với
     *  renderHanWithDiff — tránh khác biệt rasterize (độ dày nét) giữa 2 cột. */
    function renderHanText(text) {
        if (!text) return null;
        const isCopied = copied === text;
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
                {isCopied && (
                    <span className="absolute left-full top-1/2 ml-2 -translate-y-1/2 whitespace-nowrap text-sm font-semibold text-primary">
                        {t.common?.copied ?? "Copied"}
                    </span>
                )}
            </button>
        );
    }

    /** Render text giữ nguyên màu cột (xanh cho Mandarin), chữ KHÁC bản kia
     *  được gạch chân chấm để nhận biết — không đổi màu chữ. */
    function renderHanWithDiffMark(text, diffChars) {
        if (!text) return null;
        const hasDiff = diffChars && diffChars.length > 0 && text.length > 1;
        if (!hasDiff) return renderHanText(text);
        const isCopied = copied === text;
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
                {isCopied && (
                    <span className="absolute left-full top-1/2 ml-2 -translate-y-1/2 whitespace-nowrap text-sm font-semibold text-primary">
                        {t.common?.copied ?? "Copied"}
                    </span>
                )}
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
                <div className="flex flex-col items-center gap-4">
                    <p className={subLabelClass}>{t.wordBank.colHanTitleMandarin}</p>
                    <div className={cn(hanCellBodyClass, "w-full")}>
                        <Input
                            className={cn(hanEditClass, "text-han-simp w-full")}
                            value={draft.hanSimplified ?? ""}
                            onChange={(e) => onDraftChange("hanSimplified", e.target.value)}
                        />
                    </div>
                </div>
            );
        }
        if (column === "cantonese") {
            return (
                <div className="flex flex-col items-center gap-4">
                    <p className={subLabelClass}>{t.wordBank.colHanTitleCantonese}</p>
                    <div className={cn(hanCellBodyClass, "w-full")}>
                        <Input
                            className={cn(hanEditClass, "text-han-trad w-full")}
                            value={draft.hanHongKong ?? ""}
                            onChange={(e) => onDraftChange("hanHongKong", e.target.value)}
                        />
                    </div>
                </div>
            );
        }
        return (
            <div className={shellClass}>
                <div className={cn("grid grid-cols-1 items-stretch sm:grid-cols-2 sm:gap-6")}>
                    <HanSubField label={t.wordBank.colHanTitleMandarin}>
                        <Input
                            className={cn(hanEditClass, "text-han-simp")}
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
    const sinoAbove = (sinoVietnamese ?? "").trim();
    if (!editing && column === "mandarin") {
        return (
            <div className="flex flex-col items-center gap-6">
                <p className="m-0 text-xl font-medium tracking-wide text-center text-viet">
                    {t.wordBank.colHanTitleMandarin}
                </p>
                <div className="flex flex-col items-center gap-2">
                    {sinoAbove && (
                        <p className="m-0 font-semibold not-italic tracking-wide text-center text-foreground text-xl! leading-none">
                            {displaySinoVietnameseAligned(sinoVietnamese, hanText)}
                        </p>
                    )}
                    <span className={cn(hanGlyphClass, "font-semibold text-han-simp text-6xl!")}>
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
                    <p className="m-0 font-semibold not-italic tracking-wide text-center text-pinyin text-xl! leading-none">
                        {pinyin || <span className="italic text-muted-foreground">-</span>}
                    </p>
                </div>
            </div>
        );
    }
    if (!editing && column === "cantonese") {
        return (
            <div className="flex flex-col items-center gap-6">
                <p className="m-0 text-xl font-medium tracking-wide text-center text-viet">
                    {t.wordBank.colHanTitleCantonese}
                </p>
                <div className="flex flex-col items-center gap-2">
                    {sinoAbove && (
                        <p className="m-0 font-semibold not-italic tracking-wide text-center text-foreground text-xl! leading-none">
                            {displaySinoVietnameseAligned(sinoVietnamese, hanText)}
                        </p>
                    )}
                    <span className={cn(hanGlyphClass, "font-semibold text-han-trad text-6xl!")}>
                        {display.hongKong?.trim() ? (
                            renderHanText(display.hongKong)
                        ) : (
                            <span className="italic text-muted-foreground">-</span>
                        )}
                    </span>
                    <p className="m-0 font-semibold not-italic tracking-wide text-center text-jyutping text-xl! leading-none">
                        {jyutping || <span className="italic text-muted-foreground">-</span>}
                    </p>
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
function ReadingHeader({ type, reading, readings, activeKey, onSelect }) {
    const { t } = useLocale();
    const isPinyin = type === "pinyin";
    const valueOf = (r) => (isPinyin ? (r?.pinyin ?? "") : (r?.jyutping ?? ""));

    // Dedupe readings trùng phiên âm → chỉ render 1 chip/1 giá trị.
    // Reading CHƯA điền value (rỗng — reading mới trong edit) giữ riêng từng chip (key riêng).
    const uniqueReadings = Array.isArray(readings)
        ? readings.filter((r, i, arr) => {
              const v = valueOf(r);
              if (!v) return true;
              return arr.findIndex((x) => valueOf(x) === v) === i;
          })
        : [];
    // Chỉ hiện group switch khi từ có NHIỀU hơn 1 phiên âm KHÁC NHAU (dedupe trùng)
    // — 1 phiên âm (kể cả data bị lặp) thì bỏ hẳn.
    const multi = new Set(uniqueReadings.map((r) => valueOf(r)).filter(Boolean)).size > 1;
    return (
        <div className="flex flex-wrap items-center justify-center gap-2">
            {uniqueReadings.length > 0 ? (
                <Tabs
                    value={activeKey ?? ""}
                    onValueChange={(key) => {
                        if (key && key !== activeKey) onSelect?.(key);
                    }}
                    aria-label={isPinyin ? t.wordDetail.cyclePinyin : t.wordDetail.cycleJyutping}
                    className={cn("w-fit", multi ? "" : "invisible")}
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
            ) : null}
        </div>
    );
}

/**
 * Khối meanings của 1 reading (Mandarin hoặc Cantonese) ở view mode.
 * Nghĩa nhóm theo dict nguồn (words.hk → 粵典–words.hk, CC-Canto), ví dụ
 * collapse được. Rỗng → hiện noMeaningsYet.
 */
/** Ví dụ của 1 nghĩa — gói trong Collapsible, gấp gọn mặc định (bấm mới xổ ra).
 *  Style theo đúng ví dụ shadcn Collapsible: header (title + chevron button) + content. */
function MeaningExamples({ label, children }) {
    const [open, setOpen] = useState(false);
    return (
        <Collapsible open={open} onOpenChange={setOpen} className="flex w-full flex-col gap-2">
            <CollapsibleTrigger
                render={<Button type="button" variant="ghost" size="sm" className="h-8 gap-2 px-2 w-fit" />}
                aria-label="Toggle details"
            >
                <h4 className="text-sm font-semibold">{label}</h4>
                <ChevronDown />
                <span className="sr-only">Toggle details</span>
            </CollapsibleTrigger>
            <CollapsibleContent>
                <div className="flex flex-col gap-2">{children}</div>
            </CollapsibleContent>
        </Collapsible>
    );
}

function ReadingMeaningsBlock({
    reading,
    type,
    t,
    fmt,
    hanTraditional,
    hanSimplified,
    onAddMeaning,
    showHeader = true,
}) {
    const meanings = reading?.meanings ?? [];
    const dictLabel = (raw) => ({ "words.hk": "粵典–words.hk", "CC-Canto": "CC-Canto" })[raw] ?? raw;
    const roman = (i) => ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"][i] ?? String(i + 1);
    const groups = new Map();
    for (const m of meanings) {
        const cat = dictLabel((m.category ?? "").trim() || t.wordDetail.meaning);
        if (!groups.has(cat)) groups.set(cat, []);
        groups.get(cat).push(m);
    }
    return (
        <div className="flex flex-col gap-4">
            {showHeader && <ReadingHeader type={type} reading={reading} />}
            {groups.size === 0 ? (
                <div className="flex items-center gap-2 py-2">
                    <p className="text-sm text-muted-foreground italic">{t.wordDetail.noMeaningsYet}</p>
                    {onAddMeaning && (
                        <Button
                            type="button"
                            variant="ghost"
                            className="h-auto px-0 py-0 text-sm font-semibold text-viet hover:bg-transparent hover:text-viet/80 dark:hover:bg-transparent"
                            onClick={onAddMeaning}
                        >
                            {t.wordDetail.addNow}
                        </Button>
                    )}
                </div>
            ) : (
                [...groups.entries()].map(([category, items], gi) => (
                    <div key={category} className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-4 items-baseline">
                        <span className="text-lg font-semibold text-purple">{roman(gi)}.</span>
                        <div className="flex items-baseline gap-2">
                            <span className="text-lg font-semibold text-purple">{category}</span>
                            <span className="text-sm text-muted-foreground">({items.length})</span>
                        </div>
                        {items.map((m, i) => (
                            <div key={m.id || i} className="col-start-2 flex flex-col gap-1">
                                <div className="flex items-baseline gap-2">
                                    <span className="shrink-0 text-left text-base font-bold text-viet">{i + 1}.</span>
                                    <span className="text-base font-semibold text-foreground">
                                        {displayMeaning(m.vietMeanings) || "—"}
                                    </span>
                                </div>
                                {m.engMeanings?.trim() && (
                                    <div className="flex items-baseline gap-2">
                                        <span className="shrink-0 text-left text-base font-bold invisible">
                                            {i + 1}.
                                        </span>
                                        <span className="text-base font-semibold text-foreground">
                                            {displayMeaning(m.engMeanings)}
                                        </span>
                                    </div>
                                )}
                                {(m.examples ?? []).length > 0 && (
                                    <div className="mt-2 ml-4.5">
                                        <MeaningExamples
                                            label={fmt(t.wordDetail.examples, { count: (m.examples ?? []).length })}
                                        >
                                            {m.examples.map((ex, j) => {
                                                const exSimp = (ex.hanSimplified ?? "").trim();
                                                const exTrad = (ex.hanTraditional ?? "").trim();
                                                const exFallback = (ex.hanExample ?? "").trim();
                                                const mapLine = exSimp || exTrad || exFallback;
                                                const hanLines =
                                                    exSimp || exTrad
                                                        ? [exSimp, exTrad].filter(Boolean)
                                                        : exFallback
                                                              .split("\n")
                                                              .map((line) => line.trim())
                                                              .filter(Boolean);
                                                return (
                                                    <div
                                                        key={ex.id || j}
                                                        className="rounded-lg border border-border/70 bg-background p-4"
                                                    >
                                                        {hanLines.length > 0 && (
                                                            <div className="flex flex-col gap-0.5 mb-1">
                                                                {hanLines.map((line, li) => (
                                                                    <p
                                                                        key={li}
                                                                        className="text-base font-semibold text-foreground whitespace-pre-line"
                                                                    >
                                                                        {highlightVocabChars(
                                                                            line,
                                                                            hanTraditional,
                                                                            hanSimplified,
                                                                        )}
                                                                    </p>
                                                                ))}
                                                            </div>
                                                        )}
                                                        {ex.pinyinExample?.trim() && (
                                                            <p className="text-sm text-primary-foreground font-semibold mb-1">
                                                                {highlightRomanization(
                                                                    ex.pinyinExample,
                                                                    mapLine,
                                                                    hanTraditional,
                                                                    hanSimplified,
                                                                )}
                                                            </p>
                                                        )}
                                                        {ex.jyutpingExample?.trim() && (
                                                            <p className="text-sm text-primary-foreground font-semibold mb-1">
                                                                {highlightRomanization(
                                                                    ex.jyutpingExample,
                                                                    mapLine,
                                                                    hanTraditional,
                                                                    hanSimplified,
                                                                )}
                                                            </p>
                                                        )}
                                                        {ex.vietExamples?.trim() && (
                                                            <p className="text-sm text-primary-foreground mb-1">
                                                                {capitalizeSentences(ex.vietExamples)}
                                                            </p>
                                                        )}
                                                        {ex.engExamples?.trim() && (
                                                            <p className="text-sm text-primary-foreground">
                                                                {capitalizeSentences(ex.engExamples)}
                                                            </p>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </MeaningExamples>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                ))
            )}
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
}) {
    const { t, locale, fmt } = useLocale();
    const display = vocabularyLookupDisplay(vocabulary);
    // Hán tự tham chiếu cho link Hanzii/Google — chỉ dùng cặp simp + hk
    const hanRef = (vocabulary.hanSimplified || vocabulary.hanHongKong || vocabulary.hanTraditional || "").trim();
    const vocabularies = useVocabularies();

    const [editing, setEditing] = useState(initialEditing);
    const [draft, setDraft] = useState(() => buildVocabularyDraft(vocabulary));
    const [validationError, setValidationError] = useState("");
    const [duplicateWarning, setDuplicateWarning] = useState(null);
    const [duplicateDetailOpen, setDuplicateDetailOpen] = useState(false);
    const [localPopularity, setLocalPopularity] = useState(() => normalizePopularity(vocabulary.popularity));
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
    useEffect(() => {
        if (!validationError) return;
        toast.add({
            type: "error",
            title: t.common?.error ?? "Lỗi",
            description: validationError,
            duration: 4000,
        });
    }, [validationError, t]);

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
    const showPopularity = onSetPopularity || localPopularity !== null;

    // Track the vocab being edited. When switching to a different vocabulary
    // (e.g. pronunciation toggle / next random) while in edit mode, exit edit
    // and reset the draft so the previous vocab's values aren't reused.
    const vocabIdRef = useRef(vocabulary.id);
    useEffect(() => {
        if (vocabIdRef.current !== vocabulary.id) {
            vocabIdRef.current = vocabulary.id;
            setEditing(false);
            setValidationError("");
            setDuplicateWarning(null);
            setDraft(buildVocabularyDraft(vocabulary));
        }
    }, [vocabulary]);

    useEffect(() => {
        setLocalPopularity(normalizePopularity(vocabulary.popularity));
        if (!editing) setDraft(buildVocabularyDraft(vocabulary));
    }, [vocabulary, editing]);

    // Duplicate check for add mode: warn if han already exists (check cả 2 form)
    const isAddMode = !vocabulary.hanTraditional?.trim() && !vocabulary.hanSimplified?.trim();
    useEffect(() => {
        if (!isAddMode || !editing) {
            setDuplicateWarning(null);
            return;
        }
        const han = (draft.hanSimplified || draft.hanTraditional || "").trim();
        if (!han) {
            setDuplicateWarning(null);
            return;
        }
        const norm = han.replace(/\s+/g, "");
        const matches = vocabularies.filter(
            (v) =>
                (v.hanTraditional || "").replace(/\s+/g, "") === norm ||
                (v.hanSimplified || "").replace(/\s+/g, "") === norm,
        );
        if (matches.length > 0) {
            setDuplicateWarning(matches);
        } else {
            setDuplicateWarning(null);
        }
    }, [draft.hanSimplified, draft.hanTraditional, isAddMode, editing, vocabularies]);

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
        setEditing(true);
    };

    const cancelEdit = () => {
        setDraft(buildVocabularyDraft(vocabulary));
        setValidationError("");
        setEditing(false);
    };

    // Add mode: nút "clear" — xóa toàn bộ field, GIỮ nguyên edit mode (không xóa component).
    const clearForm = () => {
        setDraft(buildVocabularyDraft(vocabulary));
        setValidationError("");
        setDuplicateWarning(null);
        setLocalPopularity(normalizePopularity(vocabulary.popularity));
    };

    const saveEdit = async () => {
        const han = (draft.hanTraditional || draft.hanSimplified || "").trim();
        const roms = Array.isArray(draft.romanization) ? draft.romanization : [];
        const hasAnyReading = roms.some((r) => (r.pinyin ?? "").trim() || (r.jyutping ?? "").trim());
        if (!han || !hasAnyReading) {
            setValidationError(t.addWord.requiredFields);
            return;
        }
        const allMeanings = roms.flatMap((r) => r.meanings ?? []);
        const hasBlankMeaning = allMeanings.some((m) => isMeaningBlank(m));
        if (hasBlankMeaning) {
            setValidationError(t.addWord.blankMeaning);
            return;
        }
        const hasBlankExample = allMeanings.some((m) => (m.examples ?? []).some((ex) => isExampleBlank(ex)));
        if (hasBlankExample) {
            setValidationError(t.addWord.blankExample);
            return;
        }
        const legacyPayload = vocabularyDraftPayloadLegacy(draft, { activePinyinId, activeJyutpingId });
        if (vocabularyContentEqual(vocabulary, normalizeVocabularyFields({ ...vocabulary, ...legacyPayload }))) {
            setEditing(false);
            return;
        }
        const payload = vocabularyDraftPayload(draft, { activePinyinId, activeJyutpingId });
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

    const headerBar = (
        <div className={cn(headerBarClass, "shrink-0")}>
            <div className="flex flex-1 justify-start items-center gap-2">
                {onToggleImportant && !editing ? (
                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className={important ? "text-primary" : "text-muted-foreground"}
                        onClick={() => onToggleImportant(vocabulary)}
                        aria-label={important ? t.wordBank.unmarkImportant : t.wordBank.markImportant}
                        title={important ? t.wordBank.unmarkImportant : t.wordBank.markImportant}
                        aria-pressed={important}
                    >
                        ★
                    </Button>
                ) : null}
                {editing && (
                    <label
                        className="inline-flex h-8 items-center gap-2 rounded-full border border-border/70 bg-card px-3 text-xs font-medium text-muted-foreground cursor-pointer transition-colors hover:bg-muted/50"
                        title={t.wordBank.pureCantoneseBadgeTitle}
                    >
                        <Switch
                            checked={Boolean(draft.pureCantonese)}
                            onCheckedChange={(v) => setDraftField("pureCantonese", v)}
                        />
                        {t.wordBank.pureCantonese}
                    </label>
                )}
            </div>
            {showLexiconMetaChips && (
                <div className="flex flex-1 justify-center items-center gap-2">
                    <LexiconMetaChips vocabulary={vocabulary} t={t} />
                </div>
            )}
            <div className="flex flex-1 justify-end items-center gap-2">
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
                {editing ? (
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
                ) : vocabulary.pureCantonese ? (
                    <span
                        title={t.wordBank.pureCantoneseBadgeTitle}
                        className={cn(
                            "inline-flex items-center px-4 py-2 text-sm font-semibold rounded-full border",
                            "bg-cyan-50 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800",
                        )}
                    >
                        {t.wordBank.pureCantoneseBadge}
                    </span>
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
    );

    return (
        <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-4" onKeyDown={handleFormKeyDown}>
            {headerRef?.current ? createPortal(headerBar, headerRef.current) : headerBar}

            {/* Pronunciation — luôn hiện toggle chip */}
            {pronunciationBar}

            <div className="flex min-h-0 flex-1 flex-col gap-4">
                <div
                    className={cn(
                        "mx-auto flex w-full min-w-0 flex-1 flex-col justify-start items-center",
                        fieldStackClass,
                    )}
                >
                    {!editing && !(vocabulary.pinyinReading || vocabulary.jyutpingReading) && (
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

                    {editing ? (
                        <div className="relative w-full">
                            <div
                                className={cn(
                                    "w-full grid gap-6 items-start",
                                    readingsOf("pinyin").length > 0 && readingsOf("jyutping").length > 0
                                        ? "grid-cols-1 lg:grid-cols-2"
                                        : "grid-cols-1",
                                )}
                            >
                                {readingsOf("pinyin").length > 0 && (
                                    <Card className="flex h-full flex-col gap-2! overflow-hidden rounded-xl bg-card ring-0 pt-0! pb-0!">
                                        <CardHeader className="p-0">
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
                                        </CardHeader>
                                        <CardContent className="flex flex-col gap-4 px-0!">
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
                                            />
                                            <Separator />
                                            <PronunciationEditor
                                                column="pinyin"
                                                pinyinReadings={readingsOf("pinyin")}
                                                activePinyinId={editPyId}
                                                onPinyinChange={(next) =>
                                                    handleRomanizationChange(replaceReadingType("pinyin", next))
                                                }
                                            />
                                            <Separator />
                                            <MeaningsEditor
                                                flat
                                                column="pinyin"
                                                meanings={activeMeaningsOf("pinyin", editPyId)}
                                                onChange={handlePinyinMeaningsChange}
                                            />
                                        </CardContent>
                                    </Card>
                                )}
                                {readingsOf("jyutping").length > 0 && (
                                    <Card className="flex h-full flex-col gap-2! overflow-hidden rounded-xl bg-card ring-0 pt-0! pb-0!">
                                        <CardHeader className="p-0">
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
                                        </CardHeader>
                                        <CardContent className="flex flex-col gap-4 px-0!">
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
                                            />
                                            <Separator />
                                            <PronunciationEditor
                                                column="jyutping"
                                                jyutpingReadings={readingsOf("jyutping")}
                                                activeJyutpingId={editJpId}
                                                onJyutpingChange={(next) =>
                                                    handleRomanizationChange(replaceReadingType("jyutping", next))
                                                }
                                            />
                                            <Separator />
                                            <MeaningsEditor
                                                flat
                                                column="jyutping"
                                                meanings={activeMeaningsOf("jyutping", editJpId)}
                                                onChange={handleJyutpingMeaningsChange}
                                            />
                                        </CardContent>
                                    </Card>
                                )}
                            </div>
                            {readingsOf("pinyin").length > 0 && readingsOf("jyutping").length > 0 && (
                                <span
                                    aria-hidden="true"
                                    className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-px -translate-x-1/2 bg-border lg:block"
                                />
                            )}
                        </div>
                    ) : vocabulary.pinyinReading || vocabulary.jyutpingReading ? (
                        <div className="relative w-full">
                            <div
                                className={cn(
                                    "w-full grid gap-6 items-start",
                                    vocabulary.pinyinReading && vocabulary.jyutpingReading
                                        ? "grid-cols-1 lg:grid-cols-2"
                                        : "grid-cols-1",
                                )}
                            >
                                {vocabulary.pinyinReading && (
                                    <Card className="flex h-full flex-col gap-2! overflow-hidden rounded-xl bg-card ring-0 pt-0! pb-0!">
                                        <CardHeader className="p-0">
                                            <ReadingHeader
                                                type="pinyin"
                                                reading={vocabulary.pinyinReading}
                                                readings={pinyinReadings}
                                                activeKey={activePinyinKey}
                                                onSelect={onSelectPinyin}
                                            />
                                        </CardHeader>
                                        <CardContent className="flex flex-col gap-4 px-0!">
                                            <div className="flex min-h-32 w-full flex-col items-center justify-center gap-4">
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
                                                    column="mandarin"
                                                />
                                            </div>
                                            <Separator />
                                            <ReadingMeaningsBlock
                                                reading={vocabulary.pinyinReading}
                                                type="pinyin"
                                                t={t}
                                                fmt={fmt}
                                                hanTraditional={vocabulary.hanTraditional}
                                                hanSimplified={vocabulary.hanSimplified}
                                                onAddMeaning={canEdit && onSave && !editing ? startEdit : undefined}
                                                showHeader={false}
                                            />
                                        </CardContent>
                                    </Card>
                                )}
                                {vocabulary.jyutpingReading && (
                                    <Card className="flex h-full flex-col gap-2! overflow-hidden rounded-xl bg-card ring-0 pt-0! pb-0!">
                                        <CardHeader className="p-0">
                                            <ReadingHeader
                                                type="jyutping"
                                                reading={vocabulary.jyutpingReading}
                                                readings={jyutpingReadings}
                                                activeKey={activeJyutpingKey}
                                                onSelect={onSelectJyutping}
                                            />
                                        </CardHeader>
                                        <CardContent className="flex flex-col gap-4 px-0!">
                                            <div className="flex min-h-32 w-full flex-col items-center justify-center gap-4">
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
                                                    column="cantonese"
                                                />
                                            </div>
                                            <Separator />
                                            <ReadingMeaningsBlock
                                                reading={vocabulary.jyutpingReading}
                                                type="jyutping"
                                                t={t}
                                                fmt={fmt}
                                                hanTraditional={vocabulary.hanTraditional}
                                                hanSimplified={vocabulary.hanSimplified}
                                                onAddMeaning={canEdit && onSave && !editing ? startEdit : undefined}
                                                showHeader={false}
                                            />
                                        </CardContent>
                                    </Card>
                                )}
                            </div>
                            {vocabulary.pinyinReading && vocabulary.jyutpingReading && (
                                <span
                                    aria-hidden="true"
                                    className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-px -translate-x-1/2 bg-border lg:block"
                                />
                            )}
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
                    ) : canEdit ? (
                        <div className="flex flex-col items-start gap-2 py-2">
                            <p className="text-sm text-muted-foreground italic">{t.wordDetail.noMeaningsYet}</p>
                            <Button type="button" size="sm" variant="outline" onClick={startEdit}>
                                {t.common.add}
                            </Button>
                        </div>
                    ) : null}

                    {duplicateWarning && editing && (
                        <button
                            type="button"
                            className="m-0 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-4 text-sm text-left hover:bg-destructive/20 transition-colors cursor-pointer"
                            onClick={() => setDuplicateDetailOpen(true)}
                        >
                            <p className="text-destructive font-medium">
                                {fmt(t.wordDetail.duplicateWarning, { count: duplicateWarning.length })} — Bấm để xem
                                chi tiết
                            </p>
                        </button>
                    )}

                    {duplicateDetailOpen && duplicateWarning && (
                        <Dialog open={duplicateDetailOpen} onOpenChange={setDuplicateDetailOpen}>
                            <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
                                <DialogTitle>
                                    {fmt(t.wordDetail.duplicateRecords, {
                                        hanTraditional: duplicateWarning[0].hanTraditional,
                                        count: duplicateWarning.length,
                                    })}
                                </DialogTitle>
                                <DialogDescription className="sr-only">{t.wordDetail.duplicateHint}</DialogDescription>
                                <div className="flex flex-col gap-4">
                                    {duplicateWarning.map((v, i) => (
                                        <div
                                            key={v.id}
                                            className="rounded-lg border border-border bg-background p-4 text-sm"
                                        >
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-xs font-semibold text-muted-foreground">
                                                    #{i + 1}
                                                </span>
                                                <span className="text-han-trad font-semibold">{v.hanTraditional}</span>
                                                {v.hskLevel && (
                                                    <span className="text-xs text-muted-foreground border border-border rounded-full px-2 py-0.5">
                                                        {v.hskLevel}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                                                {v.pinyin && (
                                                    <span>
                                                        {t.wordBank.colPinyin}:{" "}
                                                        <span className="text-pinyin font-medium">{v.pinyin}</span>
                                                    </span>
                                                )}
                                                {v.jyutping && (
                                                    <span>
                                                        {t.wordBank.colJyutping}:{" "}
                                                        <span className="text-jyutping font-medium">{v.jyutping}</span>
                                                    </span>
                                                )}
                                                {v.sinoVietnamese && (
                                                    <span>
                                                        {t.wordBank.colSinoVietnamese}:{" "}
                                                        <span className="text-foreground font-medium">
                                                            {v.sinoVietnamese}
                                                        </span>
                                                    </span>
                                                )}
                                            </div>
                                            {v.vietMeanings && (
                                                <p className="text-foreground text-xs mt-2">{v.vietMeanings}</p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                <p className="text-sm text-muted-foreground">{t.wordDetail.duplicateHint}</p>
                            </DialogContent>
                        </Dialog>
                    )}
                </div>

                {!editing && <LexiconInfo vocabulary={vocabulary} t={t} />}

                <WordSentenceSuggestions word={vocabulary} />

                {!editing && <HanCharactersBreakdown vocabulary={vocabulary} />}
            </div>

            {(() => {
                const actionBar = (
                    <div className={cn(actionBarClass, "shrink-0 bg-card px-0 pt-4 pb-4")}>
                        <div className="flex justify-start items-center gap-2">
                            {canEdit && onSave && !editing && (
                                <Button
                                    className="bg-amber-500 text-white hover:bg-amber-600 border-amber-600 min-w-28"
                                    onClick={startEdit}
                                >
                                    {t.common.edit}
                                </Button>
                            )}
                            {canEdit &&
                                onSave &&
                                editing &&
                                (addMode ? (
                                    <Button variant="destructive" onClick={clearForm} className="min-w-28">
                                        {t.common.clear}
                                    </Button>
                                ) : (
                                    <Button variant="destructive" onClick={cancelEdit} className="min-w-28">
                                        {t.common.cancel}
                                    </Button>
                                ))}
                            {onDelete && !editing && (
                                <Button variant="destructive" onClick={() => setDeleteOpen(true)} className="min-w-28">
                                    {t.common.delete}
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

                        <div className="flex justify-end items-center gap-2">
                            {onNextRandom && !editing && (
                                <Button
                                    className="bg-primary text-primary-foreground border-primary hover:enabled:bg-primary/90 min-w-28"
                                    onClick={onNextRandom}
                                >
                                    {t.wordDetail.nextWord} →
                                </Button>
                            )}
                            {canEdit && onSave && editing && (
                                <Button
                                    className="bg-primary text-primary-foreground border-primary hover:enabled:bg-primary/90 min-w-28"
                                    onClick={saveEdit}
                                >
                                    {addMode ? t.common.save : t.wordDetail.saveEdit}
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
