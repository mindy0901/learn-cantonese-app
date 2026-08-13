/**
 * AUDIT (read-only) — kiểm tra `han_simplified` có đúng chuẩn simplified không.
 * Cách check: `t2s(value) === value` — nếu value chứa ký tự traditional, t2s sẽ
 * convert → khác value. (Ký tự same-form như 一/人/山 thì t2s giữ nguyên → pass.)
 *
 * Chạy: node /app/_audit_simplified.mjs
 * Ghi kết quả ra /app/_simp_audit.txt (host: backend/_simp_audit.txt).
 */
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { writeFileSync } from "node:fs";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const OpenCC = await import("opencc-js");
const t2s = OpenCC.Converter({ from: "t", to: "cn" });

const rows = await prisma.vocabulary.findMany({
    select: { id: true, hanSimplified: true, hanTraditional: true, hanHongKong: true, pinyin: true, jyutping: true },
    orderBy: { id: "asc" },
});

let withSimp = 0;
const mismatches = [];
const tradCharCount = new Map(); // ký tự traditional → số lần xuất hiện

for (const r of rows) {
    const simp = String(r.hanSimplified ?? "").trim();
    const hk = String(r.hanHongKong ?? "").trim();
    if (!simp) continue;
    withSimp++;
    const converted = String(t2s(simp) ?? "").trim();
    if (converted !== simp) {
        mismatches.push({
            id: r.id,
            simp,
            t2s: converted,
            trad: String(r.hanTraditional ?? "").trim(),
            hk,
            pinyin: r.pinyin,
            jyutping: r.jyutping,
        });
        // Tìm ký tự traditional trong value
        for (const ch of [...simp]) {
            if (String(t2s(ch) ?? "") !== ch) {
                tradCharCount.set(ch, (tradCharCount.get(ch) ?? 0) + 1);
            }
        }
    }
}

const lines = mismatches.map((m) => `${m.simp} | t2s=${m.t2s} | trad=${m.trad} | hk=${m.hk} | id=${m.id}`);
const out =
    `Tổng vocab có han_simplified: ${withSimp}\n` +
    `Mismatch (chứa traditional): ${mismatches.length}\n` +
    `--- Ký tự traditional xuất hiện ---\n` +
    [...tradCharCount.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([ch, n]) => `${ch} → ${n}`)
        .join("\n") +
    "\n--- Danh sách từ ---\n" +
    lines.join("\n");
writeFileSync("/app/_simp_audit.txt", out, "utf8");
console.log(`Tổng vocab có han_simplified: ${withSimp}`);
console.log(`Mismatch (chứa traditional): ${mismatches.length}`);
console.log(`Ký tự traditional xuất hiện (top 20):`);
for (const [ch, n] of [...tradCharCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
    console.log(`  ${ch} → ${n}`);
}
console.log("Full list written to /app/_simp_audit.txt");

await prisma.$disconnect();
