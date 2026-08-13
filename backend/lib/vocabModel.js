/**
 * Vocabulary model mới (2026-08-14): { id, mandarin, cantonese, metadata }.
 *
 * Key order chuẩn (user chốt):
 *   vocab:     id, mandarin, cantonese, metadata
 *   block:     hanzi_simplified, hanzi_traditional, system, readings
 *   reading:   id, romanization, sino_vietnamese, meanings
 *   meaning:   id, position, category, zh|yue, vi, en, examples
 *   example:   id, position, zh|yue, romanization, vi, en
 *   metadata:  hsk_level, popularity, frequency, movie_word_rank,
 *              book_word_rank, created_at, updated_at
 *
 * Quy tắc:
 * - Mandarin dùng field `zh` (giản thể), Cantonese dùng `yue` (phồn thể/HK).
 * - cantonese.hanzi_traditional = han_hongkong cũ; mandarin.hanzi_traditional = han_traditional cũ.
 * - Mọi object lồng PHẢI có `id` (AGENTS §2.4) — legacy thiếu id → sinh stable
 *   content-id (MD5 content) để không lệch khi đọc lại.
 */
import { randomUUID, createHash } from "crypto";
import { romanizationId } from "./romanizationId.js";

const DICT_CATS = new Set(["CC-Canto", "words.hk", "粵典–words.hk"]);

export const isDictCategory = (cat) => DICT_CATS.has(String(cat ?? "").trim());

function md5Uuid(text) {
    return createHash("md5")
        .update(text)
        .digest("hex")
        .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
}

const sideField = (side) => (side === "mandarin" ? "zh" : "yue");

const contentMeaningId = (side, cat, gloss, vi, en) => md5Uuid(`m|${side}|${cat}|${gloss}|${vi}|${en}`);
const contentExampleId = (side, han, rom, vi, en) => md5Uuid(`ex|${side}|${han}|${rom}|${vi}|${en}`);

/** Legacy meaning (vietMeanings/engMeanings) → meaning model mới (canonical key order). */
export function meaningFromLegacy(m, side, i) {
    const cat = String(m?.category ?? "").trim();
    const isDict = isDictCategory(cat);
    // dict (CC-Canto/words.hk): vietMeanings cũ là gloss chữ Hán → zh|yue; vi trống.
    // manual: vietMeanings là tiếng Việt → vi; zh|yue trống.
    const gloss = isDict ? String(m?.vietMeanings ?? "") : "";
    const vi = isDict ? "" : String(m?.vietMeanings ?? "");
    const en = String(m?.engMeanings ?? "");
    const out = {
        id: m?.id ?? contentMeaningId(side, cat, gloss, vi, en),
        position: m?.position ?? i,
        category: cat,
    };
    out[sideField(side)] = gloss;
    out.vi = vi;
    out.en = en;
    out.examples = (m?.examples ?? []).map((ex, j) => {
        const han =
            side === "mandarin"
                ? String(ex?.hanSimplified ?? ex?.hanExample ?? "")
                : String(ex?.hanTraditional ?? ex?.hanExample ?? "");
        const rom = side === "mandarin" ? String(ex?.pinyinExample ?? "") : String(ex?.jyutpingExample ?? "");
        const e = {
            id:
                ex?.id ??
                contentExampleId(side, han, rom, String(ex?.vietExamples ?? ""), String(ex?.engExamples ?? "")),
            position: ex?.position ?? j,
        };
        e[sideField(side)] = han;
        e.romanization = rom;
        e.vi = String(ex?.vietExamples ?? "");
        e.en = String(ex?.engExamples ?? "");
        return e;
    });
    return out;
}

/** Legacy typed romanization array → block mới. */
export function blockFromLegacy(roms, side, hanSimplified, hanTraditional) {
    const isPy = side === "mandarin";
    const type = isPy ? "pinyin" : "jyutping";
    const readings = (roms ?? [])
        .filter((r) => (r?.type ?? (r?.jyutping && !r?.pinyin ? "jyutping" : "pinyin")) === type)
        .map((r) => {
            const rom = isPy
                ? String(r?.pinyin ?? "")
                      .toLowerCase()
                      .trim()
                : String(r?.jyutping ?? "")
                      .toLowerCase()
                      .trim();
            const out = {
                id: r?.id ?? romanizationId(isPy ? rom : "", isPy ? "" : rom),
                romanization: rom,
                sino_vietnamese: String(r?.sinoVietnamese ?? ""),
            };
            out.meanings = (r?.meanings ?? []).map((m, i) => meaningFromLegacy(m, side, i));
            return out;
        });
    return {
        hanzi_simplified: String(hanSimplified ?? ""),
        hanzi_traditional: String(hanTraditional ?? ""),
        system: isPy ? "pinyin" : "jyutping",
        readings,
    };
}

