/**
 * AUDIT (read-only) — phân loại các từ có han_simplified chứa phồn thể:
 * phồn thể chuẩn (t), phồn thể HK (hk), hay khác cả 2.
 * Chạy: node /app/_audit_simplified_type.mjs
 */
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { writeFileSync } from "node:fs";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const OpenCC = await import("opencc-js");
const t2s = OpenCC.Converter({ from: "t", to: "cn" });
const s2t = OpenCC.Converter({ from: "cn", to: "t" });
const s2hk = OpenCC.Converter({ from: "cn", to: "hk" });

const rows = await prisma.vocabulary.findMany({
    select: { id: true, hanSimplified: true, hanTraditional: true, hanHongKong: true },
    orderBy: { id: "asc" },
});

const groups = { both: [], onlyT: [], onlyHk: [], neither: [] };
for (const r of rows) {
    const simp = String(r.hanSimplified ?? "").trim();
    if (!simp) continue;
    const converted = String(t2s(simp) ?? "").trim();
    if (converted === simp) continue; // không chứa phồn thể
    const t = String(s2t(converted) ?? "").trim();
    const hk = String(s2hk(converted) ?? "").trim();
    const sameT = simp === t;
    const sameHk = simp === hk;
    const label = `${simp} | t2s=${converted} | t=${t} | hk=${hk}`;
    if (sameT && sameHk) groups.both.push(label);
    else if (sameT) groups.onlyT.push(label);
    else if (sameHk) groups.onlyHk.push(label);
    else groups.neither.push(label);
}

const out =
    `=== Giống CẢ t & hk: ${groups.both.length} ===\n${groups.both.join("\n")}\n` +
    `\n=== CHỈ theo phồn thể chuẩn (t): ${groups.onlyT.length} ===\n${groups.onlyT.join("\n")}\n` +
    `\n=== CHỈ theo phồn thể HK (hk): ${groups.onlyHk.length} ===\n${groups.onlyHk.join("\n")}\n` +
    `\n=== Khác cả t & hk: ${groups.neither.length} ===\n${groups.neither.join("\n")}\n`;
writeFileSync("/app/_simp_type.txt", out, "utf8");
console.log("Written to /app/_simp_type.txt");

await prisma.$disconnect();
