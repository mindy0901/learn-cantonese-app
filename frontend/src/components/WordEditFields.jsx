import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../lib/cn.js";
import { useLocale } from "../store/localeStore.js";
import { vocabularyFieldSummary } from "../lib/wordDisplay.js";
import { normalizeSinoVietnameseValue } from "../lib/sinoVietnameseReadings.js";
import { emptyVocabulary } from "../types/word.js";
import { useHanCharacters } from "../store/appStore.js";
import { TagInput } from "./TagInput.jsx";
import { api } from "../lib/api.js";
import {
    IconStar,
    IconPlus,
    IconMinus,
    IconClose,
    IconSpeech,
    IconEdit,
    IconChevronDown,
    IconChevronRight,
} from "./NavIcons.jsx";
import { Spinner } from "./shadcn/spinner.jsx";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "./shadcn/card.jsx";
import { Button } from "./shadcn/button.jsx";
import { Input } from "./shadcn/input.jsx";
import { Textarea } from "./shadcn/textarea.jsx";

/** Capitalize only the first letter of the string */
function capitalizeFirst(value) {
    const s = (value ?? "").trim();
    if (!s) return s;
    return s.charAt(0).toLocaleUpperCase("vi") + s.slice(1);
}

/**
 * Resolve an example's giản/phồn han text. Prefers explicit hanSimplified/hanTraditional
 * fields; falls back to splitting the legacy single hanExample ("giản\nphồn").
 */
function exampleHanParts(ex) {
    const simp = (ex?.hanSimplified ?? "").trim();
    const trad = (ex?.hanTraditional ?? "").trim();
    if (simp || trad) return { hanSimplified: simp, hanTraditional: trad };
    const lines = String(ex?.hanExample ?? "")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
    return {
        hanSimplified: lines[0] ?? "",
        hanTraditional: lines[1] ?? "",
    };
}

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

