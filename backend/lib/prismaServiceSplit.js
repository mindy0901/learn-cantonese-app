/**
 * Service TÁCH MANDARIN / CANTONESE (2026-08-17).
 *
 * Thay thế prismaService.js (model cũ gộp 2 ngôn ngữ + user_vocabularies).
 * Mỗi ngôn ngữ là 1 kho từ ĐỘC LẬP:
 *   mandarin:  MandarinVocabulary → MandarinVocabularyRomanization(pinyin) → Meaning(zh) → Example
 *   cantonese: CantoneseVocabulary → CantoneseVocabularyRomanization(jyutping) → Meaning(vi/en) → Example
 *
 * ⚠️ 2026-08-22: bỏ `yue` hoàn toàn khỏi cantonese (chỉ còn vi/en — meaning & example);
 * bỏ `hanzi_simplified` khỏi cantonese_vocabularies (chỉ còn hanziTraditionalHk).
 *
 * API object per language:
 *   mandarin:  { id, hanziSimplified, hanziTraditional, hanziCharacters, hskLevel, popularity,
 *                readings:[{id, pinyin, sinoVietnamese, meanings:[{id, category, zh, vi, en, examples:[{id, zh, romanization, vi, en}]}]}],
 *                createdAt, updatedAt }
 *   cantonese: { id, hanziTraditionalHk, hanziCharacters, pureCantonese, popularity,
 *                readings:[{id, jyutping, sinoVietnamese, meanings:[{id, category, vi, en, examples:[{id, romanization, vi, en}]}]}],
 *                createdAt, updatedAt }
 *
 * ⚠️ user_vocabularies ĐÃ BỎ — không còn progress/important/mastered.
 */
import { prisma } from "./prisma.js";
import { randomUUID } from "crypto";
import { computeHanCharacters, syncVocabularyHanCharacters } from "./hanCharacterBreakdown.js";
import { capitalizeSentences } from "./wordNormalize.js";
import { isSinoVietnameseDash } from "./sinoVietnameseMarkers.js";

/** "" khi giá trị là dash placeholder ("-" / "—" / "–") — chỉ placeholder hiển thị, KHÔNG phải data thật. */
const cleanSino = (v) => (isSinoVietnameseDash(v) ? "" : String(v ?? ""));

/** Loại bỏ dấu câu (CJK + ASCII) trong jyutping/pinyin — "ngo5 hai6..." → "ngo5 hai6" (2026-08-22).
 * ⚠️ GIỮ dấu nháy đơn `'` (pinyin hợp lệ: wǎn'ān) — chỉ bỏ dấu câu câu (chấm/phẩy/...). */
