import { emptyGrammarBankItem } from "../types/word.js";
import { normalizeVocabularyFields } from "./wordNormalize.js";
import { normalizeSinoVietnameseValue } from "./sinoVietnameseReadings.js";
import { isSinoVietnameseDash } from "./sinoVietnameseMarkers.js";

/** "" khi giá trị là dash placeholder ("-" / "—" / "–") — chỉ placeholder hiển thị, KHÔNG phải data thật. */
const cleanSino = (v) => (isSinoVietnameseDash(v) ? "" : String(v ?? ""));

export function vocabTimestamps(raw) {
    const createdAt = raw.createdAt ?? raw.created_at ?? undefined;
    const updatedAt = raw.updatedAt ?? raw.updated_at ?? undefined;
    return {
        createdAt: createdAt ?? updatedAt,
        updatedAt: updatedAt ?? createdAt,
    };
}

export function vocabAddedAtMs(raw) {
    const { createdAt, updatedAt } = vocabTimestamps(raw);
    for (const value of [createdAt, updatedAt]) {
        if (!value) continue;
        const ms = Date.parse(String(value));
        if (Number.isFinite(ms)) return ms;
    }
    return 0;
}

/**
 * Adapter (2026-08-14): API model mới `{ id, mandarin, cantonese, metadata }`
 * → old-shape store object (han* flat + romanization typed array + meanings legacy).
 * Store giữ shape cũ để ~20 consumer files không phải đổi; payload gửi lên API
 * được build lại theo model mới ở `vocabularyDraftPayload`.
 */
export function vocabNewToLegacy(raw) {
    const man = raw.mandarin ?? {};
    const can = raw.cantonese ?? {};
    const meta = raw.metadata ?? {};
    const manReadings = Array.isArray(man.readings) ? man.readings : [];
    const canReadings = Array.isArray(can.readings) ? can.readings : [];

    const meaningToLegacy = (m, side) => {
        // Example chỉ có tiếng Anh (không hán + không phiên âm) = gloss, không phải
        // câu ví dụ thật → lọc bỏ khỏi hiển thị (2026-08-15).
        const isEnglishOnlyExample = (ex) => {
            const hasHan = Boolean(String(ex.zh ?? "").trim() || String(ex.yue ?? "").trim());
            const hasRoman = Boolean(String(ex.romanization ?? "").trim());
            return !hasHan && !hasRoman;
        };
        return {
            id: m.id,
            category: m.category ?? "",
            gloss: m.zh ?? m.yue ?? "",
            vietMeanings: m.vi ?? "",
            engMeanings: m.en ?? "",
            examples: (m.examples ?? [])
                .filter((ex) => !isEnglishOnlyExample(ex))
                .map((ex) => ({
                    id: ex.id,
                    hanSimplified: side === "mandarin" ? (ex.zh ?? "") : "",
                    hanTraditional: side === "cantonese" ? (ex.yue ?? "") : "",
                    hanExample: [ex.zh ?? "", ex.yue ?? ""].filter(Boolean).join("\n"),
                    jyutpingExample: side === "cantonese" ? (ex.romanization ?? "") : "",
                    pinyinExample: side === "mandarin" ? (ex.romanization ?? "") : "",
                    vietExamples: ex.vi ?? "",
                    engExamples: ex.en ?? "",
                    position: ex.position ?? 0,
                })),
            position: m.position ?? 0,
        };
    };

    const readingToLegacy = (r, side) => ({
        id: r.id,
        type: side === "mandarin" ? "pinyin" : "jyutping",
        pinyin: side === "mandarin" ? (r.romanization ?? "") : "",
        jyutping: side === "cantonese" ? (r.romanization ?? "") : "",
        sinoVietnamese: cleanSino(r.sino_vietnamese),
        meanings: (r.meanings ?? []).map((m) => meaningToLegacy(m, side)),
    });

    const romanization = [
        ...manReadings.map((r) => readingToLegacy(r, "mandarin")),
        ...canReadings.map((r) => readingToLegacy(r, "cantonese")),
    ];
    const meanings = [
        ...manReadings.flatMap((r) => (r.meanings ?? []).map((m) => meaningToLegacy(m, "mandarin"))),
        ...canReadings.flatMap((r) => (r.meanings ?? []).map((m) => meaningToLegacy(m, "cantonese"))),
    ];
    const joinReadings = (rs) =>
        [...new Set(rs.map((r) => String(r.romanization ?? "").trim()).filter(Boolean))].join(" ");

    return {
        id: raw.id,
        hanSimplified: String(man.hanzi_simplified ?? can.hanzi_simplified ?? "").trim() || undefined,
        hanTraditional: String(man.hanzi_traditional ?? "").trim(),
        hanHongKong: String(can.hanzi_traditional ?? "").trim() || undefined,
        pinyin: joinReadings(manReadings),
        jyutping: joinReadings(canReadings),
        sinoVietnamese: [
            ...new Set(
                [...manReadings, ...canReadings].map((r) => String(r.sino_vietnamese ?? "").trim()).filter(Boolean),
            ),
        ].join(" "),
        vietMeanings: meanings
            .map((m) => m.vietMeanings)
            .filter(Boolean)
            .join("; "),
        engMeanings: meanings
            .map((m) => m.engMeanings)
            .filter(Boolean)
            .join("; "),
        meanings,
        romanization,
        hskLevel: meta.hsk_level ?? "",
        boost: meta.popularity ?? null,
        frequency: meta.frequency ?? null,
        relatedWords: raw.relatedWords ?? null,
        movieWordRank: meta.movie_word_rank ?? null,
        bookWordRank: meta.book_word_rank ?? null,
        pureCantonese: Boolean(meta.pure_cantonese ?? false),
        createdAt: meta.created_at ?? meta.updated_at,
        updatedAt: meta.updated_at ?? meta.created_at,
    };
}

