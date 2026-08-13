/**
 * Backfill `vocabularies.han_hongkong` — dùng OpenCC convert từ hán tự hiện tại.
 * - Có han_simplified → s2hk (cn→hk)
 * - Chỉ có han_traditional → t2hk (t→hk)
 *
 * Hỗ trợ --dry để preview trước khi ghi.
 * Chạy: node /app/backfill-hongkong.mjs --dry | --apply
 */
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const DRY = process.argv.includes("--dry");
const LIMIT = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] || 0);

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const OpenCC = await import("opencc-js");
const s2hk = OpenCC.Converter({ from: "cn", to: "hk" });
const t2hk = OpenCC.Converter({ from: "t", to: "hk" });

const rows = await prisma.vocabulary.findMany({
    select: { id: true, hanSimplified: true, hanTraditional: true, hanHongKong: true },
    orderBy: { id: "asc" },
    ...(LIMIT > 0 ? { take: LIMIT } : {}),
});

let filled = 0;
let skipped = 0;
const examples = [];

for (const r of rows) {
    const simp = String(r.hanSimplified ?? "").trim();
    const trad = String(r.hanTraditional ?? "").trim();
    if (!simp && !trad) {
        skipped++;
        continue;
    }

    // Nguồn ưu tiên simplified; chỉ có traditional thì dùng traditional.
    const source = simp || trad;
    const conv = simp ? s2hk : t2hk;

    const computed = String(conv(source) ?? "").trim();
    if (!computed) {
        skipped++;
        continue;
    }
    if (computed === (r.hanHongKong ?? "")) continue;

    filled++;
    if (examples.length < 8) {
        examples.push({ simp, trad, computed, old: r.hanHongKong ?? "" });
    }
    if (!DRY) {
        await prisma.vocabulary.update({
            where: { id: r.id },
            data: { hanHongKong: computed, updatedAt: new Date() },
        });
    }
}

console.log(`Total: ${rows.length} | filled: ${filled} | skipped(no han): ${skipped} | mode: ${DRY ? "DRY" : "APPLY"}`);
for (const ex of examples) {
    console.log(`  ${ex.simp || "-"} | ${ex.trad || "-"} → ${ex.computed} (was: ${ex.old || "-"})`);
}

await prisma.$disconnect();
await pool.end();