export function buildVocabularyDraft(vocabulary) {
    if (!vocabulary?.id) return emptyVocabulary();
    // Chuẩn hóa mỗi entry về dạng typed (pinyin | jyutping) — 1 entry = 1 reading.
    const normalizeEntry = (r) => {
        const py = (r.pinyin ?? "").trim();
        const jp = (r.jyutping ?? "").trim();
        const type =
            r.type === "pinyin" || r.type === "jyutping"
                ? r.type
                : jp && !py
                  ? "jyutping"
                  : py && !jp
                    ? "pinyin"
                    : null;
        const meanings = r.meanings ?? [];
        if (type === "pinyin") {
            return { id: r.id, type, sinoVietnamese: r.sinoVietnamese ?? "", pinyin: py, jyutping: "", meanings };
        }
        if (type === "jyutping") {
            return { id: r.id, type, sinoVietnamese: r.sinoVietnamese ?? "", pinyin: "", jyutping: jp, meanings };
        }
        if (py && jp) {
            // Legacy entry có cả 2 phiên âm — tách thành 2 reading.
            return [
                {
                    id: undefined,
                    type: "pinyin",
                    sinoVietnamese: r.sinoVietnamese ?? "",
                    pinyin: py,
                    jyutping: "",
                    meanings,
                },
                {
                    id: undefined,
                    type: "jyutping",
                    sinoVietnamese: r.sinoVietnamese ?? "",
                    pinyin: "",
                    jyutping: jp,
                    meanings,
                },
            ];
        }
        return null;
    };
    const rawRoms =
        Array.isArray(vocabulary.romanization) && vocabulary.romanization.length > 0 ? vocabulary.romanization : null;
    const roms = rawRoms
        ? rawRoms.flatMap((r) => normalizeEntry(r) ?? [])
        : (() => {
              const out = [];
              const py = (vocabulary.pinyin ?? "").trim();
              const jp = (vocabulary.jyutping ?? "").trim();
              const sino = (vocabulary.sinoVietnamese ?? "").trim() || undefined;
              if (py) {
                  out.push({
                      id: undefined,
                      type: "pinyin",
                      sinoVietnamese: sino,
                      pinyin: py,
                      jyutping: "",
                      meanings: vocabulary.meanings ?? [],
                  });
              }
              if (jp) {
                  out.push({
                      id: undefined,
                      type: "jyutping",
                      sinoVietnamese: sino,
                      pinyin: "",
                      jyutping: jp,
                      meanings: vocabulary.meanings ?? [],
                  });
              }
              return out;
          })();
    return {
        ...vocabulary,
        romanization: roms,
        engMeanings: (vocabulary.engMeanings ?? "").trim() || vocabularyFieldSummary(vocabulary, "engMeanings"),
        engExamples: (vocabulary.engExamples ?? "").trim() || vocabularyFieldSummary(vocabulary, "engExamples"),
        vietMeanings: (vocabulary.vietMeanings ?? "").trim() || vocabularyFieldSummary(vocabulary, "vietMeanings"),
        vietExamples: (vocabulary.vietExamples ?? "").trim() || vocabularyFieldSummary(vocabulary, "vietExamples"),
        jyutping: (vocabulary.jyutping ?? "").trim().replace(/[,\s]+/g, " / "),
        pinyin: (vocabulary.pinyin ?? "").trim().replace(/[,\s]+/g, " / "),
        meanings: (() => {
            const structured = (vocabulary.meanings ?? []).map((m, i) => ({
                ...m,
                _tempId: m._tempId || m.id || crypto.randomUUID(),
                position: m.position ?? i,
                examples: (m.examples ?? []).map((ex, j) => ({
                    ...ex,
                    _tempId: ex._tempId || ex.id || crypto.randomUUID(),
                    position: ex.position ?? j,
                })),
            }));
            if (structured.length > 0) return structured;
            // Fallback: create a structured meaning from flat fields
            const viet = (vocabulary.vietMeanings ?? "").trim();
            const eng = (vocabulary.engMeanings ?? "").trim();
            if (!viet && !eng) return [];
            return [
                {
                    _tempId: crypto.randomUUID(),
                    category: "",
                    vietMeanings: viet,
                    engMeanings: eng,
                    position: 0,
                    examples: [],
                },
            ];
        })(),
    };
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

/** Build payload khi lưu (shape cũ, typed romanization array) — dùng để so sánh content trước khi save. */
export function vocabularyDraftPayloadLegacy(draft, { activePinyinId, activeJyutpingId } = {}) {
    const allRoms = Array.isArray(draft.romanization) ? draft.romanization : [];

    // Lọc meaning rỗng + chuẩn hóa (giữ id cũ, không sinh lại).
    const normalizeMeanings = (meanings) =>
        (meanings ?? [])
            .filter((m) => (m.vietMeanings ?? "").trim() || (m.engMeanings ?? "").trim())
            .map((m, i) => ({
                id: m.id,
                _tempId: m._tempId,
                category: capitalizeFirst((m.category ?? "").trim()),
                vietMeanings: capitalizeFirst((m.vietMeanings ?? "").trim()),
                engMeanings: capitalizeFirst((m.engMeanings ?? "").trim()),
                position: i,
                examples: (m.examples ?? [])
                    .filter((ex) => {
                        const parts = exampleHanParts(ex);
                        return parts.hanSimplified || parts.hanTraditional || (ex.vietExamples ?? "").trim();
                    })
                    .map((ex, j) => {
                        const parts = exampleHanParts(ex);
                        return {
                            id: ex.id,
                            _tempId: ex._tempId,
                            hanSimplified: parts.hanSimplified,
                            hanTraditional: parts.hanTraditional,
                            jyutpingExample: (ex.jyutpingExample ?? "").trim(),
                            pinyinExample: (ex.pinyinExample ?? "").trim(),
                            vietExamples: capitalizeFirst((ex.vietExamples ?? "").trim()),
                            engExamples: (ex.engExamples ?? "").trim(),
                            position: j,
                        };
                    }),
            }));

    // Build full `romanization` array từ draft entries (giữ nguyên id + type).
    const romanization = allRoms
        .map((r) => {
            const type = r.type === "jyutping" ? "jyutping" : "pinyin";
            return {
                id: r.id,
                type,
                sinoVietnamese: normalizeSinoVietnameseValue(r.sinoVietnamese) || "",
                pinyin: type === "pinyin" ? tagsToSpace(r.pinyin) : "",
                jyutping: type === "jyutping" ? tagsToSpace(r.jyutping) : "",
                meanings: normalizeMeanings(r.meanings),
            };
        })
        .filter((r) => (r.pinyin ?? "").trim() || (r.jyutping ?? "").trim());

    const pyEntries = romanization.filter((r) => r.type === "pinyin");
    const jpEntries = romanization.filter((r) => r.type === "jyutping");

    // Dedupe meanings theo id: 2 entry jyutping cùng mang bộ dict meanings (21)
    // → gộp flatMeanings + meanings_json chỉ còn 1 bản unique (tránh nhân đôi).
    const dedupeById = (items) => {
        const seen = new Set();
        const out = [];
        for (const m of items ?? []) {
            if (m?.id && seen.has(m.id)) continue;
            if (m?.id) seen.add(m.id);
            out.push(m);
        }
        return out;
    };

    // Flat columns: nối các reading cùng loại. Meanings flat ưu tiên jyutping (Cantonese).
    const jpMeanings = dedupeById(jpEntries.flatMap((r) => r.meanings));
    const pyMeanings = dedupeById(pyEntries.flatMap((r) => r.meanings));
    const primaryMeanings = jpMeanings.length > 0 ? jpMeanings : pyMeanings;
    const hasStructuredMeanings = primaryMeanings.length > 0;
    const firstMeaning = primaryMeanings[0];
    const derivedViet = firstMeaning?.vietMeanings?.trim() || "";
    const derivedEng = firstMeaning?.engMeanings?.trim() || "";

    const base = {
        engMeanings: capitalizeFirst(hasStructuredMeanings ? derivedEng : "") || undefined,
        hanTraditional: draft.hanTraditional.trim(),
        hanSimplified: draft.hanSimplified?.trim() || undefined,
        hanHongKong: draft.hanHongKong?.trim() || undefined,
        vietMeanings: capitalizeFirst(hasStructuredMeanings ? derivedViet : ""),
        vietExamples: draft.vietExamples?.trim() || undefined,
        sinoVietnamese: normalizeSinoVietnameseValue(draft.sinoVietnamese) || undefined,
        jyutping:
            jpEntries
                .map((r) => r.jyutping)
                .filter(Boolean)
                .join(" / ") || undefined,
        pinyin:
            pyEntries
                .map((r) => r.pinyin)
                .filter(Boolean)
                .join(" / ") || undefined,
        hskLevel: draft.hskLevel?.trim() || undefined,
        pureCantonese: Boolean(draft.pureCantonese),
        important: Boolean(draft.important),
        meanings: primaryMeanings,
    };

    return { ...base, romanization };
}

/**
 * Build payload model MỚI (2026-08-14) gửi API:
 *   { mandarin, cantonese, metadata } + flags (pureCantonese/important/mastered).
 * meaning dict (CC-Canto/words.hk/粵典–words.hk) → gloss vào `zh|yue`, `vi` trống;
 * meaning manual → `vi` = nghĩa tiếng Việt, `zh|yue` trống.
 */
const DICT_CATEGORIES = new Set(["CC-Canto", "words.hk", "粵典–words.hk"]);
const isDictCategory = (category) => DICT_CATEGORIES.has(String(category ?? "").trim());

function meaningsNewFromLegacy(meanings, side) {
    const hanField = side === "mandarin" ? "zh" : "yue";
    const romanField = side === "mandarin" ? "pinyinExample" : "jyutpingExample";
    return (meanings ?? [])
        .filter((m) => (m.vietMeanings ?? "").trim() || (m.engMeanings ?? "").trim())
        .map((m, i) => {
            const gloss = capitalizeFirst((m.vietMeanings ?? "").trim());
            const isDict = isDictCategory(m.category);
            return {
                id: m.id,
                position: i,
                category: capitalizeFirst((m.category ?? "").trim()),
                [hanField]: isDict ? gloss : "",
                vi: isDict ? "" : gloss,
                en: capitalizeFirst((m.engMeanings ?? "").trim()),
                examples: (m.examples ?? [])
                    .filter((ex) => {
                        const parts = exampleHanParts(ex);
                        return parts.hanSimplified || parts.hanTraditional || (ex.vietExamples ?? "").trim();
                    })
                    .map((ex, j) => {
                        const parts = exampleHanParts(ex);
                        return {
                            id: ex.id,
                            position: j,
                            [hanField]: side === "mandarin" ? parts.hanSimplified : parts.hanTraditional,
                            romanization: (ex[romanField] ?? "").trim(),
                            vi: capitalizeFirst((ex.vietExamples ?? "").trim()),
                            en: (ex.engExamples ?? "").trim(),
                        };
                    }),
            };
        });
}

export function vocabularyDraftPayload(draft, { activePinyinId, activeJyutpingId } = {}) {
    const allRoms = Array.isArray(draft.romanization) ? draft.romanization : [];
    const pyEntries = allRoms.filter((r) => r.type !== "jyutping").filter((r) => (r.pinyin ?? "").trim());
    const jpEntries = allRoms.filter((r) => r.type === "jyutping").filter((r) => (r.jyutping ?? "").trim());

    const buildBlock = (entries, side) => ({
        hanzi_simplified: draft.hanSimplified?.trim() || "",
        hanzi_traditional:
            side === "cantonese"
                ? draft.hanHongKong?.trim() || draft.hanTraditional.trim()
                : draft.hanTraditional.trim(),
        system: side === "mandarin" ? "pinyin" : "jyutping",
        readings: entries.map((r) => ({
            id: r.id,
            romanization: side === "mandarin" ? tagsToSpace(r.pinyin) : tagsToSpace(r.jyutping),
            sino_vietnamese: normalizeSinoVietnameseValue(r.sinoVietnamese) || "",
            meanings: meaningsNewFromLegacy(r.meanings, side),
        })),
    });

    return {
        mandarin: buildBlock(pyEntries, "mandarin"),
        cantonese: buildBlock(jpEntries, "cantonese"),
        metadata: {
            hsk_level: draft.hskLevel?.trim() || "",
            popularity: draft.popularity ?? draft.boost ?? null,
            frequency: draft.frequency ?? null,
            movie_word_rank: draft.movieWordRank ?? null,
            book_word_rank: draft.bookWordRank ?? null,
        },
        pureCantonese: Boolean(draft.pureCantonese),
        important: Boolean(draft.important),
        mastered: Boolean(draft.mastered),
    };
}

export function WordEditFields({ draft, onChange, validationError, showDetail = true }) {
    const { t } = useLocale();
    const hanCharacters = useHanCharacters();

    // Build lookup map once
    const lookupMap = buildCharLookupMap(hanCharacters);
    const hanValue = (draft.hanTraditional ?? "").trim();
    const charReadings = resolveCharReadings(hanValue, lookupMap);

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

    const hasHan = hanValue.length > 0;

    // When han changes, auto-fill jyutping/pinyin/sinoVietnamese
    // Quảng thuần → ghi vào hanSimplified, traditional rỗng
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
            return normalizeSinoVietnameseValue(r.sinoVietnameseOptions[0]) || "";
        });
        onChange({
            ...draft,
            hanTraditional: value,
            jyutping: jpParts.join(", "),
            pinyin: pyParts.join(", "),
            sinoVietnamese: hvParts.join(", "),
        });
    };

    // Sync on mount when han is pre-filled (e.g. from "add new word" flow)
    const syncedRef = useRef(false);
    useEffect(() => {
        if (!syncedRef.current && hasHan && !draft.jyutping?.trim() && !draft.sinoVietnamese?.trim()) {
            syncedRef.current = true;
            handleHanChange(hanValue);
        }
    }, [hasHan, hanValue, draft.jyutping, draft.sinoVietnamese, handleHanChange]);

    return (
        <div className="flex w-full min-w-0 flex-col gap-4 text-left">
            {/* 1. Chữ Hán — giản thể (trái) | phồn thể (phải) */}
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm font-medium text-foreground">
                    {t.wordBank.colHanSimplified}
                    <input
                        className="w-full px-2 py-4 font-semibold text-han-simp bg-transparent border-b-2 border-border outline-none transition-colors focus:border-primary/25"
                        style={{ fontSize: 40 }}
                        value={draft.hanSimplified ?? ""}
                        onChange={(e) => set("hanSimplified", e.target.value)}
                    />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium text-foreground">
                    {t.wordBank.colHanTraditional} *
                    <input
                        className="w-full px-2 py-4 font-semibold text-han-trad bg-transparent border-b-2 border-border outline-none transition-colors focus:border-primary/25"
                        style={{ fontSize: 40 }}
                        value={draft.hanTraditional}
                        onChange={(e) => handleHanChange(e.target.value)}
                    />
                </label>
            </div>

            {hasHan && (
                <>
                    {/* 2. Hán-Việt */}
                    <label className="flex flex-col gap-2 text-sm font-medium text-foreground">
                        {t.wordBank.colSinoVietnamese}
                        <TagInput
                            value={draft.sinoVietnamese ?? ""}
                            onChange={(v) => set("sinoVietnamese", normalizeSinoVietnameseValue(v))}
                            tagOptions={sinoVietnameseTagOptions}
                            onRemoveTag={handleRemoveTag}
                            allowEmpty
                        />
                    </label>

                    {/* 3. Jyutping */}
                    <label className="flex flex-col gap-2 text-sm font-medium text-foreground">
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
                    <label className="flex flex-col gap-2 text-sm font-medium text-foreground">
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

            <div className="flex items-center gap-4 pt-1">
                <button
                    type="button"
                    className={cn(
                        "inline-flex size-12 shrink-0 items-center justify-center rounded-[10px] border-2 border-border bg-card text-[1.625rem] leading-none text-muted-foreground transition-[border-color,color,background,box-shadow] duration-150",
                        "hover:border-primary/50 hover:text-primary hover:shadow-[0_0_0_3px_rgba(22,163,74,0.12)]",
                        draft.important &&
                            "border-primary bg-primary/14 text-primary shadow-[0_0_0_3px_rgba(22,163,74,0.16)]",
                    )}
                    onClick={() => set("important", !draft.important)}
                    aria-pressed={Boolean(draft.important)}
                    aria-label={draft.important ? t.wordBank.unmarkImportant : t.wordBank.markImportant}
                    title={draft.important ? t.wordBank.unmarkImportant : t.wordBank.markImportant}
                >
                    <IconStar size={24} />
                </button>
                <span className="text-[0.9375rem] font-medium text-foreground">{t.addWord.markImportant}</span>
            </div>
            {validationError && (
                <p
                    className="m-0 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-4 text-sm text-destructive"
                    role="alert"
                >
                    {validationError}
                </p>
            )}
        </div>
    );
}

export function MeaningsEditor({ meanings, onChange }) {
    const { t } = useLocale();
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
                <Button
                    type="button"
                    className="size-10 rounded-lg bg-primary text-primary-foreground border-primary hover:enabled:bg-primary/90 shadow-sm"
                    onClick={handleExpand}
                    title={t.addWord.addMeaningExample}
                >
                    <IconPlus size={22} />
                </Button>
            </div>
        );
    }

    return (
        <Card className="bg-background/50 border border-border">
            <CardHeader className="flex-row items-center gap-2">
                <CardTitle className="flex-1 text-center text-sm font-semibold text-foreground">
                    {t.addWord.detailedMeanings}
                </CardTitle>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => setExpanded(false)}
                    title={t.addWord.collapse}
                >
                    <IconMinus size={16} />
                </Button>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
                {localCategories.map((cat, i) => (
                    <CategoryCard
                        key={cat._tempId || i}
                        category={cat}
                        index={i}
                        onChange={(updated) => updateCategory(i, updated)}
                        onRemove={() => removeCategory(i)}
                    />
                ))}
                <Button
                    type="button"
                    className="self-start bg-primary text-primary-foreground border-primary hover:enabled:bg-primary/90"
                    onClick={addCategory}
                >
                    <IconPlus size={14} data-icon="inline-start" />
                    {t.addWord.addGroup}
                </Button>
            </CardContent>
        </Card>
    );
}

