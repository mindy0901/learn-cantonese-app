import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { cn } from "../lib/cn.js";
import { useLocale } from "../store/localeStore.js";
import { vocabularyFieldSummary } from "../lib/wordDisplay.js";
import { normalizeSinoVietnameseValue } from "../lib/sinoVietnameseReadings.js";
import { capitalizeSentences } from "../lib/wordNormalize.js";
import { emptyVocabulary } from "../types/word.js";
import { useMandarinVocabularies, useCantoneseVocabularies } from "../store/appStore.js";
import { TagInput } from "./TagInput.jsx";
import { MeaningExamples } from "./MeaningExamples.jsx";
import { api } from "../lib/api.js";
import { IconPlus, IconClose, IconChevronDown } from "./NavIcons.jsx";
import { Heart } from "lucide-react";
import { Spinner } from "./shadcn/spinner.jsx";
import { Card, CardContent, CardHeader, CardTitle } from "./shadcn/card.jsx";
import { Badge } from "./shadcn/badge.jsx";
import { Button } from "./shadcn/button.jsx";
import { Input } from "./shadcn/input.jsx";
import { Textarea } from "./shadcn/textarea.jsx";
import { Separator } from "./shadcn/separator.jsx";
import { Checkbox } from "./shadcn/checkbox.jsx";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "./shadcn/select.jsx";

/** Capitalize only the first letter of the string */
function capitalizeFirst(value) {
    const s = (value ?? "").trim();
    if (!s) return s;
    return s.charAt(0).toLocaleUpperCase("vi") + s.slice(1);
}

