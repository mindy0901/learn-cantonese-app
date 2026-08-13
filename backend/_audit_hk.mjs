/**
 * AUDIT (read-only) — kiểm tra `vocabularies.han_hongkong` có khớp OpenCC s2hk(han_simplified) không.
 * Chỉ so sánh từ CÓ cả simplified + hongkong (từ HK-only hoặc thiếu simp thì bỏ qua).
 *
 * Chạy: node /app/_audit_hk.mjs
 * Ghi kết quả ra /app/_hk_mismatch.txt (host: backend/_hk_mismatch.txt).
 */
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { writeFileSync } from "node:fs";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const OpenCC = await import("opencc-js");
const s2hk = OpenCC.Converter({ from: "cn", to: "hk" });

const rows = await prisma.vocabulary.findMany({
    select: { id: true, hanSimplified: true, hanTraditional: true, hanHongKong: true, pinyin: true, jyutping: true },
    orderBy: { id: "asc" },
});

const mismatches = [];
let compared = 0;
let skipped = 0;

for (const r of rows) {
    const simp = String(r.hanSimplified ?? "").trim();
    const hk = String(r.hanHongKong ?? "").trim();
    if (!simp || !hk) {
        if (!hk) skipped++;
        continue;
    }
    compared++;
    const expected = String(s2hk(simp) ?? "").trim();
    if (expected && expected !== hk) {
        mismatches.push({
            id: r.id,
            simp,
            trad: String(r.hanTraditional ?? "").trim(),
            hk,
            s2hk: expected,
            pinyin: r.pinyin,
            jyutping: r.jyutping,
        });
    }
}

const lines = mismatches.map((m) => `${m.simp} | hk=${m.hk} | s2hk=${m.s2hk} | trad=${m.trad} | id=${m.id}`);
const out =
    `Compared: ${compared} | skipped(no hk): ${skipped} | mismatches: ${mismatches.length}\n` + lines.join("\n");
writeFileSync("/app/_hk_mismatch.txt", out, "utf8");
console.log(`Compared: ${compared} | no-hk skipped: ${skipped} | mismatches: ${mismatches.length}`);
console.log("Full list written to /app/_hk_mismatch.txt");

await prisma.$disconnect();
