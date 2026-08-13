/**
 * Backfill `vocabularies.han_traditional` (Phồn thể) — dùng OpenCC s2t
 * (cn→t) convert từ `han_simplified` cho từ CHỈ thiếu traditional
 * (không ghi đè traditional đã có).
 *
 * Hỗ trợ --dry để preview trước khi ghi.
 * Chạy: node /app/backfill-traditional.mjs --dry | --apply
 */
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const DRY = process.argv.includes("--dry");
const LIMIT = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] || 0);

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const OpenCC = await import("opencc-js");
const s2t = OpenCC.Converter({ from: "cn", to: "t" });

const rows = await prisma.vocabulary.findMany({
    select: { id: true, hanSimplified: true, hanTraditional: true },
    orderBy: { id: "asc" },
    ...(LIMIT > 0 ? { take: LIMIT } : {}),
});

// Chỉ xử lý từ CÓ simplified và THIẾU traditional (không ghi đè).
const targets = rows.filter((r) => {
    const simp = String(r.hanSimplified ?? "").trim();
    const trad = String(r.hanTraditional ?? "").trim();
    return simp.length > 0 && trad.length === 0;
});

let filled = 0;
const examples = [];

for (const r of targets) {
    const simp = String(r.hanSimplified ?? "").trim();
    const computed = String(s2t(simp) ?? "").trim();
    if (!computed) continue;

    filled++;
    if (examples.length < 10) {
        examples.push({ simp, computed });
    }
    if (!DRY) {
        await prisma.vocabulary.update({
            where: { id: r.id },
            data: { hanTraditional: computed, updatedAt: new Date() },
        });
    }
}

console.log(`Total target: ${targets.length} | filled: ${filled} | mode: ${DRY ? "DRY" : "APPLY"}`);
for (const ex of examples) {
    console.log(`  ${ex.simp} → ${ex.computed}`);
}

await prisma.$disconnect();
await pool.end();