/** Split chuỗi Hanzii "giản【phồn】" thành 2 phần giản thể + phồn thể. */
export function splitHanBracketed(value) {
    const s = String(value ?? "").trim();
    const m = s.match(/^([^【]*)(?:【([^】]*)】)?[\s\S]*$/);
    return {
        hanSimplified: (m?.[1] ?? "").trim(),
        hanTraditional: (m?.[2] ?? "").trim(),
    };
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

/** Build a lookup map: character → readings (pinyin/jyutping/sino) từ vocab banks' hanCharacters JSONB. */
function buildCharLookupMap(vocabularies) {
    const map = new Map();
    const push = (char, entry) => {
        if (!char) return;
        if (!map.has(char)) map.set(char, []);
        const arr = map.get(char);
        if (!arr.some((e) => e.key === entry.key)) arr.push(entry);
    };
    for (const v of vocabularies || []) {
        for (const item of v.hanCharacters || []) {
            const simp = (item.hanSimplified ?? "").trim();
            const trad = (item.hanTraditional ?? "").trim();
            const entry = {
                key: `${simp}|${trad}`,
                jyutping: item.jyutping ? [String(item.jyutping).trim()] : [],
                pinyin: item.pinyin ? [String(item.pinyin).trim()] : [],
                sinoVietnamese: item.sinoVietnamese ? [String(item.sinoVietnamese).trim()] : [],
            };
            push(simp, entry);
            if (trad && trad !== simp) push(trad, entry);
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

export function buildVocabularyDraft(vocabulary, { seedEmptyReadings = true } = {}) {
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
    let roms = rawRoms
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
    // Vocab không có reading nào (từ mới/trống) → seed 2 reading rỗng (pinyin + jyutping)
    // để form edit hiện đủ field (hán, phiên âm, nghĩa). Empty reading bị lọc khi lưu
    // (vocabularyDraftPayload/Legacy filter theo pinyin/jyutping) nên không tạo data thừa.
    // ⚠️ 2026-08-21: Add mode (seedEmptyReadings=false) KHÔNG seed — modal mở ra chỉ có nút
    // "+ Add Sino-Vietnamese & Jyutping Pair" để tự thêm reading.
    if (roms.length === 0 && seedEmptyReadings) {
        const tempId = () =>
            typeof crypto !== "undefined" && crypto.randomUUID
                ? crypto.randomUUID()
                : `new-${Date.now()}-${Math.random()}`;
        roms = [
            {
                id: undefined,
                _tempId: tempId(),
                type: "pinyin",
                sinoVietnamese: "",
                pinyin: "",
                jyutping: "",
                meanings: [],
            },
            {
                id: undefined,
                _tempId: tempId(),
                type: "jyutping",
                sinoVietnamese: "",
                pinyin: "",
                jyutping: "",
                meanings: [],
            },
        ];
    }
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
            .filter((m) => (m.gloss ?? "").trim() || (m.vietMeanings ?? "").trim() || (m.engMeanings ?? "").trim())
            .map((m, i) => ({
                id: m.id,
                _tempId: m._tempId,
                gloss: capitalizeFirst((m.gloss ?? "").trim()),
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
        popularityLevel: draft.popularityLevel ?? undefined,
        pureCantonese: Boolean(draft.pureCantonese),
        favorite: Boolean(draft.favorite),
        meanings: primaryMeanings,
    };

    return { ...base, romanization };
}

/**
 * Build payload model MỚI (2026-08-14) gửi API:
 *   { mandarin, cantonese, metadata } + flags (pureCantonese/favorite/mastered).
 * ⚠️ 2026-08-30: bỏ group/category — meaning phẳng, gloss → zh|yue, vi = nghĩa Việt.
 */
function meaningsNewFromLegacy(meanings, side) {
    const hanField = side === "mandarin" ? "zh" : "yue";
    const romanField = side === "mandarin" ? "pinyinExample" : "jyutpingExample";
    return (meanings ?? [])
        .filter((m) => (m.gloss ?? "").trim() || (m.vietMeanings ?? "").trim() || (m.engMeanings ?? "").trim())
        .map((m, i) => {
            const gloss = capitalizeFirst((m.gloss ?? "").trim());
            const viet = capitalizeFirst((m.vietMeanings ?? "").trim());
            return {
                id: m.id,
                position: i,
                [hanField]: gloss,
                vi: viet,
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
                            // ⚠️ 2026-08-23: cantonese fallback hanSimplified khi hanTraditional rỗng (giản==phồn,
                            // ex.zh không có 【】) — trước chỉ đọc hanTraditional → MẤT yue.
                            [hanField]:
                                side === "mandarin" ? parts.hanSimplified : parts.hanTraditional || parts.hanSimplified,
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
        favorite: Boolean(draft.favorite),
        mastered: Boolean(draft.mastered),
    };
}

export function VocabularyEditFields({ draft, onChange, validationError, showDetail = true }) {
    const { t } = useLocale();
    const mandarinVocabularies = useMandarinVocabularies();
    const cantoneseVocabularies = useCantoneseVocabularies();

    // Build lookup map once từ vocab banks (hanCharacters JSONB per-vocab).
    const lookupMap = buildCharLookupMap([...mandarinVocabularies, ...cantoneseVocabularies]);
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
                        // ⚠️ 2026-09-27: ❤️ yêu thích = ĐỎ (`favorite` token) — không dùng primary (xanh).
                        "hover:border-favorite/50 hover:text-favorite hover:shadow-[0_0_0_3px_rgba(220,38,38,0.12)]",
                        draft.favorite &&
                            "border-favorite bg-favorite/14 text-favorite shadow-[0_0_0_3px_rgba(220,38,38,0.16)]",
                    )}
                    onClick={() => set("favorite", !draft.favorite)}
                    aria-pressed={Boolean(draft.favorite)}
                    aria-label={draft.favorite ? t.wordBank.unmarkFavorite : t.wordBank.markFavorite}
                    title={draft.favorite ? t.wordBank.unmarkFavorite : t.wordBank.markFavorite}
                >
                    <Heart size={24} className={draft.favorite ? "fill-current" : undefined} />
                </button>
                <span className="text-[0.9375rem] font-medium text-foreground">{t.addWord.markFavorite}</span>
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

export const MeaningsEditor = forwardRef(function MeaningsEditor(
    { meanings, onChange, flat = false, column, hasReading = true },
    ref,
) {
    const { t } = useLocale();
    const [expanded, setExpanded] = useState((meanings ?? []).length > 0);
    const skipSyncRef = useRef(false);
    const prevMeaningsRef = useRef(meanings);

    // Build initial categories from props
    const [localMeanings, setLocalMeanings] = useState(() => (meanings ?? []).map((m, i) => ({ ...m, position: i })));

    // Only sync from props when structure changes externally (not from our own flush)
    useEffect(() => {
        if (skipSyncRef.current) {
            skipSyncRef.current = false;
            return;
        }
        if (meanings !== prevMeaningsRef.current) {
            prevMeaningsRef.current = meanings;
            if ((meanings ?? []).length > 0 || localMeanings.length === 0) {
                setLocalMeanings((meanings ?? []).map((m, i) => ({ ...m, position: i })));
            }
            // Tự mở editor khi có meanings mới từ ngoài (vd scrap Hanzii): trước đó collapsed
            // vì meanings rỗng lúc mount — giờ có dữ liệu phải hiện ra ngay, không cần đổi tab.
            if ((meanings ?? []).length > 0) {
                setExpanded((prev) => prev || true);
            }
        }
    }, [meanings]);

    const flushToParent = (list) => {
        const flat = (list ?? []).map((m, pos) => ({ ...m, position: pos }));
        skipSyncRef.current = true;
        onChange(flat);
    };

    // ── Di chuyển examples sang meaning khác (2026-08-22) ──
    const [selectedEx, setSelectedEx] = useState(new Map()); // key (id/_tempId) → mIdx
    const [moveTarget, setMoveTarget] = useState("");
    const toggleSelectExample = (ex, mIdx) => {
        const key = ex?._tempId || ex?.id;
        if (!key) return;
        setSelectedEx((prev) => {
            const next = new Map(prev);
            if (next.has(key)) next.delete(key);
            else next.set(key, mIdx);
            return next;
        });
    };
    const clearSelection = () => setSelectedEx(new Map());
    const moveSelectedExamples = () => {
        if (!moveTarget || selectedEx.size === 0) return;
        const tM = Number(moveTarget);
        if (!Number.isInteger(tM)) return;
        const next = localMeanings.map((m) => ({ ...m, examples: [...(m.examples ?? [])] }));
        const moved = [];
        for (const [key, mIdx] of selectedEx) {
            const src = next[mIdx];
            if (!src) continue;
            const idx = (src.examples ?? []).findIndex((e) => (e?._tempId || e?.id) === key);
            if (idx === -1) continue;
            moved.push(src.examples[idx]);
            src.examples.splice(idx, 1);
        }
        const target = next[tM];
        if (target && moved.length) target.examples = [...(target.examples ?? []), ...moved];
        setLocalMeanings(next);
        flushToParent(next);
        setSelectedEx(new Map());
        setMoveTarget("");
    };
    const selectedExKeys = new Set(selectedEx.keys());
    // Tổng examples + số đã chọn (floating quick-move bar) (2026-08-22)
    const totalExamples = localMeanings.reduce((acc, m) => acc + (m.examples ?? []).length, 0);
    const selectedCount = selectedEx.size;
    // Select-all CHO TỪNG MEANING — checkbox nằm trong header examples của meaning (2026-08-22)
    const toggleSelectAllInMeaning = (mIdx) => {
        const meaning = localMeanings[mIdx];
        const keys = (meaning?.examples ?? []).map((ex) => ex?._tempId || ex?.id).filter(Boolean);
        if (!keys.length) return;
        setSelectedEx((prev) => {
            const next = new Map(prev);
            const allSelected = keys.every((k) => next.has(k));
            for (const k of keys) {
                if (allSelected) next.delete(k);
                else next.set(k, mIdx);
            }
            return next;
        });
    };
    // Loại trừ meaning nguồn của examples đang chọn khỏi target options.
    const sourceMeaningKeys = new Set(selectedEx.values());
    const moveTargetOptions = localMeanings
        .map((m, mi) => {
            const preview = (m.vietMeanings ?? "").trim() || (m.engMeanings ?? "").trim();
            return {
                key: String(mi),
                label: preview ? (preview.length > 40 ? `${preview.slice(0, 40)}…` : preview) : "Nghĩa",
            };
        })
        .filter((o) => !sourceMeaningKeys.has(Number(o.key)));
    // Mô tả ngắn cho floating bar — chỉ "Di chuyển N ví dụ đến" (đích hiển thị trong Select) (2026-08-22)
    const moveDesc =
        t.addWord?.moveTo?.replace("{count}", String(selectedCount)) ?? `Di chuyển ${selectedCount} ví dụ đến`;

    const addMeaning = () => {
        // ⚠️ 2026-08-21: không cho thêm meaning khi chưa có reading (sino-romanization group).
        if (!hasReading) return;
        if (!expanded) setExpanded(true);
        const next = [
            ...localMeanings,
            {
                _tempId: crypto.randomUUID(),
                vietMeanings: "",
                engMeanings: "",
                examples: [],
            },
        ];
        setLocalMeanings(next);
        flushToParent(next);
    };

    const [syncingAllViEn, setSyncingAllViEn] = useState(false);

    // Liệt kê các cặp nghĩa Việt↔Anh (meaning + ví dụ) còn thiếu 1 chiều cần sync.
    // ⚠️ 2026-08-21: thêm job fill pinyin-pro cho VÍ DỤ thiếu pinyin (chỉ column pinyin — mandarin).
    const buildJobs = () => {
        const jobs = [];
        localMeanings.forEach((m, mIdx) => {
            const mv = (m.vietMeanings ?? "").trim();
            const me = (m.engMeanings ?? "").trim();
            const mg = (m.gloss ?? "").trim();
            // Việt↔Anh lệch 1 chiều, HOẶC gloss zh (CHỈ mandarin) trống nhưng có eng/việt làm nguồn.
            // ⚠️ 2026-08-22: cantonese KHÔNG còn gloss (bỏ yue) → không tạo job fill gloss.
            if (Boolean(mv) !== Boolean(me) || (column === "pinyin" && !mg && (me || mv)))
                jobs.push({ mIdx, exIdx: null, mv, me, mg });
            (m.examples ?? []).forEach((ex, exIdx) => {
                const ev = (ex.vietExamples ?? "").trim();
                const ee = (ex.engExamples ?? "").trim();
                if ((ev || ee) && Boolean(ev) !== Boolean(ee)) jobs.push({ mIdx, exIdx, ev, ee });
                // Ví dụ thiếu pinyin (có chữ Hán) → fill pinyin-pro (chỉ mandarin).
                if (column === "pinyin") {
                    const exHan = (ex.hanSimplified ?? "").trim() || (ex.hanTraditional ?? "").trim();
                    if (!(ex.pinyinExample ?? "").trim() && exHan) jobs.push({ mIdx, exIdx, fillPinyin: true, exHan });
                }
            });
        });
        return jobs;
    };
    // Có mục nào cần sync không? (dùng để chờ editor nhận đủ dữ liệu trước khi sync)
    const hasSyncJobs = () => buildJobs().length > 0;
    // Số job hiện tại — dùng để chờ số job ỔN ĐỊNH (meanings đã propagate đầy đủ xuống editor)
    // trước khi chạy sync, tránh miss ô do chạy trên state chưa đủ.
    const getSyncJobCount = () => buildJobs().length;

    // Footer "Đồng bộ nghĩa Việt - Anh" (VocabularyDetailContent) gọi qua ref — 1 click sync TẤT CẢ
    // nghĩa Việt↔Anh của mọi meaning + ví dụ trong editor này (chỉ điền phía còn trống).
    const syncAllViEn = async (onProgress) => {
        if (syncingAllViEn) return 0;
        const jobs = buildJobs();
        if (!jobs.length) {
            onProgress?.(0, 0);
            return 0;
        }
        setSyncingAllViEn(true);
        try {
            // Deep copy meanings để áp patch, rồi flush 1 lần cuối (tránh nhiều onChange).
            const next = localMeanings.map((m) => ({
                ...m,
                examples: (m.examples ?? []).map((e) => ({ ...e })),
            }));
            let done = 0;
            let synced = 0;
            const runJob = async (job) => {
                try {
                    if (job.fillPinyin) {
                        // Ví dụ thiếu pinyin → fill pinyin-pro từ chữ Hán giản thể (mandarin).
                        const ex = next[job.mIdx].examples[job.exIdx];
                        const res = await api.toPinyin(job.exHan);
                        if (res?.pinyin) ex.pinyinExample = res.pinyin;
                    } else if (job.exIdx === null) {
                        const m = next[job.mIdx];
                        // 1) Điền chiều Việt↔Anh còn thiếu — CHỈ khi lệch 1 chiều (không đè nếu cả 2 đã có).
                        if (job.mv && !job.me) {
                            const res = await api.translate(job.mv, "vi", "en");
                            const translated = normalizeMeaningSync(res?.translated ?? "");
                            m.vietMeanings = normalizeMeaningSync(job.mv);
                            if (translated) m.engMeanings = translated;
                        } else if (job.me && !job.mv) {
                            const res = await api.translate(job.me, "en", "vi");
                            const translated = normalizeMeaningSync(res?.translated ?? "");
                            m.engMeanings = normalizeMeaningSync(job.me);
                            if (translated) m.vietMeanings = translated;
                        }
                        // 2) Tự động điền gloss zh (CHỈ mandarin) nếu trống — nguồn ưu tiên eng → việt.
                        // Gloss dùng gtx (deep_translator chặn 'yue'). ⚠️ 2026-08-22: cantonese bỏ gloss (yue).
                        if (column === "pinyin") {
                            const curMv = (m.vietMeanings ?? "").trim();
                            const curMe = (m.engMeanings ?? "").trim();
                            if (!(m.gloss ?? "").trim() && (curMe || curMv)) {
                                const gSource = curMe ? "en" : "vi";
                                // Gloss zh đi qua /api/translate (deep_translator → LibreTranslate fallback).
                                const gRes = await api.translate(curMe || curMv, gSource, "zh-CN");
                                const gTranslated = String(gRes?.translated ?? "").trim();
                                if (gTranslated) m.gloss = gTranslated;
                            }
                        }
                    } else {
                        // Example: chuẩn hóa dấu tách, giữ nguyên chữ hoa đầu câu.
                        const source = job.ev ? "vi" : "en";
                        const target = job.ev ? "en" : "vi";
                        const res = await api.translate(job.ev || job.ee, source, target);
                        const translated = normalizeGlossSeparators(res?.translated ?? "");
                        const ex = next[job.mIdx].examples[job.exIdx];
                        if (job.ev) {
                            ex.vietExamples = normalizeGlossSeparators(job.ev);
                            if (translated) ex.engExamples = translated;
                        } else {
                            ex.engExamples = normalizeGlossSeparators(job.ee);
                            if (translated) ex.vietExamples = translated;
                        }
                    }
                    synced += 1;
                } catch (err) {
                    if (isRateLimited(err)) throw err; // Google rate limit → dừng sync, báo lỗi
                    // Bỏ qua job lỗi khác (network tạm thời...) — vẫn xử lý các job còn lại.
                } finally {
                    done += 1;
                    onProgress?.(done, jobs.length);
                }
            };
            // Chạy tối đa CONCURRENT job cùng lúc (cân bằng tốc độ vs rate-limit).
            const CONCURRENT = 2;
            let idx = 0;
            await Promise.all(
                Array.from({ length: Math.min(CONCURRENT, jobs.length) }, async () => {
                    while (idx < jobs.length) {
                        const job = jobs[idx++];
                        await runJob(job);
                    }
                }),
            );
            setLocalMeanings(next);
            flushToParent(next);
            return synced;
        } finally {
            setSyncingAllViEn(false);
        }
    };

    // Footer "Đồng bộ nghĩa + Jyutping" (cantonese) — 1 click đồng bộ nghĩa/ví dụ từ nguồn có sẵn
    // (vi↔en) rồi điền Jyutping còn thiếu cho từng ví dụ (pipeline 3 fallback).
    // ⚠️ 2026-08-22: bỏ hẳn gloss yue (KHÔNG còn fill/dịch yue — chỉ cần vi/en).
    const syncAllCantonese = async (onProgress) => {
        if (syncingAllViEn) return 0;
        // Build jobs riêng cho cantonese: nghĩa thiếu 1 chiều (vi↔en), ví dụ thiếu vi/en,
        // và ví dụ thiếu jyutpingExample.
        const jobs = [];
        localMeanings.forEach((m, mIdx) => {
            const mv = (m.vietMeanings ?? "").trim();
            const me = (m.engMeanings ?? "").trim();
            if (Boolean(mv) !== Boolean(me)) {
                jobs.push({ mIdx, exIdx: null, mv, me });
            }
            (m.examples ?? []).forEach((ex, exIdx) => {
                const ev = (ex.vietExamples ?? "").trim();
                const ee = (ex.engExamples ?? "").trim();
                const ej = (ex.jyutpingExample ?? "").trim();
                const exHan = (ex.hanTraditional ?? "").trim() || (ex.hanSimplified ?? "").trim();
                if ((ev || ee) && Boolean(ev) !== Boolean(ee)) jobs.push({ mIdx, exIdx, ev, ee });
                else if (!ej && exHan) jobs.push({ mIdx, exIdx, fillJyutping: true, exHan });
            });
        });
        if (!jobs.length) {
            onProgress?.(0, 0);
            return 0;
        }
        setSyncingAllViEn(true);
        try {
            const next = localMeanings.map((m) => ({
                ...m,
                examples: (m.examples ?? []).map((e) => ({ ...e })),
            }));
            let done = 0;
            let synced = 0;
            const runJob = async (job) => {
                try {
                    if (job.fillJyutping) {
                        // Ví dụ thiếu jyutping → điền qua pipeline 3 fallback (words.hk → CC-Canto → to-jyutping).
                        const ex = next[job.mIdx].examples[job.exIdx];
                        const res = await api.toJyutping(job.exHan);
                        if (res?.jyutping) ex.jyutpingExample = res.jyutping;
                    } else if (job.exIdx !== null) {
                        // Ví dụ thiếu 1 chiều vi/en.
                        const source = job.ev ? "vi" : "en";
                        const target = job.ev ? "en" : "vi";
                        const res = await api.translate(job.ev || job.ee, source, target);
                        const translated = normalizeGlossSeparators(res?.translated ?? "");
                        const ex = next[job.mIdx].examples[job.exIdx];
                        if (job.ev) {
                            ex.vietExamples = normalizeGlossSeparators(job.ev);
                            if (translated) ex.engExamples = translated;
                        } else {
                            ex.engExamples = normalizeGlossSeparators(job.ee);
                            if (translated) ex.vietExamples = translated;
                        }
                    } else {
                        const m = next[job.mIdx];
                        // Điền chiều Việt↔Anh còn thiếu — CHỈ khi lệch 1 chiều.
                        // ⚠️ 2026-08-22: cantonese KHÔNG còn gloss yue → chỉ sync vi↔en.
                        if (job.mv && !job.me) {
                            // Việt có, Anh trống → dịch vi → en.
                            const res = await api.translate(job.mv, "vi", "en");
                            const translated = normalizeMeaningSync(res?.translated ?? "");
                            m.vietMeanings = normalizeMeaningSync(job.mv);
                            if (translated) m.engMeanings = translated;
                        } else if (job.me && !job.mv) {
                            // Anh có, Việt trống → dịch en → vi.
                            const res = await api.translate(job.me, "en", "vi");
                            const translated = normalizeMeaningSync(res?.translated ?? "");
                            m.engMeanings = normalizeMeaningSync(job.me);
                            if (translated) m.vietMeanings = translated;
                        }
                    }
                    synced += 1;
                } catch (err) {
                    if (isRateLimited(err)) throw err; // Google rate limit → dừng sync, báo lỗi
                    // Bỏ qua job lỗi khác (network tạm thời...) — vẫn xử lý các job còn lại.
                } finally {
                    done += 1;
                    onProgress?.(done, jobs.length);
                }
            };
            const CONCURRENT = 2;
            let idx = 0;
            await Promise.all(
                Array.from({ length: Math.min(CONCURRENT, jobs.length) }, async () => {
                    while (idx < jobs.length) {
                        const job = jobs[idx++];
                        await runJob(job);
                    }
                }),
            );
            setLocalMeanings(next);
            flushToParent(next);
            return synced;
        } finally {
            setSyncingAllViEn(false);
        }
    };

    // Footer "Thêm nghĩa" / "Đồng bộ Việt - Anh" (VocabularyDetailContent) gọi qua ref.
    useImperativeHandle(ref, () => ({ addMeaning, syncAllViEn, syncAllCantonese, hasSyncJobs, getSyncJobCount }), [
        addMeaning,
        syncAllViEn,
        syncAllCantonese,
        hasSyncJobs,
        getSyncJobCount,
    ]);

    const handleExpand = () => {
        setExpanded(true);
        // Auto-create first meaning nếu chưa có
        if (localMeanings.length === 0) {
            addMeaning();
        }
    };

    const updateMeaning = (idx, updated) => {
        const next = localMeanings.map((m, i) => (i === idx ? { ...m, ...updated } : m));
        setLocalMeanings(next);
        flushToParent(next);
    };

    const removeMeaning = (idx) => {
        const next = localMeanings.filter((_, i) => i !== idx);
        setLocalMeanings(next);
        flushToParent(next);
        if (next.length === 0) setExpanded(false);
    };

    // ⚠️ 2026-09-20: đổi SỐ THỨ TỰ meaning — hoán vị 2 vị trí liền kề.
    // Thứ tự mảng draft = thứ tự lưu (backend ghi cột `position` theo vị trí mảng).
    const moveMeaning = (idx, dir) => {
        const target = idx + dir;
        if (target < 0 || target >= localMeanings.length) return;
        const next = [...localMeanings];
        [next[idx], next[target]] = [next[target], next[idx]];
        setLocalMeanings(next);
        flushToParent(next);
    };

    // ⚠️ 2026-08-21: nút "Add meaning & example" CHỈ hiện khi có reading (sino-romanization group).
    // Chưa có reading → không cho thêm meaning (ẩn nút hoàn toàn).
    if (!expanded) {
        if (!hasReading) return null;
        return (
            <div className="flex justify-center">
                <Button
                    type="button"
                    className="rounded-lg bg-primary text-primary-foreground border-primary hover:enabled:bg-primary/90 shadow-sm"
                    onClick={handleExpand}
                    title={t.addWord.addMeaningExample}
                >
                    <IconPlus size={18} data-icon="inline-start" />
                    {t.addWord.addMeaningExample}
                </Button>
            </div>
        );
    }

    return (
        <Card
            className={cn(
                flat ? "border-0 bg-transparent shadow-none ring-0" : "bg-background/50 border border-border",
            )}
        >
            <CardHeader className={cn("flex-row items-center gap-2", flat && "px-0")}>
                <CardTitle className="flex-1 text-center text-xl font-semibold uppercase text-viet">
                    {t.addWord.detailedMeanings}
                </CardTitle>
            </CardHeader>
            <CardContent className={cn("flex flex-col gap-2", flat && "p-0")}>
                {localMeanings.map((m, i) => (
                    <div key={m._tempId || m.id || i} className="rounded-xl bg-muted/40 border border-border/60 p-4">
                        <MeaningCard
                            meaning={m}
                            index={i}
                            column={column}
                            onChange={(updated) => updateMeaning(i, updated)}
                            onRemove={() => removeMeaning(i)}
                            onMoveUp={i > 0 ? () => moveMeaning(i, -1) : null}
                            onMoveDown={i < localMeanings.length - 1 ? () => moveMeaning(i, 1) : null}
                            selectedExKeys={selectedExKeys}
                            onToggleSelect={(ex) => toggleSelectExample(ex, i)}
                            onToggleSelectAll={() => toggleSelectAllInMeaning(i)}
                        />
                    </div>
                ))}
                {/* Quick-move floating bar (fixed bottom — KHÔNG cần kéo lên trên) (2026-08-22) */}
                {selectedCount > 0 && (
                    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-full border border-border bg-card px-4 py-2 shadow-2xl">
                        <span className="text-sm font-semibold text-foreground">{moveDesc}</span>
                        <Select value={moveTarget} onValueChange={setMoveTarget}>
                            <SelectTrigger className="h-8 w-auto min-w-52">
                                {/* ⚠️ Phải truyền children cho SelectValue — Base UI render RAW value */}
                                <SelectValue placeholder={t.addWord?.chooseTargetMeaning ?? "Chọn meaning đích"}>
                                    {moveTargetOptions.find((o) => o.key === moveTarget)?.label ?? moveTarget}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent side="top">
                                <SelectGroup>
                                    {moveTargetOptions.map((o) => (
                                        <SelectItem key={o.key} value={o.key}>
                                            {o.label}
                                        </SelectItem>
                                    ))}
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        <Button
                            type="button"
                            size="sm"
                            className="bg-primary text-primary-foreground border-primary hover:enabled:bg-primary/90"
                            onClick={moveSelectedExamples}
                            disabled={!moveTarget}
                        >
                            {t.addWord?.moveExamples ?? "Di chuyển"}
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={clearSelection}>
                            {t.common?.cancel ?? "Hủy"}
                        </Button>
                    </div>
                )}
                {/* Nút "Thêm nghĩa" (2026-08-30: bỏ group meaning) */}
                <div className="flex justify-start">
                    <Button type="button" onClick={addMeaning} title={t.addWord.addMeaning}>
                        <IconPlus size={18} data-icon="inline-start" />
                        {t.addWord.addMeaning}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
});

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

// Meaning sau sync LUÔN lowercase (áp dụng cả vi & en). Kèm dedupe sense trùng
// (giống backend dedupeSenses — 2026-09): "invisible, invisible, invisible" → "invisible".
// ⚠️ 2026-09-05: tách cả "/" — list dùng dấu "/" (vd "some / some / some") cũng bị gom trùng.
function normalizeMeaningSync(value) {
    const s = normalizeMeaningSeparators(value).toLowerCase();
    const parts = s
        .split(/[,，;；、/]+/)
        .map((p) => p.trim())
        .filter(Boolean);
    if (parts.length < 2) return s;
    const seen = new Set();
    let dup = false;
    for (const p of parts) {
        const k = p.toLowerCase();
        if (seen.has(k)) {
            dup = true;
            break;
        }
        seen.add(k);
    }
    // Không có trùng thật → giữ nguyên chuỗi (không đổi dấu câu).
    if (!dup) return s;
    const out = [];
    const outSeen = new Set();
    for (const p of parts) {
        const k = p.toLowerCase();
        if (outSeen.has(k)) continue;
        outSeen.add(k);
        out.push(p);
    }
    return out.join(", ");
}

/**
 * Đếm số job sync Việt↔Anh (meaning + ví dụ) còn thiếu 1 chiều trong mảng meanings FLAT
 * (shape: {vietMeanings, engMeanings, gloss, examples:[{vietExamples, engExamples}]}).
 * Dùng chung để tính tổng tiến trình khi sync TẤT CẢ reading pinyin (từ đa phiên âm).
 */
export function countViEnSyncJobs(meanings, column) {
    let jobs = 0;
    for (const m of meanings ?? []) {
        const mv = (m.vietMeanings ?? "").trim();
        const me = (m.engMeanings ?? "").trim();
        const mg = (m.gloss ?? "").trim();
        // ⚠️ 2026-08-22: chỉ tính job fill gloss zh cho mandarin (column pinyin); cantonese bỏ gloss (yue).
        if (Boolean(mv) !== Boolean(me) || (column === "pinyin" && !mg && (me || mv))) jobs += 1;
        for (const ex of m.examples ?? []) {
            const ev = (ex.vietExamples ?? "").trim();
            const ee = (ex.engExamples ?? "").trim();
            if ((ev || ee) && Boolean(ev) !== Boolean(ee)) jobs += 1;
        }
    }
    return jobs;
}

/** Google rate-limit (HTTP 429) — cần báo lỗi cho user (không bỏ qua im lặng). (2026-08-24) */
function isRateLimited(err) {
    return Boolean(err && (err.status === 429 || err.code === 429));
}

/** Retry lời gọi API (translate/toJyutping) với backoff khi lỗi tạm thời (network) —
 *  tránh Full Sync bỏ sót nghĩa/ví dụ. ⚠️ 429 (Google rate limit) KHÔNG retry — throw ngay
 *  để sync dừng + báo lỗi "Google limit". (2026-08-23) */
async function withRetry(fn, attempts = 3) {
    for (let i = 0; i < attempts; i++) {
        try {
            return await fn();
        } catch (err) {
            if (isRateLimited(err) || i >= attempts - 1) throw err;
            await new Promise((r) => setTimeout(r, 600 * (i + 1)));
        }
    }
    throw new Error("unreachable");
}

// ═══ Check nhanh "đã đầy chưa" — item đầy → SKIP, không tạo job / không gọi API. (2026-08-25) ═══
/** Meaning cần fill không? — vi↔en lệch 1 chiều; `withGloss` (mandarin) thêm: thiếu gloss. */
function meaningNeedsFill(m, withGloss) {
    const mv = (m.vietMeanings ?? "").trim();
    const me = (m.engMeanings ?? "").trim();
    if (Boolean(mv) !== Boolean(me)) return true;
    if (withGloss && (me || mv) && !(m.gloss ?? "").trim()) return true;
    return false;
}
/** Example cần fill vi/en không? — vi↔en lệch 1 chiều. */
function exampleViEnNeedsFill(ex) {
    const ev = (ex.vietExamples ?? "").trim();
    const ee = (ex.engExamples ?? "").trim();
    return Boolean(ev) !== Boolean(ee);
}
/** Example CANTONESE cần fill không? — vi/en lệch HOẶC thiếu jyutping (khi có chữ Hán). */
function exampleCantoneseNeedsFill(ex) {
    if (exampleViEnNeedsFill(ex)) return true;
    const exHan = (ex.hanTraditional ?? "").trim() || (ex.hanSimplified ?? "").trim();
    return Boolean(exHan) && !(ex.jyutpingExample ?? "").trim();
}

/**
 * Sync Việt↔Anh cho mảng meanings FLAT (meaning + ví dụ) — chỉ điền phía còn trống.
 * Không mutate đầu vào; trả { meanings: mảng mới đã sync, synced }.
 * Dùng chung cho flow gộp "Hanzii + Đồng bộ" (sync TẤT CẢ reading pinyin — từ đa phiên âm),
 * KHÔNG phụ thuộc editor đang active (trước đây chỉ sync 1 reading).
 */
export async function syncMeaningsViEn(meanings, column, onProgress) {
    const src = Array.isArray(meanings) ? meanings : [];
    const jobs = [];
    src.forEach((m, mIdx) => {
        const mv = (m.vietMeanings ?? "").trim();
        const me = (m.engMeanings ?? "").trim();
        const mg = (m.gloss ?? "").trim();
        // Check nhanh: meaning đã đầy (vi+en; mandarin thêm gloss) → skip, không tạo job. (2026-08-25)
        if (meaningNeedsFill(m, column === "pinyin")) jobs.push({ mIdx, exIdx: null, mv, me, mg });
        (m.examples ?? []).forEach((ex, exIdx) => {
            const ev = (ex.vietExamples ?? "").trim();
            const ee = (ex.engExamples ?? "").trim();
            // Check nhanh: example đã đầy vi+en → skip. (2026-08-25)
            if (exampleViEnNeedsFill(ex)) jobs.push({ mIdx, exIdx, ev, ee });
        });
    });
    if (!jobs.length) {
        onProgress?.(0, 0);
        return { meanings: src, synced: 0 };
    }
    // Deep copy để patch rồi trả mảng mới (không mutate đầu vào).
    const next = src.map((m) => ({ ...m, examples: (m.examples ?? []).map((e) => ({ ...e })) }));
    let done = 0;
    let synced = 0;
    // ⚠️ 2026-08-24: khi 1 job gặp 429 (Google rate limit) → Promise.all reject NHƯNG các
    // worker khác vẫn chạy tiếp + vẫn ghi progress → sau khi flow reset progress "hiện lại"
    // hoặc 2 flow ghi đè nhau → nhìn như tụt lùi (10/12 → 8/12). Cờ aborted: dừng vòng lặp
    // worker + KHÔNG ghi progress khi đã có lỗi 429 → abort sạch, không interleave.
    let aborted = false;
    const runJob = async (job) => {
        try {
            if (job.exIdx === null) {
                const m = next[job.mIdx];
                if (job.mv && !job.me) {
                    const res = await withRetry(() => api.translate(job.mv, "vi", "en"));
                    const translated = normalizeMeaningSync(res?.translated ?? "");
                    m.vietMeanings = normalizeMeaningSync(job.mv);
                    if (translated) {
                        m.engMeanings = translated;
                        synced += 1; // ⚠️ chỉ đếm khi thực sự điền được. (2026-08-25)
                    }
                } else if (job.me && !job.mv) {
                    const res = await withRetry(() => api.translate(job.me, "en", "vi"));
                    const translated = normalizeMeaningSync(res?.translated ?? "");
                    m.engMeanings = normalizeMeaningSync(job.me);
                    if (translated) {
                        m.vietMeanings = translated;
                        synced += 1;
                    }
                }
                const curMv = (m.vietMeanings ?? "").trim();
                const curMe = (m.engMeanings ?? "").trim();
                // ⚠️ 2026-08-22: chỉ fill gloss zh cho mandarin (column pinyin); cantonese bỏ gloss (yue).
                if (column === "pinyin" && !(m.gloss ?? "").trim() && (curMe || curMv)) {
                    const gSource = curMe ? "en" : "vi";
                    // Gloss zh đi qua /api/translate (deep_translator → LibreTranslate fallback).
                    const gRes = await withRetry(() => api.translate(curMe || curMv, gSource, "zh-CN"));
                    const gTranslated = String(gRes?.translated ?? "").trim();
                    if (gTranslated) {
                        m.gloss = gTranslated;
                        synced += 1;
                    }
                }
            } else {
                const source = job.ev ? "vi" : "en";
                const target = job.ev ? "en" : "vi";
                const res = await withRetry(() => api.translate(job.ev || job.ee, source, target));
                const translated = normalizeGlossSeparators(res?.translated ?? "");
                const ex = next[job.mIdx].examples[job.exIdx];
                if (job.ev) {
                    ex.vietExamples = normalizeGlossSeparators(job.ev);
                    if (translated) {
                        ex.engExamples = translated;
                        synced += 1;
                    }
                } else {
                    ex.engExamples = normalizeGlossSeparators(job.ee);
                    if (translated) {
                        ex.vietExamples = translated;
                        synced += 1;
                    }
                }
            }
        } catch (err) {
            if (isRateLimited(err)) {
                aborted = true; // Google rate limit → dừng sync, báo lỗi, không ghi progress nữa
                throw err;
            }
            // Bỏ qua job lỗi khác (network tạm thời...) — vẫn xử lý các job còn lại.
        } finally {
            done += 1;
            if (!aborted) onProgress?.(done, jobs.length);
        }
    };
    const CONCURRENT = 2;
    let idx = 0;
    await Promise.all(
        Array.from({ length: Math.min(CONCURRENT, jobs.length) }, async () => {
            while (!aborted && idx < jobs.length) {
                const job = jobs[idx++];
                await runJob(job);
            }
        }),
    );
    return { meanings: next, synced };
}

/**
 * Đếm số job sync CANTONESE (nghĩa vi↔en + ví dụ vi/en + jyutping) trong mảng meanings
 * FLAT — dùng tính tiến trình khi Full Sync chạy trực tiếp trên base.
 * ⚠️ 2026-08-22: bỏ gloss yue — chỉ còn sync vi↔en + jyutping.
 */
export function countCantoneseSyncJobs(meanings) {
    let jobs = 0;
    for (const m of meanings ?? []) {
        const mv = (m.vietMeanings ?? "").trim();
        const me = (m.engMeanings ?? "").trim();
        if (Boolean(mv) !== Boolean(me)) jobs += 1;
        for (const ex of m.examples ?? []) {
            const ev = (ex.vietExamples ?? "").trim();
            const ee = (ex.engExamples ?? "").trim();
            const ej = (ex.jyutpingExample ?? "").trim();
            const exHan = (ex.hanTraditional ?? "").trim() || (ex.hanSimplified ?? "").trim();
            if ((ev || ee) && Boolean(ev) !== Boolean(ee)) jobs += 1;
            else if (!ej && exHan) jobs += 1;
        }
    }
    return jobs;
}

/**
 * Sync CANTONESE cho mảng meanings FLAT — đồng bộ nghĩa (vi↔en) + điền Jyutping còn
 * thiếu cho ví dụ. Không mutate đầu vào; trả { meanings: mảng mới đã sync, synced }.
 * KHÔNG phụ thuộc editor state → Full Sync Cantonese chạy trực tiếp trên base (giống
 * syncMeaningsViEn của Mandarin), tránh race propagate scrap xuống editor khiến sync chạy
 * trên dữ liệu cũ. ⚠️ 2026-08-22: bỏ gloss yue — chỉ sync vi↔en + jyutping. (2026-08-21)
 */
export async function syncMeaningsCantonese(meanings, onProgress) {
    const src = Array.isArray(meanings) ? meanings : [];
    const jobs = [];
    src.forEach((m, mIdx) => {
        const mv = (m.vietMeanings ?? "").trim();
        const me = (m.engMeanings ?? "").trim();
        // Check nhanh: meaning đã đầy vi+en → skip, không tạo job. (2026-08-25)
        if (meaningNeedsFill(m, false)) jobs.push({ mIdx, exIdx: null, mv, me });
        (m.examples ?? []).forEach((ex, exIdx) => {
            const ev = (ex.vietExamples ?? "").trim();
            const ee = (ex.engExamples ?? "").trim();
            const ej = (ex.jyutpingExample ?? "").trim();
            const exHan = (ex.hanTraditional ?? "").trim() || (ex.hanSimplified ?? "").trim();
            // Check nhanh: example đã đầy (vi+en+jyutping) → skip. (2026-08-25)
            if (exampleCantoneseNeedsFill(ex)) {
                if (exampleViEnNeedsFill(ex)) jobs.push({ mIdx, exIdx, ev, ee });
                else jobs.push({ mIdx, exIdx, fillJyutping: true, exHan });
            }
        });
    });
    if (!jobs.length) {
        onProgress?.(0, 0);
        return { meanings: src, synced: 0 };
    }
    // Deep copy để patch rồi trả mảng mới (không mutate đầu vào).
    const next = src.map((m) => ({ ...m, examples: (m.examples ?? []).map((e) => ({ ...e })) }));
    let done = 0;
    let synced = 0;
    // ⚠️ 2026-08-24: cờ aborted — chặn worker khác chạy tiếp + không ghi progress sau khi
    // 1 job gặp 429 (Google rate limit) → Promise.all reject sạch, không interleave progress.
    let aborted = false;
    const runJob = async (job) => {
        try {
            if (job.fillJyutping) {
                // Ví dụ thiếu jyutping → điền qua pipeline 3 fallback (words.hk → CC-Canto → to-jyutping).
                const ex = next[job.mIdx].examples[job.exIdx];
                const res = await withRetry(() => api.toJyutping(job.exHan));
                if (res?.jyutping) {
                    ex.jyutpingExample = res.jyutping;
                    synced += 1; // ⚠️ chỉ đếm khi thực sự điền được. (2026-08-25)
                }
            } else if (job.exIdx !== null) {
                // Ví dụ thiếu 1 chiều vi/en.
                const source = job.ev ? "vi" : "en";
                const target = job.ev ? "en" : "vi";
                const res = await withRetry(() => api.translate(job.ev || job.ee, source, target));
                const translated = normalizeGlossSeparators(res?.translated ?? "");
                const ex = next[job.mIdx].examples[job.exIdx];
                if (job.ev) {
                    ex.vietExamples = normalizeGlossSeparators(job.ev);
                    if (translated) {
                        ex.engExamples = translated;
                        synced += 1;
                    }
                } else {
                    ex.engExamples = normalizeGlossSeparators(job.ee);
                    if (translated) {
                        ex.vietExamples = translated;
                        synced += 1;
                    }
                }
            } else {
                const m = next[job.mIdx];
                // Điền chiều Việt↔Anh còn thiếu — CHỈ khi lệch 1 chiều.
                // ⚠️ 2026-08-22: cantonese KHÔNG còn gloss yue → chỉ sync vi↔en.
                if (job.mv && !job.me) {
                    const res = await withRetry(() => api.translate(job.mv, "vi", "en"));
                    const translated = normalizeMeaningSync(res?.translated ?? "");
                    m.vietMeanings = normalizeMeaningSync(job.mv);
                    if (translated) {
                        m.engMeanings = translated;
                        synced += 1;
                    }
                } else if (job.me && !job.mv) {
                    const res = await withRetry(() => api.translate(job.me, "en", "vi"));
                    const translated = normalizeMeaningSync(res?.translated ?? "");
                    m.engMeanings = normalizeMeaningSync(job.me);
                    if (translated) {
                        m.vietMeanings = translated;
                        synced += 1;
                    }
                }
            }
        } catch (err) {
            if (isRateLimited(err)) {
                aborted = true; // Google rate limit → dừng sync, báo lỗi, không ghi progress nữa
                throw err;
            }
            // Bỏ qua job lỗi khác (network tạm thời...) — vẫn xử lý các job còn lại.
        } finally {
            done += 1;
            if (!aborted) onProgress?.(done, jobs.length);
        }
    };
    const CONCURRENT = 2;
    let idx = 0;
    await Promise.all(
        Array.from({ length: Math.min(CONCURRENT, jobs.length) }, async () => {
            while (!aborted && idx < jobs.length) {
                const job = jobs[idx++];
                await runJob(job);
            }
        }),
    );
    return { meanings: next, synced };
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
                className="pointer-events-none absolute inset-0 z-10 overflow-hidden whitespace-pre-wrap wrap-break-word px-3 py-3 text-[0.9375rem] leading-normal text-muted-foreground"
                style={{ fontFamily: HAN_EXAMPLE_FONT }}
            >
                {text}
            </div>
        </div>
    );
}

function MeaningCard({
    meaning,
    index,
    column,
    onChange,
    onRemove,
    onMoveUp = null,
    onMoveDown = null,
    selectedExKeys = new Set(),
    onToggleSelect = () => {},
    onToggleSelectAll = () => {},
}) {
    const { t } = useLocale();
    const [showExamples, setShowExamples] = useState(true); // examples expanded by default

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

    const removeExample = (exIdx) => {
        const nextExamples = (meaning.examples ?? []).filter((_, i) => i !== exIdx);
        onChange({ examples: nextExamples });
    };

    const exampleCount = (meaning.examples ?? []).length;
    // Select-all cho TỪNG MEANING này (checkbox trong header examples) (2026-08-22)
    const meaningKeys = (meaning.examples ?? []).map((ex) => ex?._tempId || ex?.id).filter(Boolean);
    const meaningSelCount = meaningKeys.filter((k) => selectedExKeys.has(k)).length;
    const meaningAll = meaningKeys.length > 0 && meaningSelCount === meaningKeys.length;
    const meaningSome = meaningSelCount > 0 && meaningSelCount < meaningKeys.length;
    const addExampleButton = (
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
    );

    return (
        <div className="flex flex-col">
            <div className="grid grid-cols-[auto_1fr] items-start gap-x-2">
                <Badge variant="outline" className="shrink-0 rounded-md px-1.5 text-sm text-viet">
                    {index + 1}
                </Badge>
                <div className="flex flex-col gap-2 text-base">
                    <div className="flex items-center justify-end gap-2">
                        {/* ⚠️ 2026-09-20: đổi số thứ tự meaning (hoán vị với nghĩa liền kề). */}
                        <Button
                            type="button"
                            variant="outline"
                            size="icon-sm"
                            className="rounded-full"
                            onClick={onMoveUp}
                            disabled={!onMoveUp}
                            title={t.addWord.moveMeaningUp}
                            aria-label={t.addWord.moveMeaningUp}
                        >
                            <IconChevronDown className="rotate-180" />
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="icon-sm"
                            className="rounded-full"
                            onClick={onMoveDown}
                            disabled={!onMoveDown}
                            title={t.addWord.moveMeaningDown}
                            aria-label={t.addWord.moveMeaningDown}
                        >
                            <IconChevronDown />
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
                    {/* Meaning — cả mục size md (text-base), label riêng vẫn sm (2026-08-19) */}
                    {/* Line 1: Vietnamese meaning */}
                    <label className="flex flex-col gap-0.5 mb-2">
                        <span className="text-sm text-viet font-semibold">{t.addWord.vietnameseMeaning}</span>
                        <Textarea
                            className="text-muted-foreground font-medium text-base! min-h-10!"
                            rows={1}
                            value={meaning.vietMeanings ?? ""}
                            onChange={(e) => onChange({ vietMeanings: e.target.value })}
                        />
                    </label>
                    {/* Line 2: English meaning (replaces Chinese definition) */}
                    <label className="flex flex-col gap-0.5 mb-2">
                        <span className="text-sm text-viet font-semibold">{t.addWord.englishMeaning}</span>
                        <Textarea
                            className="text-muted-foreground text-base! min-h-10!"
                            rows={1}
                            value={meaning.engMeanings ?? ""}
                            onChange={(e) => onChange({ engMeanings: e.target.value })}
                        />
                    </label>
                    {/* Line 3: Gloss zh — CHỈ mandarin. ⚠️ 2026-08-22: cantonese bỏ gloss (yue). */}
                    {column === "pinyin" && (
                        <label className="flex flex-col gap-0.5 mb-2">
                            <span className="text-sm text-viet font-semibold">{t.addWord.glossMandarin}</span>
                            <Textarea
                                className="text-muted-foreground text-base! min-h-10!"
                                rows={1}
                                value={meaning.gloss ?? ""}
                                onChange={(e) => onChange({ gloss: e.target.value })}
                            />
                        </label>
                    )}

                    {/* Examples for this meaning */}
                    <div className="flex flex-col gap-2">
                        {exampleCount > 0 && (
                            <MeaningExamples
                                open={showExamples}
                                onOpenChange={setShowExamples}
                                label={t.addWord.examplesWithCount.replace("{count}", exampleCount)}
                                headerExtra={
                                    <label className="flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground select-none">
                                        <Checkbox
                                            checked={meaningAll ? true : meaningSome ? "indeterminate" : false}
                                            onCheckedChange={onToggleSelectAll}
                                            aria-label={t.addWord?.selectAllExamples ?? "Select all examples"}
                                        />
                                        {t.addWord?.selectAllExamples ?? "Select all examples"}
                                    </label>
                                }
                            >
                                {(meaning.examples ?? []).map((ex, j) => {
                                    const hanParts = exampleHanParts(ex);
                                    const hasHan = Boolean(hanParts.hanSimplified || hanParts.hanTraditional);
                                    const isSelected = selectedExKeys.has(ex._tempId || ex.id);
                                    return (
                                        <div
                                            key={ex._tempId || j}
                                            className={cn(
                                                "rounded-lg border border-border/70 bg-muted p-4 grid grid-cols-[auto_1fr] items-start gap-x-2 gap-y-2",
                                                isSelected && "border-primary/60 ring-1 ring-primary/40",
                                            )}
                                        >
                                            <Badge
                                                variant="outline"
                                                className="shrink-0 rounded-md px-1.5 text-sm text-viet"
                                            >
                                                {j + 1}
                                            </Badge>
                                            <div className="flex flex-col gap-2">
                                                <div className="flex flex-wrap items-center justify-end gap-2">
                                                    {/* Checkbox chọn ví dụ để di chuyển sang meaning khác */}
                                                    <label className="flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground select-none">
                                                        <Checkbox
                                                            checked={isSelected}
                                                            onCheckedChange={() => onToggleSelect(ex)}
                                                        />
                                                        {t.addWord?.selectForMove ?? "Chọn để di chuyển"}
                                                    </label>
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
                                                <div className="flex flex-col gap-2">
                                                    <div className="flex flex-col gap-2 mb-2">
                                                        {column === "pinyin" ? (
                                                            // ⚠️ 2026-08-22: mandarin → zh — 1 field tiếng Trung duy nhất.
                                                            <label className="flex flex-col gap-0.5">
                                                                <span className="text-sm text-foreground font-semibold">
                                                                    {t.addWord.chineseMandarin}
                                                                </span>
                                                                <HanLineTextarea
                                                                    rows={1}
                                                                    value={hanParts.hanSimplified}
                                                                    onChange={(v) => updateHanLine(j, 0, v)}
                                                                />
                                                            </label>
                                                        ) : column === "jyutping" ? (
                                                            // ⚠️ 2026-08-22: cantonese → yue — field chữ Hán câu ví dụ (đã thêm lại cột yue).
                                                            <label className="flex flex-col gap-0.5">
                                                                <span className="text-sm text-foreground font-semibold">
                                                                    {t.addWord.chineseCantonese}
                                                                </span>
                                                                <HanLineTextarea
                                                                    rows={1}
                                                                    value={hanParts.hanTraditional}
                                                                    onChange={(v) => updateHanLine(j, 1, v)}
                                                                />
                                                            </label>
                                                        ) : !column ? (
                                                            <>
                                                                <label className="flex flex-col gap-0.5">
                                                                    <span className="text-sm text-foreground font-semibold">
                                                                        {t.addWord.simplified}
                                                                    </span>
                                                                    <HanLineTextarea
                                                                        rows={1}
                                                                        value={hanParts.hanSimplified}
                                                                        onChange={(v) => updateHanLine(j, 0, v)}
                                                                    />
                                                                </label>
                                                                <label className="flex flex-col gap-0.5">
                                                                    <span className="text-sm text-foreground font-semibold">
                                                                        {t.addWord.traditional}
                                                                    </span>
                                                                    <HanLineTextarea
                                                                        rows={1}
                                                                        value={hanParts.hanTraditional}
                                                                        onChange={(v) => updateHanLine(j, 1, v)}
                                                                    />
                                                                </label>
                                                            </>
                                                        ) : null}
                                                    </div>
                                                    {(column === "pinyin" || !column) && (
                                                        <label className="flex flex-col gap-0.5 mb-2">
                                                            <span className="text-sm text-foreground font-semibold">
                                                                {t.addWord.pinyin}
                                                            </span>
                                                            <Input
                                                                className="text-muted-foreground text-sm"
                                                                value={ex.pinyinExample ?? ""}
                                                                onChange={(e) =>
                                                                    updateExample(j, { pinyinExample: e.target.value })
                                                                }
                                                            />
                                                        </label>
                                                    )}
                                                    {(column === "jyutping" || !column) && (
                                                        <label className="flex flex-col gap-0.5 mb-2">
                                                            <span className="text-sm text-foreground font-semibold">
                                                                {t.addWord.jyutping}
                                                            </span>
                                                            <Input
                                                                className="text-muted-foreground text-sm"
                                                                value={ex.jyutpingExample ?? ""}
                                                                onChange={(e) =>
                                                                    updateExample(j, {
                                                                        jyutpingExample: e.target.value,
                                                                    })
                                                                }
                                                            />
                                                        </label>
                                                    )}
                                                    <label className="flex flex-col gap-0.5 mb-2">
                                                        <span className="text-sm text-foreground font-semibold">
                                                            {t.addWord.vietnamese}
                                                        </span>
                                                        <Input
                                                            className="text-muted-foreground text-sm"
                                                            value={ex.vietExamples ?? ""}
                                                            onChange={(e) =>
                                                                updateExample(j, { vietExamples: e.target.value })
                                                            }
                                                        />
                                                    </label>
                                                    <label className="flex flex-col gap-0.5">
                                                        <span className="text-sm text-foreground font-semibold">
                                                            {t.addWord.english}
                                                        </span>
                                                        <Input
                                                            className="text-muted-foreground text-sm"
                                                            value={ex.engExamples ?? ""}
                                                            onChange={(e) =>
                                                                updateExample(j, { engExamples: e.target.value })
                                                            }
                                                        />
                                                    </label>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </MeaningExamples>
                        )}
                        <div className="flex justify-start">{addExampleButton}</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
