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
import { Switch } from "./shadcn/switch.jsx";
import { Input } from "./shadcn/input.jsx";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./shadcn/dialog.jsx";
import { Card, CardContent, CardHeader, CardTitle } from "./shadcn/card.jsx";

const detailTextClass = "wd-text m-0 max-w-full leading-normal break-normal";

const fieldStackClass = "word-detail-content flex w-full min-w-0 flex-col gap-4";

const valueShellClass = "w-full min-w-0";

const subLabelClass = "wd-sub m-0 font-semibold uppercase tracking-wide text-viet text-center";

const hanShellClass = "w-full rounded-xl border border-border/80 bg-card/80 px-6 py-4 sm:px-8 sm:py-4 shadow-sm";

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
 *  Dùng chung cho chip rank + badge HSK để trang detail 1 hệ màu duy nhất. */
const LEVEL_BADGE_CLASSES = [
    "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300", // 0: Hiếm / HSK 7-9
    "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300", // 1: Thấp / HSK 5-6
    "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300", // 2: Trung bình / HSK 3-4
    "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300", // 3: Cao / HSK 1-2
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300", // 4: Rất cao
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

const actionBarClass = "grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2 min-h-10";

const headerBarClass = "grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2 min-h-10";

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
        <div className="w-full rounded-xl border border-border/60 bg-card/80 px-4 py-4 shadow-sm">
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
    );
}

