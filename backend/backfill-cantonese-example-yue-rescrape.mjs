/**
 * backfill-cantonese-example-yue-rescrape.mjs
 * Điền `yue` (chữ Hán câu ví dụ) còn thiếu cho cantonese_vocabulary_examples bằng cách
 * RE-SCRAPE từ Hanzii (KHÔNG dùng OpenCC convert) — lấy chính han mà scrap trả về.
 *
 * Lý do (2026-08-23): lỗi scrap cũ — `buildScrapMeanings`/payload chỉ đọc `hanTraditional`
 * (rỗng khi giản==phồn, ex.zh không có 【】) → yue bị MẤT dù han CÓ trong `hanSimplified`.
 * Đã fix code (dataTransforms.js + WordEditFields.jsx). Script này hồi phục dữ liệu cũ
 * bằng chính nguồn scrap.
 *
 * Usage (chạy trong container backend):
 *   node backfill-cantonese-example-yue-rescrape.mjs --dry   # preview
 *   node backfill-cantonese-example-yue-rescrape.mjs          # ghi DB
 */
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { fetchHanziiMeanings } from "./lib/hanziiScrape.js";

const DRY = process.argv.includes("--dry");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const norm = (s) =>
    String(s ?? "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
/** "giản【phồn】" (hoặc chỉ giản) → han cho yue: ưu tiên phồn, fallback giản (giản==phồn). */
const splitHan = (zh) => {
    const s = String(zh ?? "").trim();
    const m = s.match(/^([^【]*)(?:【([^】]*)】)?[\s\S]*$/);
    return { hanSimplified: (m?.[1] ?? "").trim(), hanTraditional: (m?.[2] ?? "").trim() };
};
const exampleHan = (ex) => {
    const parts = splitHan(ex?.zh);
    return (parts.hanTraditional || parts.hanSimplified || "").trim();
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
    const missing = await prisma.cantoneseVocabularyExample.findMany({
        where: { yue: "" },
        select: {
            id: true,
            vi: true,
            en: true,
            romanization: true,
            cantoneseVocabularyMeaning: {
                select: {
                    cantoneseVocabularyRomanization: {
                        select: {
                            cantoneseVocabulary: { select: { id: true, hanziTraditionalHk: true } },
                        },
                    },
                },
            },
        },
    });
    console.log(`cantonese examples thiếu yue: ${missing.length}`);

    // Gom theo vocab.
    const byVocab = new Map();
    for (const ex of missing) {
        const vocab = ex.cantoneseVocabularyMeaning.cantoneseVocabularyRomanization.cantoneseVocabulary;
        if (!byVocab.has(vocab.id))
            byVocab.set(vocab.id, { han: vocab.hanziTraditionalHk?.trim() || "", examples: [] });
        byVocab.get(vocab.id).examples.push(ex);
    }

    let updated = 0;
    let noScrap = 0;
    let noMatch = 0;
    const samples = [];
    for (const [vid, g] of byVocab) {
        if (!g.han) {
            noScrap += g.examples.length;
            continue;
        }
        // Re-scrape từ Hanzii → map ví dụ scrap theo vi chuẩn hoá → han thật.
        let scrapByVi = new Map();
        try {
            const res = await fetchHanziiMeanings(g.han);
            const tones = Array.isArray(res?.tones) ? res.tones : [];
            for (const t of tones) {
                for (const grp of t.groups ?? []) {
                    for (const m of grp.meanings ?? []) {
                        for (const ex of m.examples ?? []) {
                            const han = exampleHan(ex);
                            const kvi = norm(ex.vi);
                            if (han && kvi && !scrapByVi.has(kvi)) scrapByVi.set(kvi, han);
                        }
                    }
                }
            }
        } catch {
            scrapByVi = new Map();
        }
        if (!scrapByVi.size) {
            noScrap += g.examples.length;
            continue;
        }
        for (const ex of g.examples) {
            const han = scrapByVi.get(norm(ex.vi));
            if (!han) {
                noMatch += 1;
                continue;
            }
            updated += 1;
            if (samples.length < 12) samples.push(`${g.han} ${ex.romanization}: → "${han}"`);
            if (!DRY) {
                await prisma.cantoneseVocabularyExample.update({ where: { id: ex.id }, data: { yue: han } });
            }
        }
        await sleep(150);
    }
    console.log(`[${DRY ? "DRY" : "WRITE"}]`, { missing: missing.length, updated, noScrap, noMatch });
    for (const s of samples) console.log("  ", s);
    console.log(DRY ? "→ DRY mode — chạy lại KHÔNG có --dry để ghi DB" : "→ Đã ghi xong");
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
