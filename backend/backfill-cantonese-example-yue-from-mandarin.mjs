/**
 * backfill-cantonese-example-yue-from-mandarin.mjs
 * Điền `yue` (chữ Hán câu ví dụ) còn thiếu cho cantonese_vocabulary_examples bằng cách
 * match với ví dụ MANDARIN cùng nghĩa (vi/en) rồi convert han giản thể → HK phồn (s2hkp).
 *
 * Lý do: full sync từ (VD 打) tạo ví dụ cantonese có jyutping + bản dịch nhưng MẤT chữ Hán
 * (yue) — trong khi ví dụ mandarin tương ứng (cùng nghĩa vi/en) CÓ đầy đủ han. (2026-08-23)
 *
 * Usage (chạy trong container backend):
 *   node backfill-cantonese-example-yue-from-mandarin.mjs --dry   # preview
 *   node backfill-cantonese-example-yue-from-mandarin.mjs          # ghi DB
 */
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { s2hkp } from "./lib/openccHK.js";

const DRY = process.argv.includes("--dry");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const norm = (s) =>
    String(s ?? "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();

async function main() {
    // Cantonese examples thiếu yue.
    const missing = await prisma.cantoneseVocabularyExample.findMany({
        where: { yue: "" },
        select: { id: true, yue: true, vi: true, en: true, romanization: true },
    });
    console.log(`cantonese examples thiếu yue: ${missing.length}`);

    // Tất cả mandarin examples có han (zh) — index theo vi/en chuẩn hoá.
    const mandarin = await prisma.mandarinVocabularyExample.findMany({
        select: { zh: true, vi: true, en: true },
    });
    const byVi = new Map();
    const byEn = new Map();
    for (const m of mandarin) {
        const zh = String(m.zh ?? "").trim();
        if (!zh) continue;
        const kvi = norm(m.vi);
        const ken = norm(m.en);
        if (kvi && !byVi.has(kvi)) byVi.set(kvi, m);
        if (ken && !byEn.has(ken)) byEn.set(ken, m);
    }

    let updated = 0;
    let noMatch = 0;
    const samples = [];
    for (const ex of missing) {
        const src = byVi.get(norm(ex.vi)) || byEn.get(norm(ex.en));
        if (!src) {
            noMatch += 1;
            continue;
        }
        const yue = s2hkp(src.zh).trim();
        if (!yue) {
            noMatch += 1;
            continue;
        }
        updated += 1;
        if (samples.length < 12) samples.push(`${ex.romanization}: "${src.zh}" → "${yue}"`);
        if (!DRY) {
            await prisma.cantoneseVocabularyExample.update({ where: { id: ex.id }, data: { yue } });
        }
    }
    console.log(`[${DRY ? "DRY" : "WRITE"}]`, { missing: missing.length, updated, noMatch });
    for (const s of samples) console.log("  ", s);
    console.log(DRY ? "→ DRY mode — chạy lại KHÔNG có --dry để ghi DB" : "→ Đã ghi xong");
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
