/**
 * backfill-pinyin-sandhi.mjs
 * Áp BIẾN ÂM THANH 3 (三声变调: 3+3 → 2+3) cho pinyin VÍ DỤ tiếng Quan Thoại
 * (`mandarin_vocabulary_examples.romanization`).
 *
 * Lý do (2026-08-23): pinyin-pro `toneSandhi: true` KHÔNG xử lý thanh 3 (chỉ 一/不)
 * → ví dụ như "你好" lưu là "nǐ hǎo" thay vì "ní hǎo" (cách đọc thật khi nói liền).
 * Đã thêm `applyThirdToneSandhi` vào `lib/pinyin.js` cho dữ liệu mới — script này
 * backfill dữ liệu CŨ đã lưu trong DB.
 *
 * Chỉ update row nào thay đổi (2+ thanh 3 liền nhau). Không đụng cột khác.
 *
 * Usage (chạy trong container backend):
 *   node backfill-pinyin-sandhi.mjs --dry   # preview
 *   node backfill-pinyin-sandhi.mjs          # ghi DB
 */
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { applyThirdToneSandhi } from "./lib/pinyin.js";

const DRY = process.argv.includes("--dry");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
    const rows = await prisma.mandarinVocabularyExample.findMany({
        where: { romanization: { not: "" } },
        select: { id: true, zh: true, romanization: true },
    });
    console.log(`mandarin examples có pinyin: ${rows.length}`);

    const changed = [];
    for (const ex of rows) {
        const next = applyThirdToneSandhi(ex.romanization);
        if (next !== ex.romanization) {
            changed.push({ ...ex, next });
        }
    }
    console.log(`[${DRY ? "DRY" : "WRITE"}] rows đổi (2+ thanh 3 liền nhau): ${changed.length}`);
    for (const c of changed.slice(0, 25)) {
        console.log(`  ${(c.zh || "").slice(0, 18)}  ${c.romanization}  →  ${c.next}`);
    }
    if (changed.length > 25) console.log(`  … và ${changed.length - 25} rows nữa`);

    if (!DRY) {
        // Update theo batch để tránh query đơn lẻ quá nhiều.
        const BATCH = 500;
        let done = 0;
        for (let i = 0; i < changed.length; i += BATCH) {
            const batch = changed.slice(i, i + BATCH);
            await prisma.$transaction(
                batch.map((c) =>
                    prisma.mandarinVocabularyExample.update({
                        where: { id: c.id },
                        data: { romanization: c.next },
                    }),
                ),
            );
            done += batch.length;
            console.log(`  … đã update ${done}/${changed.length}`);
        }
        console.log("→ Đã ghi xong");
    } else {
        console.log("→ DRY mode — chạy lại KHÔNG có --dry để ghi DB");
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
