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
 *                readings:[{id, pinyin, sinoVietnamese, meanings:[{id, zh, vi, en, examples:[{id, zh, romanization, vi, en}]}]}],
 *                createdAt, updatedAt }
 *   cantonese: { id, hanziTraditionalHk, hanziCharacters, pureCantonese, popularity,
 *                readings:[{id, jyutping, sinoVietnamese, meanings:[{id, vi, en, examples:[{id, romanization, vi, en}]}]}],
 *                createdAt, updatedAt }
 *
 * ⚠️ user_vocabularies ĐÃ BỎ — không còn progress/important/mastered.
 */
import { prisma } from "./prisma.js";
import { randomUUID } from "crypto";
import { createHash } from "crypto";
import { computeHanCharacters } from "./hanCharacterBreakdown.js";
import { capitalizeSentences } from "./wordNormalize.js";
import { isSinoVietnameseDash } from "./sinoVietnameseMarkers.js";
import { deleteR2Object, r2Head } from "./r2.js";

/** "" khi giá trị là dash placeholder ("-" / "—" / "–") — chỉ placeholder hiển thị, KHÔNG phải data thật. */
const cleanSino = (v) => (isSinoVietnameseDash(v) ? "" : String(v ?? ""));

/** Loại bỏ dấu câu (CJK + ASCII) trong jyutping/pinyin — "ngo5 hai6..." → "ngo5 hai6" (2026-08-22).
 * ⚠️ GIỮ dấu nháy đơn `'` (pinyin hợp lệ: wǎn'ān) — chỉ bỏ dấu câu câu (chấm/phẩy/...). */
