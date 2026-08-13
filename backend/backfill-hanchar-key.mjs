/**
 * Backfill `vocabularies.han_characters` (JSONB) sang format mới:
 * - key `character` → `hanTraditional`
 * - LUÔN có key `hanSimplified` (trống "" nếu không có form giản thể riêng)
 * - thứ tự key: sinoVietnamese → hanSimplified → hanTraditional → pinyin → jyutping
 *
 * Hỗ trợ --dry để preview trước khi ghi.
 * Chạy: node /app/backfill-hanchar-key.mjs --dry | --apply
 */
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const DRY = process.argv.includes("--dry");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

/** Rebuild one breakdown item to the new key shape/order. */
function normalizeItem(item) {
    const trad = String(item?.hanTraditional ?? item?.character ?? "").trim();
    if (!trad) return null;
    return {
        sinoVietnamese: item?.sinoVietnamese ?? null,
        hanSimplified: String(item?.hanSimplified ?? "").trim(),
        hanTraditional: trad,
        pinyin: item?.pinyin ?? null,
        jyutping: item?.jyutping ?? null,
    };
}

function normalizeBreakdown(breakdown) {
    if (!Array.isArray(breakdown)) return null;
    const next = breakdown.map(normalizeItem).filter(Boolean);
    return next.length > 0 ? next : null;
}

const rows = await prisma.vocabulary.findMany({
    select: { id: true, hanCharacters: true },
    where: { hanCharacters: { not: null } },
});

let changed = 0;
let unchanged = 0;
for (const r of rows) {
    const next = normalizeBreakdown(r.hanCharacters);
    if (next === null) {
        unchanged++;
        continue;
    }
    const prevStr = JSON.stringify(r.hanCharacters);
    const nextStr = JSON.stringify(next);
    if (prevStr === nextStr) {
        unchanged++;
        continue;
    }
    changed++;
    if (!DRY) {
        await prisma.vocabulary.update({
            where: { id: r.id },
            data: { hanCharacters: next, updatedAt: new Date() },
        });
    }
}

console.log(`Total: ${rows.length} | changed: ${changed} | unchanged: ${unchanged} | mode: ${DRY ? "DRY" : "APPLY"}`);

await prisma.$disconnect();
await pool.end();