/**
 * Adapter (2026-08-17): API model TÁCH theo ngôn ngữ (kho mandarin / cantonese độc lập)
 * → old-shape store object. API object per language:
 *   mandarin:  { id, hanziSimplified, hanziTraditional, hskLevel, popularity, readings:[{id, pinyin, sinoVietnamese, meanings:[{id, category, zh, vi, en, examples:[{id, zh, romanization, vi, en}]}]}] }
 *   cantonese: { id, hanziTraditionalHk, pureCantonese, popularity, readings:[{id, jyutping, sinoVietnamese, meanings:[{id, category, vi, en, examples:[{id, romanization, vi, en}]}]}] }
 */
export function vocabLangToLegacy(raw, lang) {
    const isMandarin = lang === "mandarin";
    const readings = (raw?.readings ?? []).map((r) => {
        const romanization = isMandarin ? String(r.pinyin ?? "") : String(r.jyutping ?? "");
        return {
            id: r.id,
            type: isMandarin ? "pinyin" : "jyutping",
            pinyin: isMandarin ? romanization : "",
            jyutping: isMandarin ? "" : romanization,
            sinoVietnamese: cleanSino(r.sinoVietnamese),
            meanings: (r.meanings ?? []).map((m) => ({
                id: m.id,
                category: m.category ?? "",
                gloss: isMandarin ? String(m.zh ?? "") : "", // ⚠️ 2026-08-22: cantonese bỏ yue gloss
                vietMeanings: m.vi ?? "",
                engMeanings: m.en ?? "",
                examples: (m.examples ?? []).map((ex) => ({
                    id: ex.id,
                    hanSimplified: isMandarin ? String(ex.zh ?? "") : "",
                    hanTraditional: isMandarin ? "" : String(ex.yue ?? ""), // chữ Hán câu ví dụ CC101
                    hanExample: isMandarin ? String(ex.zh ?? "") : String(ex.yue ?? ""),
                    jyutpingExample: isMandarin ? "" : String(ex.romanization ?? ""),
                    pinyinExample: isMandarin ? String(ex.romanization ?? "") : "",
                    vietExamples: ex.vi ?? "",
                    engExamples: ex.en ?? "",
                    position: ex.position ?? 0,
                    hanziAudio: ex.hanziAudio ?? null,
                    englishAudio: ex.englishAudio ?? null,
                })),
                position: m.position ?? 0,
            })),
        };
    });
    const meanings = readings.flatMap((r) => r.meanings ?? []);
    const joinReadings = (field) =>
        [...new Set(readings.map((r) => String(r[field] ?? "").trim()).filter(Boolean))].join(" ");

    return {
        id: raw.id,
        hanSimplified: String(raw.hanziSimplified ?? "").trim() || undefined,
        hanTraditional: isMandarin ? String(raw.hanziTraditional ?? "").trim() : "",
        hanHongKong: isMandarin ? undefined : String(raw.hanziTraditionalHk ?? "").trim() || undefined,
        pinyin: isMandarin ? joinReadings("pinyin") : "",
        jyutping: isMandarin ? "" : joinReadings("jyutping"),
        sinoVietnamese: [...new Set(readings.map((r) => r.sinoVietnamese).filter(Boolean))].join(" "),
        vietMeanings: meanings
            .map((m) => m.vietMeanings)
            .filter(Boolean)
            .join("; "),
        engMeanings: meanings
            .map((m) => m.engMeanings)
            .filter(Boolean)
            .join("; "),
        meanings,
        romanization: readings,
        hskLevel: isMandarin ? String(raw.hskLevel ?? "") : "",
        boost: raw.popularity ?? null,
        relatedWords: raw.relatedWords ?? null,
        pureCantonese: isMandarin ? false : Boolean(raw.pureCantonese),
        hanziAudio: raw.hanziAudio ?? null,
        englishAudio: raw.englishAudio ?? null,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
    };
}

