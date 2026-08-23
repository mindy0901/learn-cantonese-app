/**
 * backfill-sino-dash.mjs
 * Cập nhật `sino_vietnamese` cho các reading cantonese đang chứa placeholder "-"
 * (ký tự HK không có Hán-Việt trong map: 嘢, 嚟, 嗰, 啲, 哋, 喺...) bằng Hán-Việt
 * ĐẦY ĐỦ từ Hanzii (hero `.line-word .txt-cn_vi`).
 * VD: 好嘢 "HẢO -" → "HẢO HUỀ".
 *
 * Lý do: `pickBetterSino` cũ đếm "-" thành 1 âm tiết → "HẢO -" (2) == "HẢO HUỀ" (2)
 * → không thay. Đã sửa logic (ưu tiên giá trị không chứa placeholder). (2026-08-23)
 *
 * Usage (chạy trong container backend):
 *   node backfill-sino-dash.mjs --dry   # preview (không ghi)
 *   node backfill-sino-dash.mjs          # ghi DB
 */
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { fetchHanziiMeanings } from "./lib/hanziiScrape.js";

const DRY = process.argv.includes("--dry");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const isPh = (t) => t === "-" || t === "•" || t === "·" || /^_+$/.test(t);
const hasPh = (s) =>
    String(s ?? "")
        .split(/\s+/)
        .some(isPh);
const real = (s) =>
    String(s ?? "")
        .split(/\s+/)
        .filter((t) => !isPh(t)).length;
function betterSino(cur, fb) {
    cur = String(cur ?? "").trim();
    fb = String(fb ?? "").trim();
    if (!fb) return cur;
    if (!cur) return fb;
    if (hasPh(cur) && !hasPh(fb)) return fb;
    if (!hasPh(cur) && hasPh(fb)) return cur;
    return real(fb) > real(cur) ? fb : cur;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
    const rows = await prisma.cantoneseVocabularyRomanization.findMany({
        where: { sinoVietnamese: { contains: "-" } },
        select: {
            id: true,
            jyutping: true,
            sinoVietnamese: true,
            cantoneseVocabulary: { select: { id: true, hanziTraditionalHk: true } },
        },
    });
    console.log(`reading chứa "-": ${rows.length}`);

    // Gom theo vocab — chỉ scrape Hanzii 1 lần / từ.
    const byVocab = new Map();
    for (const r of rows) {
        const vid = r.cantoneseVocabulary.id;
        if (!byVocab.has(vid)) {
            byVocab.set(vid, {
                han: r.cantoneseVocabulary.hanziTraditionalHk?.trim() || "",
                readings: [],
            });
        }
        byVocab.get(vid).readings.push(r);
    }

    let updated = 0;
    let noHan = 0;
    let fetched = 0;
    const samples = [];
    for (const [vid, g] of byVocab) {
        if (!g.han) {
            noHan += g.readings.length;
            continue;
        }
        let hanziiSino = "";
        try {
            const res = await fetchHanziiMeanings(g.han);
            hanziiSino = String(res?.sinoVietnamese ?? "").trim();
        } catch {
            hanziiSino = "";
        }
        if (hanziiSino) fetched += 1;
        for (const r of g.readings) {
            const next = betterSino(r.sinoVietnamese, hanziiSino);
            if (next === r.sinoVietnamese) continue;
            updated += 1;
            if (samples.length < 12) {
                samples.push(`${g.han} ${r.jyutping}: "${r.sinoVietnamese}" → "${next}"`);
            }
            if (!DRY) {
                await prisma.cantoneseVocabularyRomanization.update({
                    where: { id: r.id },
                    data: { sinoVietnamese: next },
                });
            }
        }
        await sleep(150);
    }
    console.log(`[${DRY ? "DRY" : "WRITE"}]`, { readings: rows.length, fetched, updated, noHan });
    for (const s of samples) console.log("  ", s);
    console.log(DRY ? "→ DRY mode — chạy lại KHÔNG có --dry để ghi DB" : "→ Đã ghi xong");
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