/** Chuẩn hóa meaning (format mới) về canonical key order + đảm bảo có id. */
function normalizeMeaning(m, side, i, assignIds) {
    const cat = String(m?.category ?? "").trim();
    const gloss = String(m?.[sideField(side)] ?? "");
    const vi = String(m?.vi ?? "");
    const en = String(m?.en ?? "");
    const out = {
        id: m?.id || (assignIds ? randomUUID() : contentMeaningId(side, cat, gloss, vi, en)),
        position: m?.position ?? i,
        category: cat,
    };
    out[sideField(side)] = gloss;
    out.vi = vi;
    out.en = en;
    out.examples = (m?.examples ?? []).map((ex, j) => {
        const han = String(ex?.[sideField(side)] ?? "");
        const rom = String(ex?.romanization ?? "");
        const e = {
            id:
                ex?.id ||
                (assignIds
                    ? randomUUID()
                    : contentExampleId(side, han, rom, String(ex?.vi ?? ""), String(ex?.en ?? ""))),
            position: ex?.position ?? j,
        };
        e[sideField(side)] = han;
        e.romanization = rom;
        e.vi = String(ex?.vi ?? "");
        e.en = String(ex?.en ?? "");
        return e;
    });
    return out;
}

/** Chuẩn hóa reading + block (format mới) về canonical key order. */
export function normalizeBlock(block, side, fallbackHanSimplified, fallbackHanTraditional, { assignIds = false } = {}) {
    const b = block ?? {};
    const readings = (Array.isArray(b.readings) ? b.readings : []).map((r, i) => {
        const rom = String(r?.romanization ?? "")
            .toLowerCase()
            .trim();
        const out = {
            // Reading thiếu id → stable id theo romanization (AGENTS §2.4) — không random mỗi lần đọc.
            id: r?.id || (side === "mandarin" ? romanizationId(rom, "") : romanizationId("", rom)),
            romanization: rom,
            sino_vietnamese: String(r?.sino_vietnamese ?? ""),
        };
        out.meanings = (r?.meanings ?? []).map((m, mi) => normalizeMeaning(m, side, mi, assignIds));
        return out;
    });
    return {
        hanzi_simplified: String(b.hanzi_simplified ?? fallbackHanSimplified ?? ""),
        hanzi_traditional: String(b.hanzi_traditional ?? fallbackHanTraditional ?? ""),
        system: side === "mandarin" ? "pinyin" : "jyutping",
        readings,
    };
}

/**
 * DB romanization_json → { mandarin, cantonese }.
 * Hỗ trợ cả format MỚI ({ mandarin, cantonese }) lẫn LEGACY (typed array).
 */
export function blocksFromRow(vocab) {
    const raw = vocab?.romanizationJson;
    const isNew = raw && typeof raw === "object" && !Array.isArray(raw) && (raw.mandarin || raw.cantonese);
    if (isNew) {
        return {
            mandarin: normalizeBlock(raw.mandarin, "mandarin", vocab?.hanSimplified, vocab?.hanTraditional),
            cantonese: normalizeBlock(
                raw.cantonese,
                "cantonese",
                vocab?.hanSimplified,
                vocab?.hanHongKong ?? vocab?.hanTraditional,
            ),
        };
    }
    const roms = Array.isArray(raw) ? raw : [];
    return {
        mandarin: blockFromLegacy(roms, "mandarin", vocab?.hanSimplified, vocab?.hanTraditional),
        cantonese: blockFromLegacy(
            roms,
            "cantonese",
            vocab?.hanSimplified,
            vocab?.hanHongKong ?? vocab?.hanTraditional,
        ),
    };
}

/** Payload (model mới) → DB romanization_json `{ mandarin, cantonese }` (canonical order, gán id thiếu). */
export function buildRomanizationJsonNew(body) {
    return {
        mandarin: normalizeBlock(
            body?.mandarin,
            "mandarin",
            body?.mandarin?.hanzi_simplified,
            body?.mandarin?.hanzi_traditional,
            { assignIds: true },
        ),
        cantonese: normalizeBlock(
            body?.cantonese,
            "cantonese",
            body?.cantonese?.hanzi_simplified,
            body?.cantonese?.hanzi_traditional,
            { assignIds: true },
        ),
    };
}

const joinField = (readings, field) => {
    const seen = [];
    for (const r of readings ?? []) {
        const v = String(r?.[field] ?? "").trim();
        if (v && !seen.includes(v)) seen.push(v);
    }
    return seen.join(" / ");
};

/** Sinh flat values (pinyin/jyutping/sino/viet/eng/search_key) từ blocks — cho cột legacy đến khi migration drop. */
export function flatDerivedFromBlocks(blocks) {
    const mandarin = blocks?.mandarin ?? {};
    const cantonese = blocks?.cantonese ?? {};
    const mdReadings = mandarin.readings ?? [];
    const ctReadings = cantonese.readings ?? [];

    const pinyin = joinField(mdReadings, "romanization");
    const jyutping = joinField(ctReadings, "romanization");
    const sinoVietnamese = joinField([...mdReadings, ...ctReadings], "sino_vietnamese");

    const firstMeaning =
        ctReadings.flatMap((r) => r?.meanings ?? [])[0] ?? mdReadings.flatMap((r) => r?.meanings ?? [])[0];
    const vietMeanings = firstMeaning ? firstMeaning.vi || firstMeaning.yue || firstMeaning.zh || "" : "";
    const engMeanings = firstMeaning?.en ?? "";

    const searchKey = [
        mandarin.hanzi_simplified,
        mandarin.hanzi_traditional,
        cantonese.hanzi_traditional,
        pinyin,
        jyutping,
        sinoVietnamese,
        vietMeanings,
        engMeanings,
    ]
        .filter(Boolean)
        .join(" ");

    return { pinyin, jyutping, sinoVietnamese, vietMeanings, engMeanings, searchKey };
}