function CategoryCard({ category, index, onChange, onRemove }) {
    const { t } = useLocale();
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
        <Card className="bg-card shadow-sm ring-0 border border-border/60">
            <CardContent className="flex flex-col gap-4">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 mr-2">
                        <span className="text-sm font-semibold text-foreground shrink-0">{t.addWord.group}</span>
                        <Input
                            className="flex-1 min-w-0 max-w-48 text-sm font-semibold text-foreground"
                            value={category.name ?? ""}
                            onChange={(e) => onChange({ name: e.target.value })}
                        />
                    </div>
                    <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="self-start"
                        onClick={onRemove}
                        title={t.addWord.deleteGroup}
                    >
                        <IconClose size={14} data-icon="inline-start" />
                        {category.name
                            ? t.addWord.deleteGroupWithName.replace("{name}", category.name)
                            : t.addWord.deleteGroup}
                    </Button>
                </div>
                {/* Meanings in this category */}
                <div className="flex flex-col gap-4">
                    {(category.meanings ?? []).map((m, j) => (
                        <MeaningCard
                            key={m._tempId || j}
                            meaning={m}
                            index={j}
                            onChange={(updated) => updateMeaning(j, updated)}
                            onRemove={() => removeMeaning(j)}
                        />
                    ))}
                    <Button
                        type="button"
                        className="self-start bg-primary text-primary-foreground border-primary hover:enabled:bg-primary/90"
                        onClick={addMeaning}
                    >
                        <IconPlus size={14} data-icon="inline-start" />
                        {t.addWord.addMeaning}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

/**
 * Format pasted Hanzii example text into simplified (line 1) + traditional (line 2).
 *  - Hanzii: "我的爸爸是一名消防员。【我的爸爸是一名消防員。】"
 *    → "我的爸爸是一名消防员。\n我的爸爸是一名消防員。" (keeps punctuation as-is)
 *  - Already two-line: normalized (empty lines dropped).
 *  - Single line without brackets: returned trimmed.
 */
/**
 * Normalize meaning/example separators to commas on sync:
 * "1, số 1; một; số một." → "1, số 1, một, số một."
 * Converts semicolons (; ；) and CJK enumeration comma (、) to ASCII comma and
 * normalizes spacing around commas. Keeps the sentence-final period.
 */
function normalizeGlossSeparators(value) {
    return String(value ?? "")
        .replace(/[;；、]/g, ",")
        .replace(/\s*,\s*/g, ", ")
        .replace(/\s{2,}/g, " ")
        .trim();
}

/** Same as normalizeGlossSeparators but drops the trailing sentence period — meanings only. */
function normalizeMeaningSeparators(value) {
    return normalizeGlossSeparators(value)
        .replace(/[.。]+$/u, "")
        .trim();
}

// Meaning sau sync LUÔN lowercase (áp dụng cả vi & en).
function normalizeMeaningSync(value) {
    return normalizeMeaningSeparators(value).toLowerCase();
}

function formatExampleHanText(text) {
    const raw = (text ?? "").trim();
    if (!raw) return "";

    const lines = raw
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
    if (lines.length >= 2) return lines.join("\n");

    const tradMatch = raw.match(/【([^】]*)】/);
    const trad = tradMatch ? tradMatch[1].trim() : "";
    const simp = raw.replace(/【[^】]*】/g, "").trim();

    if (simp && trad) return `${simp}\n${trad}`;
    return simp || trad || raw;
}

// Font Hán cố định — PHẢI khớp giữa textarea (chữ vô hình) và backdrop (chữ màu).
// Nếu 2 lớp lệch font/size/line-height, khi bôi đen text sẽ thấy "bóng mờ" text
// to hơn (do vùng selection tính theo metrics của textarea ≠ glyph backdrop).
const HAN_EXAMPLE_FONT =
    '"Noto Sans TC Variable", "Noto Sans SC Variable", "Microsoft JhengHei", "PingFang HK", sans-serif';

/**
 * Editable single han line (giản hoặc phồn) — color giống detail (text-foreground).
 * Overlay: pointer-events-none backdrop draws the text while the real <textarea>
 * on top stays editable (transparent text + visible caret). Both layers share the
 * same font/size/line-height so text selection has no "ghost", and the han glyphs
 * keep the fixed Noto font (matching the app's han display).
 */
function HanLineTextarea({ value, onChange, rows = 2, className }) {
    const text = value ?? "";

    return (
        <div className={cn("relative", className)}>
            <Textarea
                style={{
                    fontFamily: HAN_EXAMPLE_FONT,
                    fontSize: "0.9375rem",
                    lineHeight: 1.5,
                    minHeight: "2.5rem",
                }}
                className="resize-none bg-transparent text-transparent caret-primary"
                rows={rows}
                value={value}
                onChange={(e) => onChange(e.target.value)}
            />
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 z-10 overflow-hidden whitespace-pre-wrap wrap-break-word px-2.5 py-2 text-[0.9375rem] leading-normal text-foreground"
            >
                {text}
            </div>
        </div>
    );
}

function MeaningCard({ meaning, index, onChange, onRemove }) {
    const { t } = useLocale();
    const [convertingJpPy, setConvertingJpPy] = useState(null);
    const [showExamples, setShowExamples] = useState(true); // examples expanded by default
    const [syncingMeaning, setSyncingMeaning] = useState(false);
    const [syncingExample, setSyncingExample] = useState(null); // exIdx being synced

    // Sync the empty side from the filled one (vi <-> en) via the translate pipeline.
    const viet = (meaning.vietMeanings ?? "").trim();
    const eng = (meaning.engMeanings ?? "").trim();
    const canSync = Boolean(viet) !== Boolean(eng);
    const handleSyncMeaning = async () => {
        if (!canSync) return;
        setSyncingMeaning(true);
        try {
            const source = viet ? "vi" : "en";
            const target = viet ? "en" : "vi";
            // Chuẩn hóa dấu tách (; 、…) về phẩy cho cả phía đã có và phía vừa dịch.
            // Meaning sau sync LUÔN lowercase (cả vi & en), không giữ dấu chấm cuối câu.
            const patch = viet
                ? { vietMeanings: normalizeMeaningSync(meaning.vietMeanings ?? "") }
                : { engMeanings: normalizeMeaningSync(meaning.engMeanings ?? "") };
            const res = await api.translate(viet || eng, source, target);
            const translated = normalizeMeaningSync(res?.translated ?? "");
            if (translated) {
                if (viet) patch.engMeanings = translated;
                else patch.vietMeanings = translated;
            }
            onChange(patch);
        } catch {
            // Vẫn chuẩn hóa phía đã có nếu dịch lỗi.
            if (viet) onChange({ vietMeanings: normalizeMeaningSync(meaning.vietMeanings ?? "") });
            else onChange({ engMeanings: normalizeMeaningSync(meaning.engMeanings ?? "") });
        } finally {
            setSyncingMeaning(false);
        }
    };

    const addExample = () => {
        const nextExamples = [
            ...(meaning.examples ?? []),
            {
                _tempId: crypto.randomUUID(),
                hanSimplified: "",
                hanTraditional: "",
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

    // Update one line (0 = giản, 1 = phồn) of the han example.
    const updateHanLine = (exIdx, lineIdx, lineValue) => {
        const ex = (meaning.examples ?? [])[exIdx];
        const parts = exampleHanParts(ex);
        const g = lineIdx === 0 ? (lineValue ?? "").trim() : parts.hanSimplified;
        const p = lineIdx === 1 ? (lineValue ?? "").trim() : parts.hanTraditional;
        updateExample(exIdx, { hanSimplified: g, hanTraditional: p });
    };

    // Format the copied han example (Hanzii 【...】) into giản + phồn.
    // Hoạt động dù text paste nằm ở field giản hay phồn.
    const handleFormatExample = (exIdx) => {
        const ex = (meaning.examples ?? [])[exIdx];
        const parts = exampleHanParts(ex);
        const raw = [parts.hanSimplified, parts.hanTraditional].filter(Boolean).join("\n");
        const source = parts.hanSimplified.includes("【")
            ? parts.hanSimplified
            : parts.hanTraditional.includes("【")
              ? parts.hanTraditional
              : raw;
        const formatted = formatExampleHanText(source);
        const fl = formatted.split("\n");
        const newG = fl[0] ?? "";
        const newP = fl[1] ?? "";
        if (newG !== parts.hanSimplified || newP !== parts.hanTraditional) {
            updateExample(exIdx, { hanSimplified: newG, hanTraditional: newP });
        }
    };

    const handleConvertBoth = async (exIdx) => {
        const ex = (meaning.examples ?? [])[exIdx];
        const parts = exampleHanParts(ex);
        const trimmed = [parts.hanSimplified, parts.hanTraditional].filter(Boolean).join("\n");
        if (!trimmed) return;
        setConvertingJpPy(exIdx);
        try {
            // Prefer the formatted two-line shape: line 1 = simplified, line 2 = traditional.
            const lines = trimmed
                .split("\n")
                .map((l) => l.trim())
                .filter(Boolean);
            let tradSource = "";
            let simpSource = "";
            if (lines.length >= 2) {
                simpSource = lines[0];
                tradSource = lines[1];
            } else {
                // Legacy Hanzii format 【...】:
                const tradMatch = trimmed.match(/【(.+?)】/);
                tradSource = tradMatch ? tradMatch[1].trim() : trimmed;
                const simpMatch = trimmed.match(/^(.+?)【/);
                simpSource = simpMatch ? simpMatch[1].trim() : trimmed;
            }

            // Sinh pinyin từ GIẢN THỂ, jyutping từ PHỒN THỂ (quy ước mặc định).
            const jyutpingSource = tradSource;
            const [jpRes, pyRes] = await Promise.all([
                jyutpingSource ? api.toJyutping(jyutpingSource) : Promise.resolve(null),
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

    // Sync the empty side of a single example (vi <-> en) via the translate pipeline.
    const handleSyncExample = async (exIdx) => {
        const ex = (meaning.examples ?? [])[exIdx];
        const exViet = (ex?.vietExamples ?? "").trim();
        const exEng = (ex?.engExamples ?? "").trim();
        if ((!exViet && !exEng) || (exViet && exEng)) return; // nothing to fill
        setSyncingExample(exIdx);
        try {
            const source = exViet ? "vi" : "en";
            const target = exViet ? "en" : "vi";
            const patch = exViet
                ? { vietExamples: normalizeGlossSeparators(ex?.vietExamples ?? "") }
                : { engExamples: normalizeGlossSeparators(ex?.engExamples ?? "") };
            const res = await api.translate(exViet || exEng, source, target);
            const translated = normalizeGlossSeparators(res?.translated ?? "");
            if (translated) {
                if (exViet) patch.engExamples = translated;
                else patch.vietExamples = translated;
            }
            updateExample(exIdx, patch);
        } catch {
            if (exViet) updateExample(exIdx, { vietExamples: normalizeGlossSeparators(ex?.vietExamples ?? "") });
            else updateExample(exIdx, { engExamples: normalizeGlossSeparators(ex?.engExamples ?? "") });
        } finally {
            setSyncingExample(null);
        }
    };

    return (
        <Card className="bg-card shadow-sm border border-border">
            <CardHeader className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-primary-foreground">{index + 1}.</CardTitle>
                <CardAction>
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            size="xs"
                            className="bg-primary text-primary-foreground border-primary hover:enabled:bg-primary/90"
                            onClick={handleSyncMeaning}
                            disabled={!canSync || syncingMeaning}
                            title={t.addWord.syncMeaningHint}
                        >
                            {syncingMeaning ? <Spinner className="size-3.5" /> : <IconSpeech size={14} />}
                            {t.addWord.syncMeaning}
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={onRemove}
                            title={t.addWord.deleteMeaning}
                        >
                            <IconClose size={14} data-icon="inline-start" />
                            {t.addWord.deleteMeaning}
                        </Button>
                    </div>
                </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
                {/* Line 1: Vietnamese meaning */}
                <label className="flex flex-col gap-0.5 mb-2">
                    <span className="text-sm text-primary-foreground font-semibold">{t.addWord.vietnameseMeaning}</span>
                    <Textarea
                        className="text-foreground font-medium"
                        rows={2}
                        value={meaning.vietMeanings ?? ""}
                        onChange={(e) => onChange({ vietMeanings: e.target.value })}
                    />
                </label>
                {/* Line 2: English meaning (replaces Chinese definition) */}
                <label className="flex flex-col gap-0.5 mb-2">
                    <span className="text-sm text-primary-foreground font-semibold">{t.addWord.englishMeaning}</span>
                    <Textarea
                        className="text-foreground"
                        rows={2}
                        value={meaning.engMeanings ?? ""}
                        onChange={(e) => onChange({ engMeanings: e.target.value })}
                    />
                </label>

                {/* Examples for this meaning */}
                <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                        <Button
                            type="button"
                            size="sm"
                            className="bg-primary text-primary-foreground border-primary hover:enabled:bg-primary/90"
                            onClick={() => {
                                if (!showExamples) setShowExamples(true);
                                addExample();
                            }}
                        >
                            <IconPlus size={10} data-icon="inline-start" />
                            {t.addWord.addExample}
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            className="bg-primary text-primary-foreground border-primary hover:enabled:bg-primary/90"
                            onClick={() => setShowExamples((v) => !v)}
                        >
                            {showExamples ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
                            {(meaning.examples ?? []).length > 0
                                ? t.addWord.examplesWithCount.replace("{count}", (meaning.examples ?? []).length)
                                : t.addWord.examples}
                        </Button>
                    </div>
                    {showExamples && (
                        <>
                            {(meaning.examples ?? []).map((ex, j) => {
                                const hanParts = exampleHanParts(ex);
                                const hasHan = Boolean(hanParts.hanSimplified || hanParts.hanTraditional);
                                return (
                                    <Card
                                        key={ex._tempId || j}
                                        className="rounded-lg border border-border/70 bg-background p-4 shadow-none ring-0"
                                    >
                                        <CardHeader className="flex items-center justify-between">
                                            <CardTitle className="text-sm text-primary-foreground font-semibold">
                                                {t.addWord.example.replace("{index}", j + 1)}
                                            </CardTitle>
                                            <CardAction>
                                                <div className="flex flex-wrap items-center justify-end gap-2">
                                                    <Button
                                                        type="button"
                                                        size="xs"
                                                        className={cn(
                                                            hasHan
                                                                ? "bg-primary text-primary-foreground border-primary hover:enabled:bg-primary/90"
                                                                : "bg-primary/50 text-primary-foreground/60 border-primary/50",
                                                        )}
                                                        onClick={() => handleFormatExample(j)}
                                                        disabled={!hasHan}
                                                        title={t.addWord.formatExampleHint}
                                                    >
                                                        <IconEdit size={14} />
                                                        {t.addWord.formatExample}
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        size="xs"
                                                        className={cn(
                                                            hasHan
                                                                ? "bg-primary text-primary-foreground border-primary hover:enabled:bg-primary/90"
                                                                : "bg-primary/50 text-primary-foreground/60 border-primary/50",
                                                        )}
                                                        onClick={() => handleConvertBoth(j)}
                                                        disabled={convertingJpPy === j || !hasHan}
                                                        title={t.addWord.generateReadings}
                                                    >
                                                        {convertingJpPy === j ? (
                                                            <Spinner className="size-3.5" />
                                                        ) : (
                                                            <IconSpeech size={14} />
                                                        )}
                                                        {t.addWord.generateBoth}
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        size="xs"
                                                        className="bg-primary text-primary-foreground border-primary hover:enabled:bg-primary/90"
                                                        onClick={() => handleSyncExample(j)}
                                                        disabled={
                                                            syncingExample === j ||
                                                            Boolean((ex.vietExamples ?? "").trim()) ===
                                                                Boolean((ex.engExamples ?? "").trim())
                                                        }
                                                        title={t.addWord.syncExampleHint}
                                                    >
                                                        {syncingExample === j ? (
                                                            <Spinner className="size-3.5" />
                                                        ) : (
                                                            <IconSpeech size={14} />
                                                        )}
                                                        {t.addWord.syncExample}
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="destructive"
                                                        size="sm"
                                                        onClick={() => removeExample(j)}
                                                        title={t.addWord.deleteExample}
                                                    >
                                                        <IconClose size={14} data-icon="inline-start" />
                                                        {t.addWord.deleteExample}
                                                    </Button>
                                                </div>
                                            </CardAction>
                                        </CardHeader>
                                        <CardContent className="flex flex-col gap-2">
                                            <div className="flex flex-col gap-2 mb-2">
                                                <label className="flex flex-col gap-0.5">
                                                    <span className="text-sm text-primary-foreground font-semibold">
                                                        {t.addWord.simplified}
                                                    </span>
                                                    <HanLineTextarea
                                                        rows={1}
                                                        value={hanParts.hanSimplified}
                                                        onChange={(v) => updateHanLine(j, 0, v)}
                                                    />
                                                </label>
                                                <label className="flex flex-col gap-0.5">
                                                    <span className="text-sm text-primary-foreground font-semibold">
                                                        {t.addWord.traditional}
                                                    </span>
                                                    <HanLineTextarea
                                                        rows={1}
                                                        value={hanParts.hanTraditional}
                                                        onChange={(v) => updateHanLine(j, 1, v)}
                                                    />
                                                </label>
                                            </div>
                                            <label className="flex flex-col gap-0.5 mb-2">
                                                <span className="text-sm text-primary-foreground font-semibold">
                                                    {t.addWord.pinyin}
                                                </span>
                                                <Input
                                                    className="text-primary-foreground text-sm"
                                                    value={ex.pinyinExample ?? ""}
                                                    onChange={(e) =>
                                                        updateExample(j, { pinyinExample: e.target.value })
                                                    }
                                                />
                                            </label>
                                            <label className="flex flex-col gap-0.5 mb-2">
                                                <span className="text-sm text-primary-foreground font-semibold">
                                                    {t.addWord.jyutping}
                                                </span>
                                                <Input
                                                    className="text-primary-foreground text-sm"
                                                    value={ex.jyutpingExample ?? ""}
                                                    onChange={(e) =>
                                                        updateExample(j, { jyutpingExample: e.target.value })
                                                    }
                                                />
                                            </label>
                                            <label className="flex flex-col gap-0.5 mb-2">
                                                <span className="text-sm text-primary-foreground font-semibold">
                                                    {t.addWord.vietnamese}
                                                </span>
                                                <Input
                                                    className="text-primary-foreground text-sm"
                                                    value={ex.vietExamples ?? ""}
                                                    onChange={(e) => updateExample(j, { vietExamples: e.target.value })}
                                                />
                                            </label>
                                            <label className="flex flex-col gap-0.5">
                                                <span className="text-sm text-primary-foreground font-semibold">
                                                    {t.addWord.english}
                                                </span>
                                                <Input
                                                    className="text-primary-foreground text-sm"
                                                    value={ex.engExamples ?? ""}
                                                    onChange={(e) => updateExample(j, { engExamples: e.target.value })}
                                                />
                                            </label>
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