const cleanRomanization = (v) =>
    String(v ?? "")
        .replace(/[，。！？、；：（）《》「」『』【】—…,.;:!?()"“”]/gu, "")
        .replace(/\s+/g, " ")
        .trim();

// ── Cấu hình theo ngôn ngữ (map model Prisma + field) ──
const LANG = {
    mandarin: {
        vocab: "mandarinVocabulary",
        romanization: "mandarinVocabularyRomanization",
        meaning: "mandarinVocabularyMeaning",
        example: "mandarinVocabularyExample",
        vocabCharacter: "mandarinVocabularyCharacter",
        deckLink: "flashcardDeckMandarinVocabulary",
        setLink: "vocabularySetMandarinVocabulary",
        vocabIdField: "mandarinVocabularyId", // FK trên bảng romanization
        romanizationIdField: "mandarinVocabularyRomanizationId", // FK trên meaning
        meaningIdField: "mandarinVocabularyMeaningId", // FK trên example
        simpField: "hanziSimplified",
        hanField: "hanziTraditional",
        romanizationField: "pinyin",
        glossField: "zh",
        hasHsk: true,
        hasRelated: true, // cột related_words (JSONB) — chỉ mandarin (2026-08-22)
    },
    cantonese: {
        vocab: "cantoneseVocabulary",
        romanization: "cantoneseVocabularyRomanization",
        meaning: "cantoneseVocabularyMeaning",
        example: "cantoneseVocabularyExample",
        vocabCharacter: "cantoneseVocabularyCharacter",
        deckLink: "flashcardDeckCantoneseVocabulary",
        setLink: "vocabularySetCantoneseVocabulary",
        vocabIdField: "cantoneseVocabularyId",
        romanizationIdField: "cantoneseVocabularyRomanizationId",
        meaningIdField: "cantoneseVocabularyMeaningId",
        // ⚠️ 2026-08-22: cantonese KHÔNG còn simpField (hanzi_simplified đã drop) + KHÔNG có
        // glossField (yue đã bỏ — chỉ vi/en). Chỉ còn hanField = hanziTraditionalHk.
        hanField: "hanziTraditionalHk",
        romanizationField: "jyutping",
        hasHsk: false,
        hasRelated: true, // cột related_words (JSONB) — (2026-08-22, giống mandarin)
    },
};

export const LANGUAGES = ["mandarin", "cantonese"];

export function isLanguage(lang) {
    return Object.prototype.hasOwnProperty.call(LANG, lang);
}

// Shared include — 2 bên đều dùng relation `romanizations` → `meanings` → `examples`.
const vocabularyInclude = {
    romanizations: {
        include: {
            meanings: {
                include: { examples: {} },
            },
        },
    },
};
export { vocabularyInclude };

// ── Row ↔ API object ──

/** DB row (đã include) → API object per language. */
export function rowToVocabulary(row, lang) {
    const L = LANG[lang];
    const readingField = L.romanizationField;
    const glossField = L.glossField;
    const base = {
        id: row.id,
        [L.hanField]: row[L.hanField] ?? "",
        hanziCharacters: row.hanCharacters ?? null,
        popularity: row.popularity ?? null,
        readings: (row.romanizations ?? []).map((r) => ({
            id: r.id,
            [readingField]: r[readingField] ?? "",
            sinoVietnamese: cleanSino(r.sinoVietnamese),
            meanings: (r.meanings ?? []).map((m) => ({
                id: m.id,
                category: m.category ?? "",
                ...(glossField ? { [glossField]: m[glossField] ?? "" } : {}),
                vi: m.vi ?? "",
                en: m.en ?? "",
                examples: (m.examples ?? []).map((ex) => ({
                    id: ex.id,
                    ...(glossField ? { [glossField]: ex[glossField] ?? "" } : {}),
                    romanization: ex.romanization ?? "",
                    vi: ex.vi ?? "",
                    en: ex.en ?? "",
                    ...(lang === "cantonese"
                        ? {
                              yue: ex.yue ?? "", // chữ Hán câu ví dụ CC101 (2026-08-22: thêm lại)
                              hanziAudio: ex.hanziAudio ?? null,
                              englishAudio: ex.englishAudio ?? null,
                          }
                        : {}),
                })),
            })),
        })),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
    if (L.simpField) base.hanziSimplified = row[L.simpField] ?? "";
    if (lang === "cantonese") {
        base.hanziAudio = row.hanziAudio ?? null;
        base.englishAudio = row.englishAudio ?? null;
    }
    if (L.hasHsk) base.hskLevel = row.hskLevel ?? "";
    else base.pureCantonese = row.pureCantonese ?? false;
    if (L.hasRelated) base.relatedWords = row.relatedWords ?? null;
    return base;
}

/** Flat summary cho list/flashcard/set (1 đối tượng mỗi ngôn ngữ). */
export function vocabListSummary(row, lang) {
    const L = LANG[lang];
    const readings = row.romanizations ?? [];
    const firstMeaning = readings.flatMap((r) => r.meanings ?? [])[0];
    const out = {
        id: row.id,
        [L.hanField]: (row[L.hanField] ?? "").trim() || "",
        sinoVietnamese:
            readings
                .map((r) => cleanSino(r.sinoVietnamese).trim())
                .filter(Boolean)
                .join(" / ") || undefined,
        [L.romanizationField]:
            readings
                .map((r) =>
                    String(r[L.romanizationField] ?? "")
                        .trim()
                        .toLowerCase(),
                )
                .filter(Boolean)
                .join(" / ") || undefined,
        vietMeanings: firstMeaning ? firstMeaning.vi || (L.glossField ? firstMeaning[L.glossField] : "") || "" : "",
        engMeanings: firstMeaning?.en ?? "",
    };
    if (L.simpField) out.hanziSimplified = (row[L.simpField] ?? "").trim() || undefined;
    if (L.hasHsk) out.hskLevel = row.hskLevel ?? undefined;
    else out.pureCantonese = row.pureCantonese ?? false;
    return out;
}

/** API object → DB row fields (không gồm readings — ghi riêng qua writeVocabularyReadings).
 * ⚠️ 2026-08-18: cột han/hsk_level NOT NULL DEFAULT '' trong DB → dùng `""` thay `null`
 * (Prisma String? cho phép null nhưng DB từ chối → P2011 Null constraint violation). */
export function vocabularyToRow(body, lang) {
    const L = LANG[lang];
    const row = {
        id: body?.id || randomUUID(),
        [L.hanField]: String(body?.[L.hanField] ?? "").trim(),
        popularity: body?.popularity ?? null,
    };
    if (L.simpField) row[L.simpField] = String(body?.hanziSimplified ?? "").trim() || "";
    if (L.hasHsk) row.hskLevel = String(body?.hskLevel ?? "").trim() || "";
    else row.pureCantonese = Boolean(body?.pureCantonese);
    if (lang === "cantonese") {
        row.hanziAudio = body?.hanziAudio ?? null;
        row.englishAudio = body?.englishAudio ?? null;
    }
    if (L.hasRelated) {
        const rw = normalizeRelatedWords(body?.relatedWords);
        const hasData = Array.isArray(rw.compound)
            ? rw.compound.length || rw.synonyms.length || rw.antonyms.length
            : Object.keys(rw).length > 0;
        if (hasData) row.relatedWords = rw;
    }
    return row;
}

/** Chuẩn hóa relatedWords (từ ghép/đồng nghĩa/trái nghĩa).
 * ⚠️ 2026-08-22: shape mới = MAP theo pinyin (đổi reading là đổi related):
 *   { "<pinyin>": { compound: [{han,sino}], synonyms:[...], antonyms:[...] }, ... }
 * Vẫn chấp nhận shape cũ (không key pinyin) khi chỉ có 1 reading. */
export function normalizeRelatedWords(rw) {
    const arr = (v) =>
        Array.isArray(v)
            ? v
            : typeof v === "string"
              ? String(v)
                    .split(/[;；,，、]/)
                    .map((s) => s.trim())
                    .filter(Boolean)
              : [];
    const normItem = (it) => {
        if (it && typeof it === "object") {
            const han = String(it?.han ?? "").trim();
            return han || null;
        }
        const han = String(it ?? "").trim();
        return han || null;
    };
    const normGroup = (g) => {
        const ng = {
            compound: arr(g?.compound).map(normItem).filter(Boolean),
            synonyms: arr(g?.synonyms ?? g?.syno)
                .map(normItem)
                .filter(Boolean),
            antonyms: arr(g?.antonyms ?? g?.anto)
                .map(normItem)
                .filter(Boolean),
        };
        return ng;
    };
    const hasData = (g) => g.compound.length || g.synonyms.length || g.antonyms.length;
    // Map theo pinyin (không có key compound/synonyms/antonyms ở top-level).
    if (rw && typeof rw === "object" && !Array.isArray(rw) && !Array.isArray(rw.compound)) {
        const out = {};
        for (const [py, g] of Object.entries(rw)) {
            if (!g || typeof g !== "object") continue;
            const ng = normGroup(g);
            if (hasData(ng)) out[py] = ng;
        }
        return out;
    }
    return normGroup(rw);
}

/** Chuẩn hóa payload readings → gán id (randomUUID) + default field, giữ key order chuẩn. */
export function normalizeReadings(body, lang) {
    const L = LANG[lang];
    const readingField = L.romanizationField;
    const glossField = L.glossField;
    return (body?.readings ?? []).map((r, ri) => ({
        id: r?.id || randomUUID(),
        [readingField]: cleanRomanization(String(r?.[readingField] ?? "").toLowerCase()),
        sinoVietnamese: cleanSino(r?.sinoVietnamese),
        meanings: (r?.meanings ?? []).map((m, mi) => ({
            id: m?.id || randomUUID(),
            category: String(m?.category ?? ""),
            ...(glossField ? { [glossField]: String(m?.[glossField] ?? "") } : {}),
            vi: String(m?.vi ?? ""),
            en: String(m?.en ?? ""),
            position: m?.position ?? mi,
            examples: (m?.examples ?? []).map((ex, ei) => ({
                id: ex?.id || randomUUID(),
                ...(glossField ? { [glossField]: String(ex?.[glossField] ?? "") } : {}),
                romanization: cleanRomanization(String(ex?.romanization ?? "")),
                vi: String(ex?.vi ?? ""),
                en: String(ex?.en ?? ""),
                ...(lang === "cantonese"
                    ? {
                          yue: String(ex?.yue ?? ""), // chữ Hán câu ví dụ CC101 (2026-08-22: thêm lại)
                          hanziAudio: ex?.hanziAudio ?? null,
                          englishAudio: ex?.englishAudio ?? null,
                      }
                    : {}),
                position: ex?.position ?? ei,
            })),
        })),
    }));
}

/**
 * Ghi readings/meanings/examples cho 1 vocabulary (bảng quan hệ).
 * Xóa readings cũ (cascade meanings/examples) rồi tạo lại từ payload readings.
 */
async function writeVocabularyReadings(lang, vocabId, readings) {
    const L = LANG[lang];
    await prisma[L.romanization].deleteMany({ where: { [L.vocabIdField]: vocabId } });
    for (const r of readings ?? []) {
        const rom = await prisma[L.romanization].create({
            data: {
                id: r?.id || randomUUID(),
                [L.vocabIdField]: vocabId,
                [L.romanizationField]: cleanRomanization(String(r?.[L.romanizationField] ?? "")),
                sinoVietnamese: cleanSino(r?.sinoVietnamese),
            },
        });
        for (const m of r?.meanings ?? []) {
            const meaning = await prisma[L.meaning].create({
                data: {
                    id: m?.id || randomUUID(),
                    [L.romanizationIdField]: rom.id,
                    category: String(m?.category ?? ""),
                    ...(L.glossField ? { [L.glossField]: String(m?.[L.glossField] ?? "") } : {}),
                    vi: String(m?.vi ?? ""),
                    en: String(m?.en ?? ""),
                },
            });
            for (const ex of m?.examples ?? []) {
                await prisma[L.example].create({
                    data: {
                        id: ex?.id || randomUUID(),
                        [L.meaningIdField]: meaning.id,
                        ...(L.glossField ? { [L.glossField]: String(ex?.[L.glossField] ?? "") } : {}),
                        ...(lang === "cantonese" ? { yue: String(ex?.yue ?? "") } : {}), // chữ Hán câu ví dụ CC101
                        romanization: cleanRomanization(String(ex?.romanization ?? "")),
                        vi: String(ex?.vi ?? ""),
                        en: String(ex?.en ?? ""),
                        ...(lang === "cantonese"
                            ? { hanziAudio: ex?.hanziAudio ?? null, englishAudio: ex?.englishAudio ?? null }
                            : {}),
                    },
                });
            }
        }
    }
}

/** Recompute + lưu hanCharacters JSON + sync kho HanCharacter cho 1 vocab. */
async function refreshHanCharacters(lang, vocabId) {
    const L = LANG[lang];
    const full = await prisma[L.vocab].findUnique({
        where: { id: vocabId },
        include: vocabularyInclude,
    });
    const breakdown = computeHanCharacters(full ?? {}, lang);
    if (breakdown.length > 0) {
        await prisma[L.vocab].update({
            where: { id: vocabId },
            data: { hanziCharacters: breakdown, updatedAt: new Date() },
        });
        await syncVocabularyHanCharacters(lang, vocabId, breakdown);
    } else {
        await prisma[L.vocab].update({
            where: { id: vocabId },
            data: { hanziCharacters: null, updatedAt: new Date() },
        });
    }
}

// ── Fetch ──

/** Full snapshot: 2 kho từ + grammars + han characters. */
export async function fetchAppData() {
    const [mandarin, cantonese, grammars, hanCharacters] = await Promise.all([
        prisma.mandarinVocabulary.findMany({ include: vocabularyInclude }),
        prisma.cantoneseVocabulary.findMany({ include: vocabularyInclude }),
        prisma.grammar.findMany({ include: { grammarExamples: {} } }),
        prisma.hanziCharacter.findMany(),
    ]);
    return {
        mandarinVocabularies: mandarin.map((v) => rowToVocabulary(v, "mandarin")),
        cantoneseVocabularies: cantonese.map((v) => rowToVocabulary(v, "cantonese")),
        grammars: grammars.map(rowToGrammar),
        hanCharacters: hanCharacters.map(rowToHanCharacter),
    };
}

export async function fetchAllData() {
    return fetchAppData();
}

// ── Query (browse) per language ──

const SORT_FIELDS = {
    mandarin: ["hanziSimplified", "hanziTraditional", "hskLevel", "createdAt", "updatedAt", "popularity"],
    cantonese: ["hanziTraditionalHk", "createdAt", "updatedAt", "popularity"],
};

export async function queryVocabularies(
    lang,
    {
        page = 1,
        pageSize = 10,
        sortKey = "createdAt",
        sortDir = "desc",
        search = "",
        hskLevel = null,
        pureCantonese = null,
    } = {},
) {
    const L = LANG[lang];
    const safePageSize = Math.min(50, Math.max(1, Number(pageSize) || 10));
    const safePage = Math.max(1, Number(page) || 1);

    const wordWhere = {};
    if (lang === "mandarin") {
        if (hskLevel === "hsk") wordWhere.hskLevel = { not: null };
        else if (hskLevel === "legacy") wordWhere.hskLevel = null;
        else if (hskLevel && hskLevel !== "all") wordWhere.hskLevel = hskLevel;
    } else if (pureCantonese === true || pureCantonese === "true") {
        wordWhere.pureCantonese = true;
    } else if (pureCantonese === false || pureCantonese === "false") {
        wordWhere.pureCantonese = false;
    }

    if (search && search.trim()) {
        const q = search.trim();
        wordWhere.OR = [
            { [L.hanField]: { contains: q, mode: "insensitive" } },
            { romanizations: { some: { [L.romanizationField]: { contains: q, mode: "insensitive" } } } },
        ];
        if (L.simpField) wordWhere.OR.unshift({ [L.simpField]: { contains: q, mode: "insensitive" } });
    }

    const allowed = SORT_FIELDS[lang];
    const sortField = allowed.includes(sortKey) ? sortKey : "createdAt";
    const orderBy = [{ [sortField]: sortDir === "asc" ? "asc" : "desc" }];

    const [items, total] = await Promise.all([
        prisma[L.vocab].findMany({
            where: wordWhere,
            orderBy,
            skip: (safePage - 1) * safePageSize,
            take: safePageSize,
            include: vocabularyInclude,
        }),
        prisma[L.vocab].count({ where: wordWhere }),
    ]);

    return {
        items: items.map((v) => rowToVocabulary(v, lang)),
        total,
        page: safePage,
        pageSize: safePageSize,
    };
}

export async function fetchVocabulariesByIds(lang, ids) {
    const L = LANG[lang];
    if (!ids.length) return [];
    const rows = await prisma[L.vocab].findMany({
        where: { id: { in: ids } },
        include: vocabularyInclude,
    });
    return rows.map((v) => rowToVocabulary(v, lang));
}

/** Tra cứu chính xác theo hán tự (dedupe tạo từ mới). */
export async function findVocabularyByHan(lang, han) {
    const L = LANG[lang];
    if (!han) return { items: [] };
    const hanWhere = [{ [L.hanField]: { equals: han, mode: "insensitive" } }];
    if (L.simpField) hanWhere.unshift({ [L.simpField]: { equals: han, mode: "insensitive" } });
    const rows = await prisma[L.vocab].findMany({
        where: { OR: hanWhere },
        take: 20,
        include: vocabularyInclude,
    });
    return { items: rows.map((v) => vocabListSummary(v, lang)) };
}

/**
 * Gợi ý giản thể cho form HK (cột phải hero Cantonese, 2026-08-20):
 * convert HK → giản thể qua `hk2s` (opencc), CHỈ trả khi kết quả tìm thấy trong
 * kho Mandarin (hanziSimplified khớp). Fallback: `hk2t` → phồn thể chuẩn, tìm
 * trong `hanziTraditional` của Mandarin. Không có → `found:false`.
 */
export async function findSimplifiedSuggestion(hk) {
    const source = String(hk ?? "").trim();
    if (!source) return { found: false, simplified: "" };
    const { hk2s, hk2t } = await import("./openccHK.js");
    const simplified = String(hk2s(source)).trim();
    const traditional = String(hk2t(source)).trim();

    // 1) Ưu tiên giản thể (hk2s → hanziSimplified).
    const simpRows =
        simplified && simplified !== source
            ? await prisma.mandarinVocabulary.findMany({
                  where: { hanziSimplified: simplified },
                  take: 20,
                  include: vocabularyInclude,
              })
            : [];
    if (simpRows.length) {
        const first = vocabListSummary(simpRows[0], "mandarin");
        return {
            found: true,
            matchedAs: "simplified",
            simplified,
            pinyin: first.pinyin ?? "",
            sinoVietnamese: first.sinoVietnamese ?? "",
            items: simpRows.map((v) => vocabListSummary(v, "mandarin")),
        };
    }

    // 2) Fallback: phồn thể chuẩn (hk2t → hanziTraditional) — vẫn trả GIẢN THỂ của từ mandarin khớp
    //    (display luôn là simp — app học cantonese HK trad + mandarin mainland simp, 2026-08-20).
    const tradRows = traditional
        ? await prisma.mandarinVocabulary.findMany({
              where: { hanziTraditional: traditional },
              take: 20,
              include: vocabularyInclude,
          })
        : [];
    if (tradRows.length) {
        const first = vocabListSummary(tradRows[0], "mandarin");
        return {
            found: true,
            matchedAs: "traditional",
            simplified: first.hanziSimplified ?? traditional,
            pinyin: first.pinyin ?? "",
            sinoVietnamese: first.sinoVietnamese ?? "",
            items: tradRows.map((v) => vocabListSummary(v, "mandarin")),
        };
    }
    return { found: false, simplified: simplified || traditional };
}

/**
 * Precompute TOÀN BỘ map HK → gợi ý mandarin (2026-08-21).
 * Frontend dùng map này khi load (lần đầu/F5/đổi mode cantonese) → khi click vocab
 * chỉ TRA MAP, KHÔNG gọi /hanzi/simplified-suggestion từng từ (hết giật).
 * Cache theo signature (count + max updatedAt của 2 bảng) — data đổi thì tự rebuild.
 *
 * Cơ chế 1 entry (HK form → simplified):
 *   1) `hk2s(source)` → tìm trong mandarin bank theo `hanziSimplified`.
 *      Nếu tìm thấy → lấy chính `hanziSimplified` của vocab đó bỏ vào map.
 *   2) KHÔNG tìm thấy → fallback `hk2t(source)` → tìm trong mandarin bank theo `hanziTraditional`.
 *      Nếu tìm thấy → kiểm tra vocab đó CÓ `hanziSimplified` (khác rỗng) không:
 *        - có → trả về `hanziSimplified` đó.
 *        - không có → KHÔNG lấy (found = false).
 *   3) TUYỆT ĐỐI KHÔNG trả về hanzi traditional dưới dạng simplified.
 */
let hkSuggestionMapCache = { key: "", map: null };

export async function buildHkSuggestionMap() {
    const [mandarin, cantonese] = await Promise.all([
        prisma.mandarinVocabulary.findMany({ include: vocabularyInclude }),
        prisma.cantoneseVocabulary.findMany({
            select: { hanziTraditionalHk: true, updatedAt: true },
        }),
    ]);
    const mMax = mandarin.reduce((a, v) => (v.updatedAt > a ? v.updatedAt : a), new Date(0)).getTime();
    const cMax = cantonese.reduce((a, v) => (v.updatedAt > a ? v.updatedAt : a), new Date(0)).getTime();
    const key = `${mandarin.length}:${mMax}:${cantonese.length}:${cMax}`;
    if (hkSuggestionMapCache.key === key) return hkSuggestionMapCache.map;

    // Lookup maps từ mandarin bank (giống findSimplifiedSuggestion nhưng in-memory).
    const bySimplified = new Map();
    const byTraditional = new Map();
    for (const v of mandarin) {
        const s = (v.hanziSimplified ?? "").trim();
        const t = (v.hanziTraditional ?? "").trim();
        if (s && !bySimplified.has(s)) bySimplified.set(s, vocabListSummary(v, "mandarin"));
        if (t && !byTraditional.has(t)) byTraditional.set(t, vocabListSummary(v, "mandarin"));
    }
    const { hk2s, hk2t } = await import("./openccHK.js");
    const map = {};
    const seen = new Set();
    for (const c of cantonese) {
        const source = (c.hanziTraditionalHk ?? "").trim();
        if (!source || seen.has(source)) continue;
        seen.add(source);
        const simplified = String(hk2s(source)).trim();
        const traditional = String(hk2t(source)).trim();
        // Giá trị simplified CỦA VOCAB MANDARIN (chỉ chấp nhận giản thể thật, KHÔNG bao giờ
        // fallback sang traditional). Rỗng = found false → không lưu entry.
        let simplifiedOut = "";
        // 1) Ưu tiên hk2s → tìm theo hanziSimplified.
        if (simplified) {
            const hit = bySimplified.get(simplified);
            if (hit && (hit.hanziSimplified ?? "").trim()) simplifiedOut = hit.hanziSimplified;
        }
        // 2) Fallback hk2t → tìm theo hanziTraditional; CHỈ lấy nếu vocab đó có hanziSimplified.
        if (!simplifiedOut && traditional) {
            const hit = byTraditional.get(traditional);
            if (hit && (hit.hanziSimplified ?? "").trim()) simplifiedOut = hit.hanziSimplified;
        }
        // 3) Có simplified thật mới lưu; không có → bỏ qua (found = false).
        if (simplifiedOut) {
            map[source] = { simplified: simplifiedOut };
        }
    }
    hkSuggestionMapCache = { key, map };
    return map;
}

// ── CRUD per language ──

export async function createVocabulary(lang, body) {
    const L = LANG[lang];
    const readings = normalizeReadings(body, lang);
    const row = vocabularyToRow(body, lang);
    const vocab = await prisma[L.vocab].create({ data: row });
    await writeVocabularyReadings(lang, vocab.id, readings);
    await refreshHanCharacters(lang, vocab.id);
    const full = await prisma[L.vocab].findUnique({ where: { id: vocab.id }, include: vocabularyInclude });
    return rowToVocabulary(full, lang);
}

export async function updateVocabulary(lang, id, body) {
    const L = LANG[lang];
    const existing = await prisma[L.vocab].findUnique({ where: { id } });
    if (!existing) throw Object.assign(new Error("Vocabulary not found"), { statusCode: 404 });

    const row = vocabularyToRow({ ...body, id }, lang);
    const relatedWords = L.hasRelated && body?.relatedWords ? normalizeRelatedWords(body.relatedWords) : undefined;
    await prisma[L.vocab].update({
        where: { id },
        data: {
            ...(L.simpField ? { [L.simpField]: row[L.simpField] ?? undefined } : {}),
            [L.hanField]: row[L.hanField],
            ...(L.hasHsk ? { hskLevel: row.hskLevel ?? undefined } : { pureCantonese: row.pureCantonese }),
            ...(row.popularity !== null ? { popularity: row.popularity } : {}),
            ...(L.hasRelated ? { relatedWords: relatedWords ?? undefined } : {}),
            ...(lang === "cantonese"
                ? { hanziAudio: row.hanziAudio ?? undefined, englishAudio: row.englishAudio ?? undefined }
                : {}),
            updatedAt: new Date(),
        },
    });

    if (Array.isArray(body?.readings)) {
        const readings = normalizeReadings(body, lang);
        await writeVocabularyReadings(lang, id, readings);
    }
    await refreshHanCharacters(lang, id);

    const full = await prisma[L.vocab].findUnique({ where: { id }, include: vocabularyInclude });
    return rowToVocabulary(full, lang);
}

export async function deleteVocabulary(lang, id) {
    const L = LANG[lang];
    await prisma[L.vocab].delete({ where: { id } }).catch(() => {});
}

// ── Grammar (không đổi — không tách ngôn ngữ) ──

export function grammarToRow(item, userId, { includeCreatedAt = true } = {}) {
    const now = new Date().toISOString();
    return {
        id: item.id,
        userId,
        title: item.title ?? "",
        content: item.content ?? "",
        details: Array.isArray(item.details) ? item.details : [],
        notes: Array.isArray(item.notes) ? item.notes : [],
        structure: item.structure ?? "",
        important: item.important ?? false,
        mastered: item.mastered ?? false,
        createdAt: includeCreatedAt ? (item.createdAt ?? now) : undefined,
        updatedAt: now,
    };
}

export function rowToGrammar(row) {
    return {
        id: row.id,
        title: row.title ?? "",
        content: row.content ?? "",
        details: row.details ?? [],
        notes: row.notes ?? [],
        structure: row.structure ?? "",
        important: row.important ?? false,
        mastered: row.mastered ?? false,
        createdAt: row.createdAt ?? row.updatedAt,
        updatedAt: row.updatedAt ?? row.createdAt,
        examples: (row.grammarExamples ?? []).map((ex) => ({
            id: ex.id,
            hanExample: ex.hanExample ?? "",
            jyutpingExample: ex.jyutpingExample ?? "",
            pinyinExample: ex.pinyinExample ?? "",
            vietExample: ex.vietExample ?? "",
            engExample: ex.engExample ?? "",
            position: ex.position ?? 0,
        })),
    };
}

async function upsertGrammarExamples(grammarId, examples) {
    await prisma.grammarExample.deleteMany({ where: { grammarId } });
    if (Array.isArray(examples) && examples.length > 0) {
        for (let i = 0; i < examples.length; i++) {
            const ex = examples[i];
            await prisma.grammarExample.create({
                data: {
                    id: ex.id || randomUUID(),
                    grammarId,
                    hanExample: ex.hanExample ?? "",
                    jyutpingExample: ex.jyutpingExample ?? "",
                    pinyinExample: ex.pinyinExample ?? "",
                    vietExample: ex.vietExample ?? "",
                    engExample: ex.engExample ?? "",
                    position: ex.position ?? i,
                },
            });
        }
    }
}

export async function createGrammar(userId, body) {
    const row = grammarToRow(body, userId);
    const { id, createdAt, updatedAt, examples, ...data } = row;
    await prisma.grammar.create({ data: { id, ...data } });
    await upsertGrammarExamples(id, body.examples);
    const full = await prisma.grammar.findUnique({ where: { id }, include: { grammarExamples: {} } });
    return rowToGrammar(full);
}

export async function updateGrammar(userId, id, body) {
    const row = grammarToRow({ ...body, id }, userId, { includeCreatedAt: false });
    const { createdAt, examples, ...data } = row;
    await prisma.grammar.update({ where: { id_userId: { id, userId } }, data });
    await upsertGrammarExamples(id, body.examples);
    const full = await prisma.grammar.findUnique({ where: { id }, include: { grammarExamples: {} } });
    return rowToGrammar(full);
}

export async function deleteGrammar(userId, id) {
    await prisma.grammar.delete({ where: { id_userId: { id, userId } } });
}

// ── Han Character (không đổi bảng — chỉ bỏ field đã xóa) ──

export function hanCharacterToRow(item) {
    const readings = Array.isArray(item.sinoVietnamese)
        ? item.sinoVietnamese.map((r) => String(r ?? "").trim()).filter(Boolean)
        : String(item.sinoVietnamese ?? "").trim()
          ? [String(item.sinoVietnamese).trim()]
          : [];
    const parseArr = (val) => {
        if (Array.isArray(val)) return val.map((r) => String(r ?? "").trim()).filter(Boolean);
        const s = String(val ?? "").trim();
        return s ? [s] : [];
    };
    const now = new Date().toISOString();
    return {
        id: item.id,
        hanSimplified: item.hanSimplified ?? undefined,
        hanTraditional: item.hanTraditional || item.hanSimplified || "",
        sinoVietnamese: readings.length > 0 ? readings : [],
        jyutping: parseArr(item.jyutping),
        pinyin: parseArr(item.pinyin),
        strokeCount: item.strokeCount ?? null,
        popularity: item.popularity ?? null,
        createdAt: item.createdAt ?? now,
        updatedAt: now,
    };
}

export function rowToHanCharacter(row) {
    return {
        id: row.id,
        hanSimplified: row.hanSimplified ?? "",
        hanTraditional: row.hanTraditional ?? undefined,
        sinoVietnamese: row.sinoVietnamese ?? [],
        jyutping: row.jyutping ?? [],
        pinyin: row.pinyin ?? [],
        strokeCount: row.strokeCount ?? null,
        popularity: row.popularity ?? null,
        createdAt: row.createdAt ?? row.updatedAt,
        updatedAt: row.updatedAt ?? row.createdAt,
    };
}

export async function createHanChar(userId, body) {
    const row = hanCharacterToRow(body);
    const { id, createdAt, updatedAt, ...rest } = row;
    const created = await prisma.hanziCharacter.create({
        data: {
            id: id || randomUUID(),
            hanSimplified: rest.hanSimplified || null,
            hanTraditional: rest.hanTraditional || rest.hanSimplified || "",
            sinoVietnamese: rest.sinoVietnamese || [],
            jyutping: rest.jyutping || [],
            pinyin: rest.pinyin || [],
            strokeCount: rest.strokeCount ?? null,
            popularity: rest.popularity ?? null,
        },
    });
    return rowToHanCharacter(created);
}

export async function updateHanChar(userId, id, body) {
    const row = hanCharacterToRow({ ...body, id });
    const { createdAt, ...rest } = row;
    const data = {};
    if (rest.hanSimplified !== undefined) data.hanSimplified = rest.hanSimplified || null;
    if (rest.hanTraditional !== undefined) data.hanTraditional = rest.hanTraditional;
    if (rest.sinoVietnamese !== undefined) data.sinoVietnamese = rest.sinoVietnamese;
    if (rest.jyutping !== undefined) data.jyutping = rest.jyutping;
    if (rest.pinyin !== undefined) data.pinyin = rest.pinyin;
    if (rest.strokeCount !== undefined) data.strokeCount = rest.strokeCount;
    if (rest.popularity !== undefined) data.popularity = rest.popularity;
    data.updatedAt = new Date();
    const updated = await prisma.hanziCharacter.update({ where: { id }, data });
    return rowToHanCharacter(updated);
}

export async function deleteHanChar(userId, id) {
    await prisma.hanziCharacter.delete({ where: { id } });
}

// ── Flashcard Deck (link table tách theo ngôn ngữ) ──

function rowToFlashcardDeck(row) {
    const mandarin = row.mandarinVocabularies ?? [];
    const cantonese = row.cantoneseVocabularies ?? [];
    return {
        id: row.id,
        name: row.name ?? "",
        description: row.description ?? "",
        color: row.color ?? "",
        mandarinCount: mandarin.length,
        cantoneseCount: cantonese.length,
        vocabularyCount: mandarin.length + cantonese.length,
        mandarinVocabularies: mandarin.map((dv) => ({
            id: dv.mandarinVocabularyId,
            position: dv.position,
            ...(dv.mandarinVocabulary ? vocabListSummary(dv.mandarinVocabulary, "mandarin") : {}),
        })),
        cantoneseVocabularies: cantonese.map((dv) => ({
            id: dv.cantoneseVocabularyId,
            position: dv.position,
            ...(dv.cantoneseVocabulary ? vocabListSummary(dv.cantoneseVocabulary, "cantonese") : {}),
        })),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

export async function getFlashcardDecks(userId) {
    const decks = await prisma.flashcardDeck.findMany({
        where: { userId },
        include: {
            mandarinVocabularies: { orderBy: { position: "asc" } },
            cantoneseVocabularies: { orderBy: { position: "asc" } },
        },
        orderBy: { createdAt: "desc" },
    });
    return decks.map(rowToFlashcardDeck);
}

export async function getFlashcardDeck(userId, id) {
    const deck = await prisma.flashcardDeck.findUnique({
        where: { id_userId: { id, userId } },
        include: {
            mandarinVocabularies: {
                orderBy: { position: "asc" },
                include: { mandarinVocabulary: { include: vocabularyInclude } },
            },
            cantoneseVocabularies: {
                orderBy: { position: "asc" },
                include: { cantoneseVocabulary: { include: vocabularyInclude } },
            },
        },
    });
    if (!deck) return null;
    return rowToFlashcardDeck(deck);
}

export async function createFlashcardDeck(userId, body) {
    const id = body.id ?? randomUUID();
    const created = await prisma.flashcardDeck.create({
        data: { id, userId, name: body.name ?? "", description: body.description ?? "", color: body.color ?? "" },
    });
    return rowToFlashcardDeck(created);
}

export async function updateFlashcardDeck(userId, id, body) {
    const updated = await prisma.flashcardDeck.update({
        where: { id_userId: { id, userId } },
        data: {
            ...(body.name !== undefined && { name: body.name }),
            ...(body.description !== undefined && { description: body.description }),
            ...(body.color !== undefined && { color: body.color }),
            updatedAt: new Date(),
        },
    });
    return rowToFlashcardDeck(updated);
}

export async function deleteFlashcardDeck(userId, id) {
    await prisma.flashcardDeck.delete({ where: { id_userId: { id, userId } } });
}

export async function addVocabularyToDeck(lang, userId, deckId, vocabularyId) {
    const L = LANG[lang];
    const deck = await prisma.flashcardDeck.findUnique({ where: { id_userId: { id: deckId, userId } } });
    if (!deck) throw Object.assign(new Error("Deck not found"), { statusCode: 404 });
    const lastItem = await prisma[L.deckLink].findFirst({ where: { deckId }, orderBy: { position: "desc" } });
    const nextPosition = (lastItem?.position ?? -1) + 1;
    try {
        const created = await prisma[L.deckLink].create({
            data: { deckId, [L.vocabIdField]: vocabularyId, position: nextPosition },
            include: { [L.vocab]: { include: vocabularyInclude } },
        });
        return { ...vocabListSummary(created[L.vocab], lang), position: created.position };
    } catch (err) {
        if (err?.code === "P2002") {
            throw Object.assign(new Error("Vocabulary already in deck"), { statusCode: 409 });
        }
        throw err;
    }
}

export async function removeVocabularyFromDeck(lang, userId, deckId, vocabularyId) {
    const L = LANG[lang];
    const deck = await prisma.flashcardDeck.findUnique({ where: { id_userId: { id: deckId, userId } } });
    if (!deck) throw Object.assign(new Error("Deck not found"), { statusCode: 404 });
    await prisma[L.deckLink].delete({
        where: { deckId_vocabularyId: { deckId, vocabularyId } },
    });
}

// ── Vocabulary Sets (link table tách theo ngôn ngữ) ──

async function setToObject(set) {
    return {
        id: set.id,
        name: set.name ?? "",
        description: set.description ?? "",
        color: set.color ?? "",
        mandarinCount: set.mandarinVocabularies?.length ?? 0,
        cantoneseCount: set.cantoneseVocabularies?.length ?? 0,
        mandarinVocabularyIds: (set.mandarinVocabularies ?? []).map((v) => v.mandarinVocabularyId),
        cantoneseVocabularyIds: (set.cantoneseVocabularies ?? []).map((v) => v.cantoneseVocabularyId),
        createdAt: set.createdAt,
        updatedAt: set.updatedAt,
    };
}

export async function getVocabularySets(userId) {
    const sets = await prisma.vocabularySet.findMany({
        where: { userId },
        include: {
            mandarinVocabularies: { select: { mandarinVocabularyId: true } },
            cantoneseVocabularies: { select: { cantoneseVocabularyId: true } },
        },
        orderBy: { createdAt: "desc" },
    });
    return Promise.all(sets.map(setToObject));
}

export async function createVocabularySet(userId, body) {
    const id = body.id ?? randomUUID();
    const created = await prisma.vocabularySet.create({
        data: { id, userId, name: body.name ?? "", description: body.description ?? "", color: body.color ?? "" },
    });
    return setToObject(created);
}

export async function updateVocabularySet(userId, id, body) {
    const updated = await prisma.vocabularySet.update({
        where: { id_userId: { id, userId } },
        data: {
            ...(body.name !== undefined && { name: body.name }),
            ...(body.description !== undefined && { description: body.description }),
            ...(body.color !== undefined && { color: body.color }),
            updatedAt: new Date(),
        },
    });
    return setToObject(updated);
}

export async function deleteVocabularySet(userId, id) {
    await prisma.vocabularySet.delete({ where: { id_userId: { id, userId } } });
}

export async function addVocabularyToSet(lang, userId, setId, vocabularyId) {
    const L = LANG[lang];
    const set = await prisma.vocabularySet.findUnique({ where: { id_userId: { id: setId, userId } } });
    if (!set) throw Object.assign(new Error("Set not found"), { statusCode: 404 });
    const lastItem = await prisma[L.setLink].findFirst({ where: { setId }, orderBy: { position: "desc" } });
    const nextPosition = (lastItem?.position ?? -1) + 1;
    try {
        await prisma[L.setLink].create({ data: { setId, [L.vocabIdField]: vocabularyId, position: nextPosition } });
        return { ok: true };
    } catch (err) {
        if (err?.code === "P2002") throw Object.assign(new Error("Vocabulary already in set"), { statusCode: 409 });
        throw err;
    }
}

export async function removeVocabularyFromSet(lang, userId, setId, vocabularyId) {
    const L = LANG[lang];
    const set = await prisma.vocabularySet.findUnique({ where: { id_userId: { id: setId, userId } } });
    if (!set) throw Object.assign(new Error("Set not found"), { statusCode: 404 });
    await prisma[L.setLink].delete({ where: { setId_vocabularyId: { setId, vocabularyId } } });
}

// ── Resolve user ──

export async function resolveReadUserId(session) {
    if (session?.userId) return session.userId;
    return null;
}
