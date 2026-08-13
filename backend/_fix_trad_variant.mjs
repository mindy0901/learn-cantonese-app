/**
 * FIX (cần --apply) — sửa `vocabularies.han_traditional` sai variant:
 *   - Group A: trad ≠ hk, hk non-empty, hk == OpenCC s2t(simp) → set trad = hk
 *   - Group B: 5 từ sửa tay (có cả lỗi ở han_hongkong)
 *
 * Chạy: node /app/_fix_trad_variant.mjs --dry | --apply
 * Backup: "_local_backup_2026-08-13_trad_variant" (đã tạo).
 */
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const DRY = process.argv.includes("--apply") ? false : true;

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const OpenCC = await import("opencc-js");
const s2t = OpenCC.Converter({ from: "cn", to: "t" });

// Group B: sửa tay theo id → { trad, hk }
const MANUAL = {
    "44ace0ee-c715-4fb6-91d5-0766da40ed8a": { trad: "胡説", hk: "胡説" }, // 胡说: 鬍説 → 胡説
    "b1742f24-c4df-42e7-987f-b7af3686aaee": { trad: "脫口而出", hk: "脫口而出" }, // 脱口而出: 脫口而齣 + hk 脱 → 脫
    "568f9750-9ad1-4ae4-97df-5497327e9729": { trad: "脫穎而出", hk: "脫穎而出" }, // 脱颖而出: 脫穎而齣 + hk 脱 → 脫
    "94908939-8e27-4f5e-a5cc-eb499e89401b": { trad: "櫃枱", hk: "櫃枱" }, // 柜台: 櫃臺 → 櫃枱
    "3c5a1918-9a9c-46da-b19d-286178225920": { trad: "出台", hk: "出台" }, // 出台: 齣臺 → 出台
};

const rows = await prisma.vocabulary.findMany({
    select: { id: true, hanSimplified: true, hanTraditional: true, hanHongKong: true },
    orderBy: { id: "asc" },
});

const groupA = [];
for (const r of rows) {
    const simp = String(r.hanSimplified ?? "").trim();
    const trad = String(r.hanTraditional ?? "").trim();
    const hk = String(r.hanHongKong ?? "").trim();
    if (!simp || !trad || !hk || trad === hk) continue;
    const expected = String(s2t(simp) ?? "").trim();
    if (expected && hk === expected) groupA.push({ id: r.id, trad, hk });
}

let aApplied = 0;
let bApplied = 0;

for (const g of groupA) {
    if (!DRY) {
        await prisma.vocabulary.update({
            where: { id: g.id },
            data: { hanTraditional: g.hk, updatedAt: new Date() },
        });
    }
    aApplied++;
}

for (const [id, fix] of Object.entries(MANUAL)) {
    if (!DRY) {
        await prisma.vocabulary.update({
            where: { id },
            data: { hanTraditional: fix.trad, hanHongKong: fix.hk, updatedAt: new Date() },
        });
    }
    bApplied++;
}

console.log(`Mode: ${DRY ? "DRY" : "APPLY"}`);
console.log(`Group A (trad=hk): ${aApplied} rows`);
console.log(`Group B (manual): ${bApplied} rows`);
if (DRY) {
    console.log("\nSample Group A fixes:");
    for (const g of groupA.slice(0, 15)) console.log(`  ${g.trad} → ${g.hk}`);
    console.log("\nGroup B fixes:");
    for (const [id, fix] of Object.entries(MANUAL)) console.log(`  ${id} → trad=${fix.trad}, hk=${fix.hk}`);
}

await prisma.$disconnect();
