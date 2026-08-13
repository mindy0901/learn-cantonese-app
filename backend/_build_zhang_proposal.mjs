/** Sinh JSON theo model mới đã chốt (review) — KHÔNG ghi DB (2026-08-14). */
import { prisma } from "./lib/prisma.js";
import { writeFileSync } from "fs";

const ID = "686063d4-9cf8-50ec-6fca-7a191e25319e";

// id tạm cho object thiếu id (manual meaning/example) — khi implement sẽ sinh UUID chuẩn.
const TMP = "pending-id";

async function main() {
    const v = await prisma.vocabulary.findUnique({ where: { id: ID } });
    if (!v) throw new Error("not found");
    const roms = Array.isArray(v.romanizationJson) ? v.romanizationJson : [];

    const isDict = (cat) => {
        const c = String(cat ?? "").trim();
        return c === "CC-Canto" || c === "words.hk" || c === "粵典–words.hk";
    };

    // 1 meaning → { id, position, zh|yue, vi, en, category, examples }
    const mapMeaning = (m, side) => {
        const cat = String(m?.category ?? "").trim();
        // dict (CC-Canto/words.hk): vietMeanings thực chất là gloss chữ Hán (Cantonese)
        // → gán vào zh/yue; vi để trống. manual: vietMeanings là tiếng Việt → gán vi.
        const chineseGloss = isDict(cat) ? String(m?.vietMeanings ?? "") : "";
        const viGloss = isDict(cat) ? "" : String(m?.vietMeanings ?? "");
        const gloss = { vi: viGloss, en: String(m?.engMeanings ?? "") };
        if (side === "mandarin") gloss.zh = chineseGloss;
        else gloss.yue = chineseGloss;
        return {
            id: m?.id ?? TMP,
            position: m?.position ?? 0,
            category: cat,
            ...gloss,
            examples: (m?.examples ?? []).map((ex, j) => {
                const exGloss = {
                    vi: String(ex?.vietExamples ?? ""),
                    en: String(ex?.engExamples ?? ""),
                    romanization:
                        side === "mandarin" ? String(ex?.pinyinExample ?? "") : String(ex?.jyutpingExample ?? ""),
                };
                if (side === "mandarin") exGloss.zh = String(ex?.hanSimplified ?? ex?.hanExample ?? "");
                else exGloss.yue = String(ex?.hanTraditional ?? ex?.hanExample ?? "");
                return { id: ex?.id ?? TMP, position: ex?.position ?? j, ...exGloss };
            }),
        };
    };

    const buildBlock = (side) => {
        const isPy = side === "mandarin";
        const entries = roms.filter((r) => (isPy ? r?.type === "pinyin" : r?.type === "jyutping"));
        return {
            hanzi_simplified: v.hanSimplified,
            hanzi_traditional: isPy ? v.hanTraditional : v.hanHongKong, // cantonese.trad = HK
            system: isPy ? "pinyin" : "jyutping",
            readings: entries.map((r) => ({
                id: r?.id,
                romanization: isPy ? (r?.pinyin ?? "") : (r?.jyutping ?? ""),
                sino_vietnamese: r?.sinoVietnamese ?? "",
                meanings: (r?.meanings ?? []).map((m) => mapMeaning(m, side)),
            })),
        };
    };

    const out = {
        id: v.id,
        mandarin: buildBlock("mandarin"),
        cantonese: buildBlock("cantonese"),
        metadata: {
            hsk_level: v.hskLevel,
            popularity: v.boost,
            frequency: v.frequency,
            movie_word_rank: v.movieWordRank,
            book_word_rank: v.bookWordRank,
            created_at: v.createdAt,
            updated_at: v.updatedAt,
        },
    };

    writeFileSync("/app/_zhang_proposed.json", JSON.stringify(out, null, 4));
    const n = JSON.stringify(out, null, 4).split("\n").length;
    console.log(`written /app/_zhang_proposed.json (${n} lines)`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