function HanSubField({ label, children }) {
    return (
        <div className={hanCellClass}>
            {label ? <p className={subLabelClass}>{label}</p> : null}
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
    // Max rank across store so readers understand the scale (rank = position, lower = more common)
    const maxMovieRank = useMemo(() => Math.max(0, ...allVocabs.map((v) => Number(v.movieWordRank) || 0)), [allVocabs]);
    const maxBookRank = useMemo(() => Math.max(0, ...allVocabs.map((v) => Number(v.bookWordRank) || 0)), [allVocabs]);
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
    // Rank (xếp hạng phim/sách): giá trị NHỎ = phổ biến hơn (rank 1 = phổ biến nhất),
    // ngược với boost/frequency. Tính level theo percentile đảo.
    const rankLevelsFor = (field) => {
        const vals = allVocabs
            .map((v) => Number(v[field]) || 0)
            .filter((n) => n > 0)
            .sort((a, b) => a - b);
        if (vals.length < 4) return [0, 0, 0, 0];
        const p = (q) => vals[Math.min(vals.length - 1, Math.floor(q * (vals.length - 1)))];
        return [p(0.1), p(0.25), p(0.5), p(0.75)];
    };
    const rankLevelLabel = (value, levels) => {
        const n = Number(value) || Infinity;
        const [p10, p25, p50, p75] = levels;
        if (!p10) return null;
        if (n <= p10) return t.wordPopularity?.levels?.[4] ?? null; // Very high (top 10%)
        if (n <= p25) return t.wordPopularity?.levels?.[3] ?? null; // High
        if (n <= p50) return t.wordPopularity?.levels?.[2] ?? null; // Medium
        if (n <= p75) return t.wordPopularity?.levels?.[1] ?? null; // Low
        return t.wordPopularity?.levels?.[0] ?? null; // Rare
    };
    const movieLevels = useMemo(() => rankLevelsFor("movieWordRank"), [allVocabs]); // eslint-disable-line react-hooks/exhaustive-deps
    const bookLevels = useMemo(() => rankLevelsFor("bookWordRank"), [allVocabs]); // eslint-disable-line react-hooks/exhaustive-deps
    const movieLabel = rankLevelLabel(vocabulary.movieWordRank, movieLevels);
    const bookLabel = rankLevelLabel(vocabulary.bookWordRank, bookLevels);
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
        {
            label: t.wordDetail.movieWordRank,
            value: hasValue(vocabulary.movieWordRank) ? vocabulary.movieWordRank : "—",
            missing: !hasValue(vocabulary.movieWordRank),
            max: maxMovieRank || undefined,
            level: movieLabel,
        },
        {
            label: t.wordDetail.bookWordRank,
            value: hasValue(vocabulary.bookWordRank) ? vocabulary.bookWordRank : "—",
            missing: !hasValue(vocabulary.bookWordRank),
            max: maxBookRank || undefined,
            level: bookLabel,
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
        <div className="w-full flex flex-col gap-4">
            <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-foreground mb-4">{t.wordDetail.relatedWords}</h3>
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
        // Edit: chỉ 2 field — Giản thể + Phồn thể (HK).
        return (
            <div className={shellClass}>
                <div className={cn("grid grid-cols-1 items-stretch sm:grid-cols-2 sm:gap-6")}>
                    <HanSubField label={t.wordBank.colHanSimplified}>
                        <Input
                            className={cn(hanEditClass, "text-han-simp")}
                            value={draft.hanSimplified ?? ""}
                            onChange={(e) => onDraftChange("hanSimplified", e.target.value)}
                        />
                    </HanSubField>
                    <HanSubField label={t.wordBank.colHanHongKong}>
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

    return (
        <div className={shellClass}>
            {sinoVietnamese?.trim() && (
                <p className={cn(pinyinLineClass, "text-center mb-4 text-foreground font-medium")}>
                    {displaySinoVietnameseAligned(sinoVietnamese, hanText)}
                </p>
            )}
            <div className="grid grid-cols-1 items-stretch sm:grid-cols-2 sm:gap-6">
                <HanSubField label={t.wordBank.colHanSimplified}>
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
                <HanSubField label={t.wordBank.colHanHongKong}>
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

/** Header ngắn cho 1 reading: `Mandarin · NHẤT | yī` hoặc `Cantonese · NHẤT | jat1`. */
function ReadingHeader({ type, reading, count }) {
    const value = type === "pinyin" ? (reading?.pinyin ?? "") : (reading?.jyutping ?? "");
    const sino = reading?.sinoVietnamese ?? "";
    const valueClass = type === "pinyin" ? "text-pinyin" : "text-jyutping";
    return (
        <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-viet">{type === "pinyin" ? "Mandarin" : "Cantonese"}</span>
            {(sino || value) && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background px-3 py-1">
                    {sino && <span className="text-xs font-semibold text-foreground">{sino}</span>}
                    {sino && value && <span className="text-sm text-muted-foreground">|</span>}
                    {value && <span className={`text-xs font-semibold ${valueClass}`}>{value}</span>}
                </span>
            )}
            {typeof count === "number" && <span className="text-xs text-muted-foreground">({count})</span>}
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
    collapsedExamples,
    onToggleExample,
    hanTraditional,
    hanSimplified,
    onAddMeaning,
}) {
    const meanings = reading?.meanings ?? [];
    const dictLabel = (raw) => ({ "words.hk": "粵典–words.hk", "CC-Canto": "CC-Canto" })[raw] ?? raw;
    const groups = new Map();
    for (const m of meanings) {
        const cat = dictLabel((m.category ?? "").trim() || t.wordDetail.meaning);
        if (!groups.has(cat)) groups.set(cat, []);
        groups.get(cat).push(m);
    }
    return (
        <div className="flex flex-col gap-4">
            <ReadingHeader type={type} reading={reading} count={meanings.length} />
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
                [...groups.entries()].map(([category, items]) => (
                    <Card key={category} className="bg-card shadow-sm ring-0 border border-border/60">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-semibold text-viet">
                                {category} ({items.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-4">
                            {items.map((m, i) => (
                                <div key={m.id || i}>
                                    <div className="flex items-baseline gap-2 mb-1">
                                        <span className="shrink-0 text-left text-sm font-bold text-viet">{i + 1}.</span>
                                        <span className="text-sm font-semibold text-foreground">
                                            {displayMeaning(m.vietMeanings) || "—"}
                                        </span>
                                    </div>
                                    {m.engMeanings?.trim() && (
                                        <div className="flex items-baseline gap-2 mb-1">
                                            <span className="shrink-0 text-left text-sm font-bold invisible">
                                                {i + 1}.
                                            </span>
                                            <span className="text-sm font-semibold text-foreground">
                                                {displayMeaning(m.engMeanings)}
                                            </span>
                                        </div>
                                    )}
                                    {(m.examples ?? []).length > 0 && (
                                        <div className="mt-2 ml-4.5">
                                            <Button
                                                type="button"
                                                size="sm"
                                                className="mb-2 bg-primary text-primary-foreground border-primary hover:enabled:bg-primary/90"
                                                onClick={() => onToggleExample(m.id || i)}
                                            >
                                                {collapsedExamples.has(m.id || i) ? "▸" : "▾"}{" "}
                                                {fmt(t.wordDetail.examples, { count: (m.examples ?? []).length })}
                                            </Button>
                                            {!collapsedExamples.has(m.id || i) && (
                                                <div className="flex flex-col gap-2">
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
                                                                                className="text-sm font-semibold text-foreground whitespace-pre-line"
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
                                                                    <p className="text-xs text-primary-foreground font-semibold mb-1">
                                                                        {highlightRomanization(
                                                                            ex.pinyinExample,
                                                                            mapLine,
                                                                            hanTraditional,
                                                                            hanSimplified,
                                                                        )}
                                                                    </p>
                                                                )}
                                                                {ex.jyutpingExample?.trim() && (
                                                                    <p className="text-xs text-primary-foreground font-semibold mb-1">
                                                                        {highlightRomanization(
                                                                            ex.jyutpingExample,
                                                                            mapLine,
                                                                            hanTraditional,
                                                                            hanSimplified,
                                                                        )}
                                                                    </p>
                                                                )}
                                                                {ex.vietExamples?.trim() && (
                                                                    <p className="text-sm text-primary-foreground">
                                                                        {ex.vietExamples}
                                                                    </p>
                                                                )}
                                                                {ex.engExamples?.trim() && (
                                                                    <p className="text-sm text-primary-foreground">
                                                                        {ex.engExamples}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </CardContent>
                    </Card>
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
    footerRef,
    pronunciationBar,
    activePinyinId,
    activeJyutpingId,
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
    const [collapsedExamples, setCollapsedExamples] = useState(new Set());
    const [deleteOpen, setDeleteOpen] = useState(false);

    // ── Reading helpers (pinyin = Mandarin, jyutping = Cantonese) ──
    // Tìm index của entry active cho 1 loại reading trong draft.romanization.
    const findActiveIdx = (roms, type, activeId) => {
        const list = Array.isArray(roms) ? roms : [];
        if (activeId) {
            const i = list.findIndex((r) => r.type === type && r.id === activeId);
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
        const idx = findActiveIdx(roms, "pinyin", activePinyinId);
        return idx >= 0 ? roms[idx] : null;
    })();
    const activeJyutpingDraftEntry = (() => {
        const roms = Array.isArray(draft.romanization) ? draft.romanization : [];
        const idx = findActiveIdx(roms, "jyutping", activeJyutpingId);
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
            const idx = findActiveIdx(roms, "pinyin", activePinyinId);
            if (idx < 0) return d;
            return { ...d, romanization: roms.map((r, i) => (i === idx ? { ...r, meanings: newMeanings } : r)) };
        });
    };

    const handleJyutpingMeaningsChange = (newMeanings) => {
        setDraft((d) => {
            const roms = Array.isArray(d.romanization) ? d.romanization : [];
            const idx = findActiveIdx(roms, "jyutping", activeJyutpingId);
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

    return (
        <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-4" onKeyDown={handleFormKeyDown}>
            <div className={cn(headerBarClass, "shrink-0")}>
                <div className="flex justify-start items-center gap-2">
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
                    {editing && hanRef && (
                        <a
                            href={hanziiWordUrl(hanRef, locale)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(
                                "inline-flex items-center justify-center size-7 rounded-lg",
                                "text-xs font-bold no-underline",
                                "bg-card border border-border text-muted-foreground",
                                "hover:border-primary/25 hover:text-primary hover:bg-primary/10",
                                "transition-all duration-200",
                            )}
                            title={fmt(t.wordDetail.openHanzii, { hanTraditional: hanRef })}
                        >
                            ⓘ
                        </a>
                    )}
                </div>
                <div className="flex justify-center items-center gap-2">
                    <LexiconMetaChips vocabulary={vocabulary} t={t} />
                </div>
                <div className="flex justify-end items-center gap-2">
                    {!editing && hanRef && (
                        <>
                            <a
                                href={hanziiWordUrl(hanRef, locale) ?? "#"}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center h-9 px-3 rounded-full text-sm font-semibold no-underline bg-card border border-border text-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/10 transition-all duration-200"
                                title={t.wordDetail.openHanzii?.replace("{hanTraditional}", hanRef) ?? "Tra Hanzii"}
                                aria-label={
                                    t.wordDetail.openHanzii?.replace("{hanTraditional}", hanRef) ?? "Tra Hanzii"
                                }
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
                    ) : null}
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

            {/* Pronunciation — luôn hiện toggle chip; khi edit thêm PronunciationEditor bên dưới */}
            {editing ? (
                <>
                    {pronunciationBar}
                    <PronunciationEditor
                        pinyinReadings={readingsOf("pinyin")}
                        jyutpingReadings={readingsOf("jyutping")}
                        activePinyinId={activePinyinId}
                        activeJyutpingId={activeJyutpingId}
                        onPinyinChange={(next) => handleRomanizationChange(replaceReadingType("pinyin", next))}
                        onJyutpingChange={(next) => handleRomanizationChange(replaceReadingType("jyutping", next))}
                    />
                </>
            ) : (
                pronunciationBar
            )}

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

                    {editing ? (
                        <div
                            className={cn(
                                "w-full grid gap-6 items-start",
                                readingsOf("pinyin").length > 0 && readingsOf("jyutping").length > 0
                                    ? "grid-cols-1 lg:grid-cols-2"
                                    : "grid-cols-1",
                            )}
                        >
                            {readingsOf("pinyin").length > 0 && (
                                <div className="flex flex-col gap-2">
                                    <ReadingHeader
                                        type="pinyin"
                                        reading={activePinyinDraftEntry}
                                        count={activeMeaningsOf("pinyin", activePinyinId).length}
                                    />
                                    <MeaningsEditor
                                        meanings={activeMeaningsOf("pinyin", activePinyinId)}
                                        onChange={handlePinyinMeaningsChange}
                                    />
                                </div>
                            )}
                            {readingsOf("jyutping").length > 0 && (
                                <div className="flex flex-col gap-2">
                                    <ReadingHeader
                                        type="jyutping"
                                        reading={activeJyutpingDraftEntry}
                                        count={activeMeaningsOf("jyutping", activeJyutpingId).length}
                                    />
                                    <MeaningsEditor
                                        meanings={activeMeaningsOf("jyutping", activeJyutpingId)}
                                        onChange={handleJyutpingMeaningsChange}
                                    />
                                </div>
                            )}
                        </div>
                    ) : vocabulary.pinyinReading || vocabulary.jyutpingReading ? (
                        <div
                            className={cn(
                                "w-full grid gap-6 items-start",
                                vocabulary.pinyinReading && vocabulary.jyutpingReading
                                    ? "grid-cols-1 lg:grid-cols-2"
                                    : "grid-cols-1",
                            )}
                        >
                            {vocabulary.pinyinReading && (
                                <ReadingMeaningsBlock
                                    reading={vocabulary.pinyinReading}
                                    type="pinyin"
                                    t={t}
                                    fmt={fmt}
                                    collapsedExamples={collapsedExamples}
                                    onToggleExample={(key) =>
                                        setCollapsedExamples((prev) => {
                                            const next = new Set(prev);
                                            if (next.has(key)) next.delete(key);
                                            else next.add(key);
                                            return next;
                                        })
                                    }
                                    hanTraditional={vocabulary.hanTraditional}
                                    hanSimplified={vocabulary.hanSimplified}
                                    onAddMeaning={canEdit && onSave && !editing ? startEdit : undefined}
                                />
                            )}
                            {vocabulary.jyutpingReading && (
                                <ReadingMeaningsBlock
                                    reading={vocabulary.jyutpingReading}
                                    type="jyutping"
                                    t={t}
                                    fmt={fmt}
                                    collapsedExamples={collapsedExamples}
                                    onToggleExample={(key) =>
                                        setCollapsedExamples((prev) => {
                                            const next = new Set(prev);
                                            if (next.has(key)) next.delete(key);
                                            else next.add(key);
                                            return next;
                                        })
                                    }
                                    hanTraditional={vocabulary.hanTraditional}
                                    hanSimplified={vocabulary.hanSimplified}
                                    onAddMeaning={canEdit && onSave && !editing ? startEdit : undefined}
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

                    {validationError && (
                        <p
                            className="m-0 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-4 text-sm text-destructive"
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

                {!editing && <HanCharactersBreakdown vocabulary={vocabulary} />}
            </div>

            {(() => {
                const actionBar = (
                    <div className={cn(actionBarClass, "shrink-0 bg-card px-0 pt-4 pb-4")}>
                        <div className="flex justify-start items-center gap-2">
                            {canEdit && onSave && !editing && (
                                <Button
                                    className="bg-amber-500 text-white hover:bg-amber-600 border-amber-600"
                                    onClick={startEdit}
                                >
                                    {t.common.edit}
                                </Button>
                            )}
                            {canEdit && onSave && editing && (
                                <Button variant="destructive" onClick={cancelEdit}>
                                    {t.common.cancel}
                                </Button>
                            )}
                            {onDelete && (
                                <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
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

                        <div className="flex justify-end">
                            {canEdit && onSave && editing && (
                                <Button
                                    className="bg-primary text-primary-foreground border-primary hover:enabled:bg-primary/90"
                                    onClick={saveEdit}
                                >
                                    {t.common.save}
                                </Button>
                            )}
                            {onNextRandom && !editing && (
                                <Button
                                    className="bg-emerald-600 text-white border-emerald-700 hover:enabled:bg-emerald-700"
                                    onClick={onNextRandom}
                                >
                                    {t.wordDetail.nextWord} →
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