const cleanRomanization = (v) =>
    String(v ?? "")
        .replace(/[，。！？、；：（）《》「」『』【】—…,.;:!?()"“”]/gu, "")
        .replace(/\s+/g, " ")
        .trim();

/** Bỏ dấu câu CUỐI (Latin + CJK + khoảng trắng) — dùng cho nghĩa/ví dụ khi LƯU (2026-09-08).
 *  VD "加一等於六。" → "加一等於六"; "To go!" → "To go". Chỉ cắt CUỐI chuỗi, giữ dấu bên trong. */
const TRAILING_PUNCT_RE = /(?:\.{2,}|[\s.,?!…:;，。！？、])+$/u;
function stripTrailingPunct(value) {
    let s = String(value ?? "").trim();
    while (s.length > 0) {
        const next = s.replace(TRAILING_PUNCT_RE, "").trim();
        if (next === s) break;
        s = next;
    }
    return s;
}

/** Tách senses theo dấu phân tách (`,` `;` `；` `、` `/`) → dedupe case-insensitive → nối ", ".
 *  Fix full sync: vi nhiều nghĩa ("Đấu tranh, đánh nhau, đánh") → dịch en ra "fight, fight, fight"
 *  → gộp thành "fight" (2026-09-01). 2026-09-05: tách cả `/` — "some / some / some" → "some";
 *  chuỗi KHÔNG trùng (vd "啊 / 呀") giữ NGUYÊN vì chỉ nối lại khi phát hiện trùng. */
const dedupeSenses = (value) => {
    const s = String(value ?? "");
    // Tách theo separator sense-list (kể cả "/") — chỉ thay đổi khi có sense trùng thật.
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
    // Không có trùng thật → giữ NGUYÊN chuỗi gốc (không đổi dấu câu/dấu cách).
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
};

// ⚠️ 2026-09-01: dedupe ví dụ TRÙNG theo HÁN (yue cantonese / zh mandarin) — chuẩn hóa bỏ khoảng
// trắng, lowercase. Giữ bản ĐẦU TIÊN (cách a — user chọn), bỏ các bản trùng (chỉ khác en/vi/audio).
// Ví dụ rỗng (chưa có hán) KHÔNG dedupe.
const dedupeExamples = (list, hanField) => {
    const seen = new Set();
    const out = [];
    for (const ex of list ?? []) {
        const han = String(ex?.[hanField] ?? "")
            .replace(/\s+/g, "")
            .toLowerCase()
            .trim();
        if (!han) {
            out.push(ex);
            continue;
        }
        if (seen.has(han)) continue;
        seen.add(han);
        out.push(ex);
    }
    return out;
};

// ── Cấu hình theo ngôn ngữ (map model Prisma + field) ──
const LANG = {
    mandarin: {
        vocab: "mandarinVocabulary",
        romanization: "mandarinVocabularyRomanization",
        meaning: "mandarinVocabularyMeaning",
        example: "mandarinVocabularyExample",
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
// ⚠️ 2026-09-20: meanings ORDER BY position — thứ tự do user chỉnh ở UI edit (khoông có ORDER BY
// thì Postgres trả thứ tự tuỳ ý).
const vocabularyInclude = {
    romanizations: {
        include: {
            meanings: {
                include: { examples: {} },
                orderBy: { position: "asc" },
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
        // ⚠️ 2026-09-05: level 1–5 (1=Hiếm … 5=Rất cao) — nguồn hiển thị chính; popularity giữ raw.
        popularityLevel: row.popularityLevel ?? null,
        readings: (row.romanizations ?? []).map((r) => ({
            id: r.id,
            [readingField]: r[readingField] ?? "",
            sinoVietnamese: cleanSino(r.sinoVietnamese),
            meanings: (r.meanings ?? []).map((m) => ({
                id: m.id,
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

/** Giữ CHỈ ký tự Hán — hán tự KHÔNG được chứa dấu câu/khoảng trắng/ký tự khác (2026-09-08).
 * Dùng \p{Script=Han} để bắt cả ký tự ngoài BMP (vd 𠮶 U+20BB6). */
const HAN_CHAR_RE = /\p{Script=Han}/u;
function keepOnlyHan(value) {
    return [...String(value ?? "")].filter((ch) => HAN_CHAR_RE.test(ch)).join("");
}

/** API object → DB row fields (không gồm readings — ghi riêng qua writeVocabularyReadings).
 * ⚠️ 2026-08-18: cột han/hsk_level NOT NULL DEFAULT '' trong DB → dùng `""` thay `null`
 * (Prisma String? cho phép null nhưng DB từ chối → P2011 Null constraint violation). */
export function vocabularyToRow(body, lang) {
    const L = LANG[lang];
    const row = {
        id: body?.id || randomUUID(),
        // ⚠️ 2026-09-08: chỉ giữ ký tự Hán (bỏ dấu câu/khoảng trắng) khi ghi han.
        [L.hanField]: keepOnlyHan(body?.[L.hanField]),
        popularity: body?.popularity ?? null,
        popularityLevel: body?.popularityLevel ?? null,
    };
    if (L.simpField) row[L.simpField] = keepOnlyHan(body?.hanziSimplified) || "";
    if (L.hasHsk) row.hskLevel = String(body?.hskLevel ?? "").trim() || "";
    else row.pureCantonese = Boolean(body?.pureCantonese);
    if (lang === "cantonese") {
        row.hanziAudio = body?.hanziAudio ?? null;
        row.englishAudio = body?.englishAudio ?? null;
    }
    // ⚠️ 2026-09-08: KHÔNG lưu related_words (từ ghép/đồng nghĩa/trái nghĩa từ Hanzii) nữa — chỉ
    // dùng gợi ý tự động từ app. Luôn ghi NULL để dữ liệu Hanzii cũ không tái lập khi tạo mới.
    if (L.hasRelated) row.relatedWords = null;
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
        meanings: (r?.meanings ?? []).map((m, mi) => {
            // ⚠️ 2026-09-08: bỏ dấu câu CUỐI khi lưu (meaning vi/en/gloss + example).
            const meaning = {
                id: m?.id || randomUUID(),
                ...(glossField ? { [glossField]: dedupeSenses(stripTrailingPunct(m?.[glossField])) } : {}),
                vi: dedupeSenses(stripTrailingPunct(m?.vi)),
                en: dedupeSenses(stripTrailingPunct(m?.en)),
                position: m?.position ?? mi,
            };
            meaning.examples = dedupeExamples(m?.examples, lang === "cantonese" ? "yue" : glossField).map((ex, ei) => ({
                id: ex?.id || randomUUID(),
                ...(glossField ? { [glossField]: stripTrailingPunct(ex?.[glossField]) } : {}),
                romanization: cleanRomanization(String(ex?.romanization ?? "")),
                vi: stripTrailingPunct(ex?.vi),
                en: stripTrailingPunct(ex?.en),
                ...(lang === "cantonese"
                    ? {
                          yue: stripTrailingPunct(ex?.yue), // chữ Hán câu ví dụ CC101 (2026-08-22: thêm lại)
                          hanziAudio: ex?.hanziAudio ?? null,
                          englishAudio: ex?.englishAudio ?? null,
                      }
                    : {}),
                position: ex?.position ?? ei,
            }));
            return meaning;
        }),
    }));
}

/**
 * Ghi readings/meanings/examples cho 1 vocabulary (bảng quan hệ).
 * Xóa readings cũ (cascade meanings/examples) rồi tạo lại từ payload readings.
 */
async function writeVocabularyReadings(lang, vocabId, readings) {
    const L = LANG[lang];
    // Capture yue cũ (chữ Hán câu ví dụ) để dọn TTS cache sau khi delete+recreate.
    let oldYues = [];
    if (lang === "cantonese") {
        const roms = await prisma[L.romanization].findMany({
            where: { [L.vocabIdField]: vocabId },
            select: { id: true },
        });
        const romIds = roms.map((r) => r.id);
        const meanings = romIds.length
            ? await prisma[L.meaning].findMany({
                  where: { [L.romanizationIdField]: { in: romIds } },
                  select: { id: true },
              })
            : [];
        const meaningIds = meanings.map((m) => m.id);
        const exs = meaningIds.length
            ? await prisma[L.example].findMany({
                  where: { [L.meaningIdField]: { in: meaningIds } },
                  select: { yue: true },
              })
            : [];
        oldYues = exs.map((e) => String(e.yue ?? "").trim());
    }
    const newYues = new Set(
        (readings ?? []).flatMap((r) =>
            (r?.meanings ?? []).flatMap((m) => (m?.examples ?? []).map((ex) => String(ex?.yue ?? "").trim())),
        ),
    );
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
        for (const [mi, m] of (r?.meanings ?? []).entries()) {
            const meaning = await prisma[L.meaning].create({
                data: {
                    id: m?.id || randomUUID(),
                    [L.romanizationIdField]: rom.id,
                    ...(L.glossField ? { [L.glossField]: String(m?.[L.glossField] ?? "") } : {}),
                    vi: String(m?.vi ?? ""),
                    en: String(m?.en ?? ""),
                    // ⚠️ 2026-09-20: lưu THỨ TỰ meaning (0-based) — normalizeReadings đã gán theo vị trí mảng.
                    position: Number.isFinite(Number(m?.position)) ? Number(m.position) : mi,
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
    // Dọn TTS cache cho các yue example đã biến mất (không còn trong payload mới).
    if (lang === "cantonese") {
        for (const y of oldYues) {
            if (y && !newYues.has(y)) await deleteTtsCacheIfUnused(y, vocabId).catch(() => {});
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
    } else {
        await prisma[L.vocab].update({
            where: { id: vocabId },
            data: { hanziCharacters: null, updatedAt: new Date() },
        });
    }
}

// ── Fetch ──

// ⚠️ 2026-09-19: CACHE in-memory cho snapshot lớn. `/api/bootstrap` trả ~44MB JSON; build
// (đọc 219k dòng qua Supabase pooler + rowToVocabulary) mất ~4,4s MỖI lần. Cache theo
// `signature` (counts + max updatedAt của 2 bank) → lần gọi sau cùng signature trả NGAY.
// An toàn: mọi thay đổi nội dung đều đổi `updatedAt` (⇒ signature đổi) hoặc đổi count.
// TTL chỉ để tránh giữ dữ liệu cũ khi có sửa đổi không đổi signature (vd chỉ đổi related_words
// — đã được tính trong signature) và để giải phóng bộ nhớ.
const SNAPSHOT_TTL_MS = 5 * 60 * 1000;
let snapshotCache = { sig: null, data: null, at: 0 };
let sigCache = { value: null, at: 0 };
const SIG_TTL_MS = 5 * 1000; // 5s: tránh gọi lặp aggregate trong cùng 1 request

/** Xóa cache snapshot (gọi sau mọi mutation vocab/grammar trong cùng process). */
export function invalidateSnapshotCache() {
    snapshotCache = { sig: null, data: null, at: 0 };
    sigCache = { value: null, at: 0 };
}

function snapshotGet(sig) {
    if (snapshotCache.sig === sig && Date.now() - snapshotCache.at < SNAPSHOT_TTL_MS) return snapshotCache.data;
    return null;
}

function snapshotSet(sig, data) {
    snapshotCache = { sig, data, at: Date.now() };
}

/** Đọc 2 bank + grammars và map sang shape API (phần dùng chung của /data và /bootstrap). */
async function loadSnapshotBase() {
    const [mandarin, cantonese, grammars] = await Promise.all([
        prisma.mandarinVocabulary.findMany({ include: vocabularyInclude }),
        prisma.cantoneseVocabulary.findMany({ include: vocabularyInclude }),
        prisma.grammar.findMany({ include: { grammarExamples: {} } }),
    ]);
    return {
        mandarinVocabularies: mandarin.map((v) => rowToVocabulary(v, "mandarin")),
        cantoneseVocabularies: cantonese.map((v) => rowToVocabulary(v, "cantonese")),
        grammars: grammars.map(rowToGrammar),
    };
}

/** Full snapshot: 2 kho từ + grammars + han characters (có cache theo signature). */
export async function fetchAppData() {
    const sig = await computeDataSignature();
    const cached = snapshotGet(sig);
    if (cached) return cached;
    const base = await loadSnapshotBase();
    snapshotSet(sig, base);
    return base;
}

export async function fetchAllData() {
    return fetchAppData();
}

/** Bootstrap — 1 API trả HẾT data cần khi đăng nhập / load app (2026-09-02):
 *  2 bank từ + grammars + data theo user (favorite/disliked ids / mastery / vocabulary sets —
 *  chỉ khi có userId). Giảm login từ 5 API GET → 1.
 *  ⚠️ KHÔNG còn hkSuggestionMap (xóa 2026-09-02) — gợi ý giản thể giờ tra ON-DEMAND theo
 *  từng từ qua /api/hanzi/simplified-suggestion khi click vào vocab.
 *  ⚠️ 2026-09-19: phần 2 bank + grammars lấy từ cache (key = signature); data theo user
 *  luôn đọc mới (nhỏ, phụ thuộc userId). */
export async function fetchBootstrapData(userId) {
    const sig = await computeDataSignature();
    let base = snapshotGet(sig);
    if (!base) {
        base = await loadSnapshotBase();
        snapshotSet(sig, base);
    }
    const userData = userId
        ? await Promise.all([
              getFavoriteVocabularyIds(userId),
              getVocabularyMastery(userId),
              getVocabularySets(userId),
              getDislikedVocabularyIds(userId),
          ])
        : null;
    const favoriteVocabularyIds = userData ? userData[0] : { mandarin: [], cantonese: [] };
    const vocabularyMastery = userData ? userData[1] : { mandarin: {}, cantonese: {} };
    const vocabularySets = userData ? userData[2] : [];
    const dislikedVocabularyIds = userData ? userData[3] : { mandarin: [], cantonese: [] };
    return {
        ...base,
        favoriteVocabularyIds,
        vocabularyMastery,
        vocabularySets,
        dislikedVocabularyIds,
    };
}

/** Chữ ký dữ liệu hiện tại (counts + max updatedAt của 2 bank + grammars). Dùng cho ETag của
 *  GET /api/bootstrap (If-None-Match) — data không đổi → 304, KHÔNG tải 45MB lại. Không còn
 *  endpoint /api/bootstrap-version riêng (xóa 2026-09-02). Format khớp snapshotSignature frontend. */
export async function computeDataSignature() {
    // Cache 5s: route `/bootstrap` gọi hàm này 2 lần/request (so ETag + gắn header) và
    // `fetchBootstrapData` gọi thêm 1 lần → tránh 3 lần aggregate trên pooler xa.
    if (sigCache.value && Date.now() - sigCache.at < SIG_TTL_MS) return sigCache.value;
    const [m, c, g, mRelRows, cRelRows] = await Promise.all([
        prisma.mandarinVocabulary.aggregate({ _count: { _all: true }, _max: { updatedAt: true } }),
        prisma.cantoneseVocabulary.aggregate({ _count: { _all: true }, _max: { updatedAt: true } }),
        prisma.grammar.aggregate({ _count: { _all: true }, _max: { updatedAt: true } }),
        // ⚠️ 2026-09-08: đếm related_words (JSONB, bỏ JSON-null) — xóa/ghi field này KHÔNG đổi
        // count/max updatedAt nên signature phải theo dõi để client hết 304 cache cũ.
        prisma.$queryRaw`SELECT COUNT(*)::int AS n FROM mandarin_vocabularies WHERE related_words IS NOT NULL AND related_words::text <> 'null'`,
        prisma.$queryRaw`SELECT COUNT(*)::int AS n FROM cantonese_vocabularies WHERE related_words IS NOT NULL AND related_words::text <> 'null'`,
    ]);
    const maxMs = (x) => (x?._max?.updatedAt ? new Date(x._max.updatedAt).getTime() : 0);
    const mRel = Number(mRelRows?.[0]?.n ?? 0);
    const cRel = Number(cRelRows?.[0]?.n ?? 0);
    const value = `${m._count._all}:${maxMs(m)}:${mRel}:${c._count._all}:${maxMs(c)}:${cRel}:${g._count._all}`;
    sigCache = { value, at: Date.now() };
    return value;
}

// ⚠️ 2026-09-20: digest data THEO USER (số dòng favorite/disliked/mastery/sets) — ghép vào ETag của
// `/api/bootstrap`. Lý do: payload bootstrap chứa data theo user; nếu ETag chỉ theo nội dung 2 bank thì
// đánh dấu ❤️/🚫 mới KHÔNG đổi signature ⇒ client nhận 304 và giữ dữ liệu cũ (đánh dấu "biến mất").
// Cache 5s theo user (giống `sigCache`) — route gọi 2 lần/request.
const userSigCache = new Map(); // userId -> { value, at }
const USER_SIG_TTL_MS = 5000;

export async function computeUserDataSignature(userId) {
    if (!userId) return "anon";
    const cached = userSigCache.get(userId);
    if (cached && Date.now() - cached.at < USER_SIG_TTL_MS) return cached.value;
    const [f, d, m, s] = await Promise.all([
        prisma.userFavoriteVocabulary.count({ where: { userId } }),
        prisma.userDislikedVocabulary.count({ where: { userId } }),
        prisma.userVocabularyMastery.count({ where: { userId } }),
        prisma.vocabularySet.count({ where: { userId } }),
    ]);
    const value = `${f}.${d}.${m}.${s}`;
    userSigCache.set(userId, { value, at: Date.now() });
    return value;
}

/** Chữ ký ĐẦY ĐỦ cho `/api/bootstrap`: nội dung 2 bank + data theo user. Format khớp frontend
 *  (`requestSignature` = snapshotSignature + digest user). */
export async function computeBootstrapSignature(userId) {
    const [content, user] = await Promise.all([computeDataSignature(), computeUserDataSignature(userId)]);
    return `${content}:${user}`;
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
        excludeMastered = false,
        excludeDisliked = false,
        userId = null,
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

    // ⚠️ 2026-09-02: lọc bỏ từ đã MASTERED (progress >= 100) khỏi kết quả — dùng cho flashcard random.
    // ⚠️ 2026-09-20: lọc bỏ cả từ user đánh dấu "không muốn học" (user_disliked_vocabularies).
    const excludedIds = [];
    if (userId && (excludeMastered || excludeDisliked)) {
        const [mastered, disliked] = await Promise.all([
            excludeMastered
                ? prisma.userVocabularyMastery.findMany({
                      where: { userId, language: lang, progress: { gte: 100 } },
                      select: { vocabularyId: true },
                  })
                : [],
            excludeDisliked
                ? prisma.userDislikedVocabulary.findMany({
                      where: { userId, language: lang },
                      select: { vocabularyId: true },
                  })
                : [],
        ]);
        for (const m of mastered) excludedIds.push(m.vocabularyId);
        for (const d of disliked) excludedIds.push(d.vocabularyId);
    }
    if (excludedIds.length) {
        wordWhere.NOT = [...(wordWhere.NOT ?? []), { id: { in: excludedIds } }];
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
// ⚠️ 2026-09-02: ĐÃ XÓA hkSuggestionMap (precompute map HK→giản thể) + endpoint
// /hanzi/hk-suggestion-map. Gợi ý giản thể giờ tra ON-DEMAND theo từng từ khi click
// vocab qua /api/hanzi/simplified-suggestion (findSimplifiedSuggestion bên dưới).

// ── CRUD per language ──

export async function createVocabulary(lang, body) {
    const L = LANG[lang];
    const readings = normalizeReadings(body, lang);
    const row = vocabularyToRow(body, lang);
    const vocab = await prisma[L.vocab].create({ data: row });
    await writeVocabularyReadings(lang, vocab.id, readings);
    await refreshHanCharacters(lang, vocab.id);
    invalidateSnapshotCache();
    const full = await prisma[L.vocab].findUnique({ where: { id: vocab.id }, include: vocabularyInclude });
    return rowToVocabulary(full, lang);
}

export async function updateVocabulary(lang, id, body) {
    const L = LANG[lang];
    const existing = await prisma[L.vocab].findUnique({ where: { id } });
    if (!existing) throw Object.assign(new Error("Vocabulary not found"), { statusCode: 404 });

    // TTS cache: ghi nhận hán tự CŨ trước khi update — nếu text đổi, file R2 cũ thành orphan.
    const oldHan = lang === "cantonese" ? String(existing[L.hanField] ?? "").trim() : "";

    const row = vocabularyToRow({ ...body, id }, lang);
    await prisma[L.vocab].update({
        where: { id },
        data: {
            ...(L.simpField ? { [L.simpField]: row[L.simpField] ?? undefined } : {}),
            [L.hanField]: row[L.hanField],
            ...(L.hasHsk ? { hskLevel: row.hskLevel ?? undefined } : { pureCantonese: row.pureCantonese }),
            ...(row.popularity !== null ? { popularity: row.popularity } : {}),
            // ⚠️ 2026-09-05: level có thể bị clear (null) → áp khi key xuất hiện trong body.
            ...(body && "popularityLevel" in body ? { popularityLevel: body.popularityLevel ?? null } : {}),
            // ⚠️ 2026-09-08: KHÔNG ghi related_words (Hanzii) — luôn NULL để không tái lập.
            ...(L.hasRelated ? { relatedWords: null } : {}),
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

    // Xóa cache R2 cũ nếu hán tự đổi (file cantonese-tts/<md5(oldHan)>.mp3) — chỉ khi không còn từ nào khác dùng.
    const newHan = lang === "cantonese" ? String(row[L.hanField] ?? "").trim() : "";
    if (lang === "cantonese" && oldHan && newHan && oldHan !== newHan) {
        await deleteTtsCacheIfUnused(oldHan, id).catch(() => {});
    }

    const full = await prisma[L.vocab].findUnique({ where: { id }, include: vocabularyInclude });
    invalidateSnapshotCache();
    return rowToVocabulary(full, lang);
}

export async function deleteVocabulary(lang, id) {
    const L = LANG[lang];
    // Lấy hán tự trước khi xóa để dọn cache R2.
    const existing =
        lang === "cantonese" ? await prisma[L.vocab].findUnique({ where: { id } }).catch(() => null) : null;
    const han = existing ? String(existing[L.hanField] ?? "").trim() : "";
    await prisma[L.vocab].delete({ where: { id } }).catch(() => {});
    invalidateSnapshotCache();
    if (lang === "cantonese" && han) {
        await deleteTtsCacheIfUnused(han, id).catch(() => {});
    }
}

/**
 * Xóa file TTS cache trên R2 (cantonese-tts/<md5(text)>.mp3) nếu KHÔNG còn vocab nào khác
 * (ngoài `excludeId`) dùng đúng text này. 2 từ trùng text dùng chung 1 file → không xóa nhầm.
 */
async function deleteTtsCacheIfUnused(text, excludeId) {
    if (!text) return;
    // Còn vocab khác có cùng hán tự HK không?
    const others = await prisma.cantoneseVocabulary.count({
        where: { hanziTraditionalHk: text, id: { not: excludeId } },
    });
    if (others > 0) return; // vẫn còn dùng → giữ file
    // Còn example nào dùng text này làm yue không? (cache example cũng theo md5(text))
    const exOthers = await prisma.cantoneseVocabularyExample.count({
        where: {
            yue: text,
            cantoneseVocabularyMeaning: {
                cantoneseVocabularyRomanization: { cantoneseVocabularyId: { not: excludeId } },
            },
        },
    });
    if (exOthers > 0) return;
    const key = `cantonese-tts/${createHash("md5").update(text).digest("hex")}.mp3`;
    await deleteR2Object(key);
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
    invalidateSnapshotCache();
    const full = await prisma.grammar.findUnique({ where: { id }, include: { grammarExamples: {} } });
    return rowToGrammar(full);
}

export async function updateGrammar(userId, id, body) {
    const row = grammarToRow({ ...body, id }, userId, { includeCreatedAt: false });
    const { createdAt, examples, ...data } = row;
    await prisma.grammar.update({ where: { id_userId: { id, userId } }, data });
    await upsertGrammarExamples(id, body.examples);
    invalidateSnapshotCache();
    const full = await prisma.grammar.findUnique({ where: { id }, include: { grammarExamples: {} } });
    return rowToGrammar(full);
}

export async function deleteGrammar(userId, id) {
    await prisma.grammar.delete({ where: { id_userId: { id, userId } } });
    invalidateSnapshotCache();
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
            ...(dv.mandarinVocabulary ? rowToVocabulary(dv.mandarinVocabulary, "mandarin") : {}),
        })),
        cantoneseVocabularies: cantonese.map((dv) => ({
            id: dv.cantoneseVocabularyId,
            position: dv.position,
            ...(dv.cantoneseVocabulary ? rowToVocabulary(dv.cantoneseVocabulary, "cantonese") : {}),
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
        // ⚠️ 2026-09: compound unique field + input key đều theo vocabIdField
        where: { [`deckId_${L.vocabIdField}`]: { deckId, [L.vocabIdField]: vocabularyId } },
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
    await prisma[L.setLink].delete({
        // ⚠️ 2026-09: compound unique field + input key đều theo vocabIdField
        where: { [`setId_${L.vocabIdField}`]: { setId, [L.vocabIdField]: vocabularyId } },
    });
}

// ── Tags (dùng chung toàn app, CHỈ admin tạo/đổi tên/xóa + gán cho từ) — 2026-09-27 ──
// Bảng tags (name unique) + vocabulary_tags (tag_id, language, vocabulary_id) unique.
// `vocabulary_tags` chỉ FK tới `tags` (onDelete CASCADE) — giống pattern favorite/disliked
// (không FK chéo tới 2 bảng vocab riêng biệt).

/**
 * Chuẩn hóa tên tag: trim + gộp khoảng trắng + **Title Case** (viết hoa chữ đầu MỖI từ,
 * giữ nguyên phần còn lại để không phá từ viết hoa như "HSK"). Áp dụng cho cả tạo mới & đổi tên.
 * (2026-09-27) VD: "động vật có vú" → "Động Vật Có Vú".
 */
function normalizeTagName(value) {
    return String(value ?? "")
        .trim()
        .replace(/\s+/g, " ")
        .replace(/(^|\s)(\S)/gu, (_, sep, ch) => sep + ch.toUpperCase());
}

// ⚠️ 2026-09-27: MÀU TAG — bảng màu 10 sắc gốc × 5 tông (500→900, KHÔNG có màu nhạt/đen) nằm ở FE
// (`frontend/src/lib/tagColors.js`). BE chấp nhận MỌI mã #rrggbb (`normalizeTagColor`) nên
// đổi/thêm màu ở FE KHÔNG cần sửa BE; list dưới đây chỉ dùng để gán màu MẶC ĐỊNH khi tạo tag
// (10 sắc tông 500).
export const TAG_DEFAULT_COLORS = [
    "#ef4444", // Đỏ
    "#f97316", // Cam
    "#f59e0b", // Vàng
    "#84cc16", // Lục
    "#22c55e", // Xanh lá
    "#14b8a6", // Ngọc
    "#3b82f6", // Xanh dương
    "#6366f1", // Chàm
    "#8b5cf6", // Tím
    "#ec4899", // Hồng
];

/** Chỉ nhận mã màu hex 6 số (#rrggbb) — chống giá trị rác từ client. */
function normalizeTagColor(value) {
    const c = String(value ?? "")
        .trim()
        .toLowerCase();
    return /^#[0-9a-f]{6}$/.test(c) ? c : null;
}

/** Màu mặc định khi tạo tag = màu ÍT DÙNG NHẤT trong 7 màu mặc định (không random, vẫn đa dạng). */
async function defaultTagColor() {
    const rows = await prisma.tag.findMany({ select: { color: true } });
    const counts = new Map(TAG_DEFAULT_COLORS.map((c) => [c, 0]));
    for (const r of rows) {
        const c = normalizeTagColor(r.color);
        if (counts.has(c)) counts.set(c, counts.get(c) + 1);
    }
    let best = TAG_DEFAULT_COLORS[0];
    for (const c of TAG_DEFAULT_COLORS) if ((counts.get(c) ?? 0) < (counts.get(best) ?? 0)) best = c;
    return best;
}

function tagToObject(t, count) {
    return {
        id: t.id,
        name: t.name,
        color: t.color ?? null,
        vocabularyCount: count ?? 0,
        createdAt: t.createdAt,
    };
}

export async function getTags() {
    const rows = await prisma.tag.findMany({
        include: { _count: { select: { vocabularyTags: true } } },
    });
    // ⚠️ 2026-09-27: sắp theo SỐ TỪ ĐÃ GẮN (giảm dần), cùng số thì theo tên (locale vi).
    // Sort bằng JS (bảng tag nhỏ) để không phụ thuộc `orderBy` theo _count của Prisma.
    return rows
        .map((t) => tagToObject(t, t._count?.vocabularyTags))
        .sort(
            (a, b) =>
                (b.vocabularyCount ?? 0) - (a.vocabularyCount ?? 0) ||
                String(a.name ?? "").localeCompare(String(b.name ?? ""), "vi"),
        );
}

export async function createTag(body) {
    const name = normalizeTagName(body?.name);
    if (!name) throw Object.assign(new Error("Tag name is required"), { statusCode: 400 });
    const color = normalizeTagColor(body?.color) ?? (await defaultTagColor());
    try {
        const created = await prisma.tag.create({ data: { id: body?.id ?? randomUUID(), name, color } });
        return tagToObject(created);
    } catch (err) {
        if (err?.code === "P2002") throw Object.assign(new Error("Tag already exists"), { statusCode: 409 });
        throw err;
    }
}

/**
 * Cập nhật tag — nhận PATCH từng phần: `{ name? , color? }` (phải có ít nhất 1 field).
 * (2026-09-27) Tách name/color riêng vì UI cho đổi tên VÀ đổi màu độc lập.
 */
export async function updateTag(id, body) {
    const data = {};
    if (body?.name !== undefined) {
        const name = normalizeTagName(body.name);
        if (!name) throw Object.assign(new Error("Tag name is required"), { statusCode: 400 });
        data.name = name;
    }
    if (body?.color !== undefined) {
        const color = normalizeTagColor(body.color);
        if (!color) throw Object.assign(new Error("Invalid tag color"), { statusCode: 400 });
        data.color = color;
    }
    if (Object.keys(data).length === 0) {
        throw Object.assign(new Error("Nothing to update"), { statusCode: 400 });
    }
    try {
        const updated = await prisma.tag.update({ where: { id }, data });
        const count = await prisma.vocabularyTag.count({ where: { tagId: id } });
        return tagToObject(updated, count);
    } catch (err) {
        if (err?.code === "P2002") throw Object.assign(new Error("Tag already exists"), { statusCode: 409 });
        if (err?.code === "P2025") throw Object.assign(new Error("Tag not found"), { statusCode: 404 });
        throw err;
    }
}

/** Xóa tag — `vocabulary_tags` bị gỡ theo nhờ FK ON DELETE CASCADE. */
export async function deleteTag(id) {
    try {
        await prisma.tag.delete({ where: { id } });
    } catch (err) {
        if (err?.code === "P2025") throw Object.assign(new Error("Tag not found"), { statusCode: 404 });
        throw err;
    }
}

/** Id các tag đang gán cho 1 từ (theo ngôn ngữ). */
export async function getVocabularyTagIds(lang, vocabularyId) {
    const rows = await prisma.vocabularyTag.findMany({
        where: { language: lang, vocabularyId },
        select: { tagId: true },
    });
    return rows.map((r) => r.tagId);
}

/** Gán / gỡ 1 tag cho 1 từ. `tagged=true` → tạo liên kết (idempotent); false → xóa. */
export async function setVocabularyTag(lang, vocabularyId, tagId, tagged) {
    const L = LANG[lang];
    const [vocab, tag] = await Promise.all([
        prisma[L.vocab].findUnique({ where: { id: vocabularyId }, select: { id: true } }),
        prisma.tag.findUnique({ where: { id: tagId }, select: { id: true } }),
    ]);
    if (!vocab) throw Object.assign(new Error("Vocabulary not found"), { statusCode: 404 });
    if (!tag) throw Object.assign(new Error("Tag not found"), { statusCode: 404 });
    if (tagged) {
        await prisma.vocabularyTag.upsert({
            where: { tagId_language_vocabularyId: { tagId, language: lang, vocabularyId } },
            create: { tagId, language: lang, vocabularyId },
            update: {},
        });
    } else {
        await prisma.vocabularyTag.deleteMany({ where: { tagId, language: lang, vocabularyId } });
    }
    return { ok: true, tagged: Boolean(tagged) };
}

// ── Favorite / Disliked vocabularies (cặp ❤️ / 🚫 theo user) — 2026-09-02 → rename 2026-09-20 ──
// Bảng user_favorite_vocabularies + user_disliked_vocabularies: (user_id, language, vocabulary_id)
// unique. KHÔNG FK tới users (pattern giống user_checkins). 2 trạng thái LOẠI TRỪ NHAU.
// Từ `disliked` ("không muốn học") KHÔNG xuất hiện trong flashcard random (queryVocabularies excludeDisliked).

export async function getFavoriteVocabularyIds(userId) {
    const rows = await prisma.userFavoriteVocabulary.findMany({
        where: { userId },
        select: { language: true, vocabularyId: true },
    });
    const result = { mandarin: [], cantonese: [] };
    for (const r of rows) {
        if (Object.prototype.hasOwnProperty.call(result, r.language)) result[r.language].push(r.vocabularyId);
    }
    return result;
}

export async function getDislikedVocabularyIds(userId) {
    const rows = await prisma.userDislikedVocabulary.findMany({
        where: { userId },
        select: { language: true, vocabularyId: true },
    });
    const result = { mandarin: [], cantonese: [] };
    for (const r of rows) {
        if (Object.prototype.hasOwnProperty.call(result, r.language)) result[r.language].push(r.vocabularyId);
    }
    return result;
}

/** Bật/tắt ❤️ yêu thích — bật thì tự động BỎ 🚫 không muốn học (2 trạng thái loại trừ nhau). */
export async function setVocabularyFavorite(userId, lang, vocabularyId, favorite) {
    const L = LANG[lang];
    const exists = await prisma[L.vocab].findUnique({ where: { id: vocabularyId }, select: { id: true } });
    if (!exists) throw Object.assign(new Error("Vocabulary not found"), { statusCode: 404 });
    if (favorite) {
        await prisma.userFavoriteVocabulary.upsert({
            where: { userId_language_vocabularyId: { userId, language: lang, vocabularyId } },
            create: { userId, language: lang, vocabularyId },
            update: {},
        });
        await prisma.userDislikedVocabulary.deleteMany({ where: { userId, language: lang, vocabularyId } });
    } else {
        await prisma.userFavoriteVocabulary.deleteMany({ where: { userId, language: lang, vocabularyId } });
    }
    return { ok: true, favorite: Boolean(favorite) };
}

/** Bật/tắt 🚫 không muốn học — bật thì tự động BỎ ❤️ yêu thích (2 trạng thái loại trừ nhau). */
export async function setVocabularyDisliked(userId, lang, vocabularyId, disliked) {
    const L = LANG[lang];
    const exists = await prisma[L.vocab].findUnique({ where: { id: vocabularyId }, select: { id: true } });
    if (!exists) throw Object.assign(new Error("Vocabulary not found"), { statusCode: 404 });
    if (disliked) {
        await prisma.userDislikedVocabulary.upsert({
            where: { userId_language_vocabularyId: { userId, language: lang, vocabularyId } },
            create: { userId, language: lang, vocabularyId },
            update: {},
        });
        await prisma.userFavoriteVocabulary.deleteMany({ where: { userId, language: lang, vocabularyId } });
    } else {
        await prisma.userDislikedVocabulary.deleteMany({ where: { userId, language: lang, vocabularyId } });
    }
    return { ok: true, disliked: Boolean(disliked) };
}

// ── Vocabulary mastery (progress 0-100%) — mọi user đã đăng nhập (2026-09-02) ──
// Bảng user_vocabulary_mastery: (user_id, language, vocabulary_id) unique.
// Khó +5 / Trung bình +10 / Dễ +25; Lại nữa → reset 0; Đã nắm → 100 (mastered).

export async function getVocabularyMastery(userId) {
    const rows = await prisma.userVocabularyMastery.findMany({
        where: { userId },
        select: { language: true, vocabularyId: true, progress: true },
    });
    const result = { mandarin: {}, cantonese: {} };
    for (const r of rows) {
        if (Object.prototype.hasOwnProperty.call(result, r.language)) {
            result[r.language][r.vocabularyId] = r.progress;
        }
    }
    return result;
}

export async function setVocabularyMastery(userId, lang, vocabularyId, progress) {
    const L = LANG[lang];
    const exists = await prisma[L.vocab].findUnique({ where: { id: vocabularyId }, select: { id: true } });
    if (!exists) throw Object.assign(new Error("Vocabulary not found"), { statusCode: 404 });
    const clamped = Math.max(0, Math.min(100, Math.round(Number(progress) || 0)));
    if (clamped <= 0) {
        await prisma.userVocabularyMastery.deleteMany({ where: { userId, language: lang, vocabularyId } });
        return { ok: true, progress: 0, mastered: false };
    }
    const row = await prisma.userVocabularyMastery.upsert({
        where: { userId_language_vocabularyId: { userId, language: lang, vocabularyId } },
        create: { userId, language: lang, vocabularyId, progress: clamped },
        update: { progress: clamped, updatedAt: new Date() },
    });
    return { ok: true, progress: row.progress, mastered: row.progress >= 100 };
}

// ── Resolve user ──

export async function resolveReadUserId(session) {
    if (session?.userId) return session.userId;
    return null;
}
