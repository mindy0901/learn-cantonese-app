/**
 * Backfill `vocabularies.han_hongkong` (hán tự CẢNG — cantonese.hanzi_traditional)
 * bằng OpenCC **s2hkp** (giản thể → Hồng Kông, có phrase) — GHI ĐÈ toàn bộ.
 *
 * Nguồn: han_simplified. Hàng thiếu han_simplified → bỏ qua (giữ nguyên han_hongkong).
 *
 * Hỗ trợ --dry để preview trước khi ghi.
 * Chạy: node /app/backfill-hongkong-s2hkp.mjs --dry | --apply
 */
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const DRY = process.argv.includes("--dry");
const LIMIT = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] || 0);

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const OpenCC = await import("opencc-js");
const s2hkp = OpenCC.Converter({ from: "cn", to: "hkp" });

const rows = await prisma.vocabulary.findMany({
    select: { id: true, hanSimplified: true, hanHongKong: true },
    orderBy: { id: "asc" },
    ...(LIMIT > 0 ? { take: LIMIT } : {}),
});

let changed = 0;
let same = 0;
let skipped = 0;
const examples = [];

for (const r of rows) {
    const simp = String(r.hanSimplified ?? "").trim();
    if (!simp) {
        skipped++;
        continue;
    }
    const computed = String(s2hkp(simp) ?? "").trim();
    if (!computed) {
        skipped++;
        continue;
    }
    const old = String(r.hanHongKong ?? "").trim();
    if (computed === old) {
        same++;
        continue;
    }
    changed++;
    if (examples.length < 30) {
        examples.push({ simp, old, computed });
    }
    if (!DRY) {
        await prisma.vocabulary.update({
            where: { id: r.id },
            data: { hanHongKong: computed, updatedAt: new Date() },
        });
    }
}

console.log(
    `Total: ${rows.length} | changed: ${changed} | same: ${same} | skipped(no simp): ${skipped} | mode: ${DRY ? "DRY" : "APPLY"}`,
);
for (const ex of examples) {
    console.log(`  ${ex.simp} | ${ex.old || "-"} → ${ex.computed}`);
}

await prisma.$disconnect();
await pool.end();
