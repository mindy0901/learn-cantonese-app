/**
 * Gỡ `pure_cantonese` cho các vocab bị gán nhầm (2026-08-13).
 *
 * Mâu thuẫn: vocab có `pure_cantonese = true` nhưng vẫn có ≥1 entry pinyin
 * trong `romanization_json` (pinyin tồn tại → KHÔNG phải từ quảng thuần).
 * Nguồn gốc: backfill-purecantonese-detect dùng pinyin-pro echo — không đọc
 * được dạng Traditional/HK (vd 長) → gán nhầm pureCantonese.
 *
 * Theo user: từ giờ pureCantonese CHỈ set manual bằng toggle trong edit page.
 * Script này chỉ xóa flag mâu thuẫn, không đụng pinyin/jyutping.
 *
 * Usage (trong container):
 *   docker compose -f docker-compose.dev.yml exec -T backend node /app/fix-purecantonese-contradiction.mjs --dry
 *   docker compose -f docker-compose.dev.yml exec -T backend node /app/fix-purecantonese-contradiction.mjs --apply
 */
import { prisma } from "./lib/prisma.js";

const isDry = !process.argv.includes("--apply");

async function main() {
    const rows = await prisma.vocabulary.findMany({
        select: {
            id: true,
            hanTraditional: true,
            hanSimplified: true,
            hanHongKong: true,
            pureCantonese: true,
            romanizationJson: true,
        },
        where: { pureCantonese: true },
    });
    console.log(`Vocab pureCantonese=true: ${rows.length}`);

    const toClear = [];
    for (const v of rows) {
        const roms = Array.isArray(v.romanizationJson) ? v.romanizationJson : [];
        const hasPinyin = roms.some((r) => r?.type === "pinyin" && String(r?.pinyin ?? "").trim());
        if (hasPinyin) toClear.push(v);
    }

    console.log(`Mâu thuẫn (pureCantonese=true NHƯNG có pinyin) → bỏ flag: ${toClear.length}`);
    console.log(`Giữ nguyên pureCantonese=true (thực sự quảng thuần): ${rows.length - toClear.length}`);

    const samples = toClear.slice(0, 25);
    console.log(`\n=== Sample (${samples.length}) ===`);
    for (const s of samples) {
        const npy = (Array.isArray(s.romanizationJson) ? s.romanizationJson : []).filter(
            (r) => r?.type === "pinyin",
        ).length;
        console.log(`- ${s.id} | ${s.hanTraditional || s.hanSimplified || s.hanHongKong} | pinyin entries: ${npy}`);
    }

    if (!isDry && toClear.length > 0) {
        await prisma.vocabulary.updateMany({
            where: { id: { in: toClear.map((v) => v.id) } },
            data: { pureCantonese: false },
        });
        console.log(`\nĐã ghi DB: ${toClear.length} vocab pure_cantonese → false.`);
    } else {
        console.log(`\n${isDry ? "DRY RUN — chưa ghi DB. Chạy lại với --apply để ghi." : "Không có gì để sửa."}`);
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