function capFirst(value) {
    const s = (value ?? "").trim();
    if (!s) return s;
    return s.charAt(0).toLocaleUpperCase("vi") + s.slice(1);
}

function exHanParts(ex) {
    const simp = (ex?.hanSimplified ?? "").trim();
    const trad = (ex?.hanTraditional ?? "").trim();
    if (simp || trad) return { hanSimplified: simp, hanTraditional: trad };
    const lines = String(ex?.hanExample ?? "")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
    return { hanSimplified: lines[0] ?? "", hanTraditional: lines[1] ?? "" };
}

function tagsToSpaceValue(value) {
    const trimmed = (value ?? "").trim();
    if (!trimmed) return trimmed;
    return trimmed
        .split(/[,，/、]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .join(" ");
}

/** Loại bỏ dấu câu (CJK + ASCII) trong jyutping/pinyin — "ngo5 hai6..." → "ngo5 hai6" (2026-08-22).
 * ⚠️ GIỮ dấu nháy đơn `'` (pinyin hợp lệ: wǎn'ān) — chỉ bỏ dấu câu câu (chấm/phẩy/...).
 * Dùng SAU tagsToSpaceValue (tagsToSpaceValue biến dấu tách `,`/`/` thành khoảng trắng trước). */
export function cleanRomanization(value) {
    return String(value ?? "")
        .replace(/[，。！？、；：（）《》「」『』【】—…,.;:!?()"“”]/gu, "")
        .replace(/\s+/g, " ")
        .trim();
}

/** Legacy meanings → per-language meaning (dict gloss → zh [mandarin], manual → vi). */
function langMeaningsFromLegacy(meanings, side) {
    const isMandarin = side === "mandarin";
    const hanField = isMandarin ? "zh" : null; // ⚠️ 2026-08-22: cantonese KHÔNG còn gloss (bỏ yue)
    const romanField = isMandarin ? "pinyinExample" : "jyutpingExample";
    return (meanings ?? [])
        .filter((m) => (m.gloss ?? "").trim() || (m.vietMeanings ?? "").trim() || (m.engMeanings ?? "").trim())
        .map((m, i) => {
            const gloss = capFirst((m.gloss ?? "").trim());
            const viet = capFirst((m.vietMeanings ?? "").trim());
            const out = {
                id: m.id,
                position: i,
                category: capFirst((m.category ?? "").trim()),
                ...(hanField ? { [hanField]: gloss } : {}),
                vi: viet,
                en: capFirst((m.engMeanings ?? "").trim()),
            };
            out.examples = (m.examples ?? [])
                .filter((ex) => {
                    const parts = exHanParts(ex);
                    return parts.hanSimplified || parts.hanTraditional || (ex.vietExamples ?? "").trim();
                })
                .map((ex, j) => {
                    const parts = exHanParts(ex);
                    const e = {
                        id: ex.id,
                        position: j,
                        romanization: (ex[romanField] ?? "").trim(),
                        vi: capFirst((ex.vietExamples ?? "").trim()),
                        en: (ex.engExamples ?? "").trim(),
                        ...(isMandarin
                            ? {}
                            : {
                                  // ⚠️ 2026-08-23: fallback hanSimplified khi hanTraditional rỗng (giản == phồn, ex.zh không có 【】) —
                                  // trước chỉ đọc hanTraditional → MẤT yue khi trad==simp.
                                  yue: parts.hanTraditional || parts.hanSimplified || parts.hanExample || "",
                                  hanziAudio: ex.hanziAudio ?? null,
                                  englishAudio: ex.englishAudio ?? null,
                              }),
                    };
                    if (hanField) e[hanField] = isMandarin ? parts.hanSimplified : "";
                    return e;
                });
            return out;
        });
}

/**
 * Build payload TÁCH theo ngôn ngữ (2026-08-17) gửi API từ legacy draft:
 *   mandarin:  { id, hanziSimplified, hanziTraditional, hskLevel, popularity, readings:[{id, pinyin, sinoVietnamese, meanings:[{id, category, zh, vi, en, examples}]}] }
 *   cantonese: { id, hanziTraditionalHk, pureCantonese, popularity, readings:[{id, jyutping, sinoVietnamese, meanings:[{id, category, vi, en, examples}]}] }
 */
/** Meanings phẳng (legacy draft/OCR) → meanings per-language. */
function flatMeaningsFromLegacy(draft, side) {
    const existing = Array.isArray(draft.meanings) ? draft.meanings : [];
    if (existing.length > 0) return langMeaningsFromLegacy(existing, side);
    const viet = (draft.vietMeanings ?? "").trim();
    const eng = (draft.engMeanings ?? "").trim();
    if (!viet && !eng) return [];
    const meaning = {
        category: "",
        vi: capFirst(viet),
        en: capFirst(eng),
        examples: [],
    };
    if (side === "mandarin") meaning.zh = ""; // ⚠️ 2026-08-22: cantonese KHÔNG có gloss (bỏ yue)
    return [meaning];
}

/**
 * Build payload TÁCH theo ngôn ngữ (2026-08-17) gửi API từ legacy draft:
 *   mandarin:  { id, hanziSimplified, hanziTraditional, hskLevel, popularity, readings:[{id, pinyin, sinoVietnamese, meanings:[{id, category, zh, vi, en, examples}]}] }
 *   cantonese: { id, hanziTraditionalHk, pureCantonese, popularity, readings:[{id, jyutping, sinoVietnamese, meanings:[{id, category, vi, en, examples}]}] }
 *
 * ⚠️ 2026-08-18: xử lý 3 nguồn draft:
 *   A) Per-language payload có sẵn `readings` (createVocabulary nhận payload từ saveEdit) → passthrough,
 *      KHÔNG rebuild để tránh mất readings (bug cũ: đọc `romanization` → readings=[] → 500).
 *   B) Legacy draft có `romanization` array (edit mode) → map như cũ.
 *   C) Legacy flat không `romanization`/`readings` (OCR/agent: pinyin/jyutping phẳng) → dựng 1 reading từ flat fields.
 */
export function vocabularyLangPayload(draft, lang) {
    const isMandarin = lang === "mandarin";
    const romanField = isMandarin ? "pinyin" : "jyutping";

    // Case A — payload per-language có sẵn readings shape đúng → passthrough.
    if (!Array.isArray(draft.romanization) && Array.isArray(draft.readings)) {
        const payload = {
            id: draft.id,
            popularity: draft.popularity ?? draft.boost ?? null,
            readings: draft.readings,
        };
        if (isMandarin) {
            payload.hanziSimplified = (draft.hanziSimplified ?? "").trim();
            payload.hanziTraditional = (draft.hanziTraditional ?? "").trim();
            payload.hskLevel = (draft.hskLevel ?? "").trim();
            payload.relatedWords = draft.relatedWords ?? null;
        } else {
            // ⚠️ 2026-08-22: cantonese KHÔNG còn hanziSimplified (đã drop) — chỉ còn hanziTraditionalHk.
            payload.hanziTraditionalHk = (
                draft.hanziTraditionalHk ??
                draft.hanHongKong ??
                draft.hanTraditional ??
                ""
            ).trim();
            payload.pureCantonese = Boolean(draft.pureCantonese);
            payload.relatedWords = draft.relatedWords ?? null;
            // ⚠️ 2026-08-22: giữ audio CC101 khi save/sync — tránh mất audio (bug đã fix)
            payload.hanziAudio = draft.hanziAudio ?? null;
            payload.englishAudio = draft.englishAudio ?? null;
        }
        return payload;
    }

    // Case B — legacy draft có romanization array.
    const allRoms = Array.isArray(draft.romanization) ? draft.romanization : [];
    const readings = allRoms
        .filter((r) => (isMandarin ? r.type !== "jyutping" : r.type === "jyutping"))
        .map((r) => ({
            id: r.id,
            [romanField]: cleanRomanization(tagsToSpaceValue(isMandarin ? (r.pinyin ?? "") : (r.jyutping ?? ""))),
            sinoVietnamese: normalizeSinoVietnameseValue(r.sinoVietnamese) || "",
            meanings: langMeaningsFromLegacy(r.meanings, isMandarin ? "mandarin" : "cantonese"),
        }))
        .filter((r) => String(r[romanField]).trim());

    // Case C — legacy flat (OCR/agent): draft KHÔNG có romanization array, có pinyin/jyutping phẳng.
    // ⚠️ 2026-08-22: CHỈ fallback khi thật sự không có mảng romanization. Nếu draft có
    // `romanization` (kể cả []) thì readings đã phản ánh đúng — xóa hết reading → readings=[]
    // → KHÔNG được tự thêm lại từ `draft.jyutping`/`pinyin` (field phẳng cũ còn sót sau spread).
    if (readings.length === 0 && !Array.isArray(draft.romanization)) {
        const flat = String(isMandarin ? (draft.pinyin ?? "") : (draft.jyutping ?? "")).trim();
        if (flat) {
            readings.push({
                [romanField]: cleanRomanization(tagsToSpaceValue(flat)),
                sinoVietnamese: normalizeSinoVietnameseValue(draft.sinoVietnamese ?? "") || "",
                meanings: flatMeaningsFromLegacy(draft, isMandarin ? "mandarin" : "cantonese"),
            });
        }
    }

    // Case B/C là legacy draft → đọc `hanSimplified`/`hanTraditional`/`hanHongKong`
    // (tên legacy). ⚠️ KHÔNG đọc `hanziSimplified` ở đây (đó là tên per-language của Case A).
    const payload = {
        id: draft.id,
        popularity: draft.popularity ?? draft.boost ?? null,
        readings,
    };
    if (isMandarin) {
        payload.hanziSimplified = (draft.hanSimplified ?? "").trim();
        payload.hanziTraditional = (draft.hanTraditional ?? "").trim();
        payload.hskLevel = (draft.hskLevel ?? "").trim();
        payload.relatedWords = draft.relatedWords ?? null;
    } else {
        // ⚠️ 2026-08-22: cantonese KHÔNG còn hanziSimplified (đã drop) — chỉ còn hanziTraditionalHk.
        payload.hanziTraditionalHk = (
            draft.hanziTraditionalHk ??
            draft.hanHongKong ??
            draft.hanTraditional ??
            ""
        ).trim();
        payload.pureCantonese = Boolean(draft.pureCantonese);
        payload.relatedWords = draft.relatedWords ?? null;
        // ⚠️ 2026-08-22: giữ audio CC101 khi save/sync — tránh mất audio (bug đã fix)
        payload.hanziAudio = draft.hanziAudio ?? null;
        payload.englishAudio = draft.englishAudio ?? null;
    }
    return payload;
}

export function migrateVocabulary(raw) {
    const { kanji, _searchBlob, _sortSeq, addedAt, definitions, mandarin, cantonese, metadata, ...rest } = raw;
    const isNewModel = (mandarin && typeof mandarin === "object") || (cantonese && typeof cantonese === "object");
    const source = isNewModel ? vocabNewToLegacy(raw) : raw;
    const timestamps = vocabTimestamps(source);
    return normalizeVocabularyFields({
        ...source,
        hanTraditional: source.hanTraditional ?? raw.hanTrad ?? raw.han ?? kanji ?? "",
        important: source.important ?? raw.important ?? false,
        mastered: source.mastered ?? raw.mastered ?? false,
        hskLevel: source.hskLevel ?? raw.hsk_level ?? undefined,
        pureCantonese: Boolean(source.pureCantonese ?? raw.pure_cantonese ?? false),
        ...timestamps,
    });
}

export function migrateGrammarBankItem(raw) {
    const { _searchBlob, _sortSeq, addedAt, ...rest } = raw;
    const timestamps = vocabTimestamps(raw);
    return {
        ...emptyGrammarBankItem(),
        ...rest,
        important: raw.important ?? false,
        mastered: raw.mastered ?? false,
        ...timestamps,
    };
}

/** Pre-index for stable sorting (client-only, not sent to API). */
export function indexVocabulary(vocab, sortSeq) {
    const migrated = migrateVocabulary(vocab);
    const seq = sortSeq ?? vocab._sortSeq;
    return {
        ...migrated,
        addedAt: vocabAddedAtMs(migrated),
        ...(seq !== undefined ? { _sortSeq: seq } : {}),
    };
}

export function indexGrammarItem(item, sortSeq) {
    const migrated = migrateGrammarBankItem(item);
    const seq = sortSeq ?? item._sortSeq;
    return {
        ...migrated,
        addedAt: vocabAddedAtMs(migrated),
        ...(seq !== undefined ? { _sortSeq: seq } : {}),
    };
}

export function stripSearchIndex(entity) {
    const { _searchBlob, _sortSeq, addedAt, definitions, ...rest } = entity;
    return rest;
}

export function indexVocabularies(vocabularies) {
    return vocabularies.map((vocab, index) => indexVocabulary(vocab, index));
}

export function indexGrammarBank(items) {
    return items.map((item, index) => indexGrammarItem(item, index));
}

export function indexCloudPayload({ vocabularies = [], grammars = [] }) {
    return {
        vocabularies: indexVocabularies(vocabularies),
        grammarBank: indexGrammarBank(grammars),
    };
}

export function updateVocabularyInList(vocabularies, id, patch) {
    return vocabularies.map((w) =>
        w.id === id ? indexVocabulary({ ...w, ...patch, _sortSeq: w._sortSeq }, w._sortSeq) : w,
    );
}

export function toggleVocabularyField(vocabularies, id, field) {
    return vocabularies.map((w) => (w.id === id ? indexVocabulary({ ...w, [field]: !w[field] }, w._sortSeq) : w));
}

export function deleteVocabularyFromList(vocabularies, id) {
    return vocabularies.filter((w) => w.id !== id);
}

export function updateGrammarInList(items, id, patch) {
    return items.map((g) => (g.id === id ? indexGrammarItem({ ...g, ...patch }, g._sortSeq) : g));
}

export function toggleGrammarField(items, id, field) {
    return items.map((g) => (g.id === id ? indexGrammarItem({ ...g, [field]: !g[field] }, g._sortSeq) : g));
}

export function deleteGrammarFromList(items, id) {
    return items.filter((g) => g.id !== id);
}
