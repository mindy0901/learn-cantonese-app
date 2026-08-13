/**
 * AUDIT (read-only) — tìm `vocabularies.han_traditional` có khả năng sai variant
 * bằng cách so sánh với OpenCC s2t(han_simplified).
 *
 * Mismatch không phải lúc nào cũng là lỗi (nguồn data có convention riêng),
 * nên script chỉ in ra để người review quyết định.
 *
 * Chạy: node /app/_audit_trad_variant.mjs [--limit=N]
 */
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const LIMIT = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] || 0);

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const OpenCC = await import("opencc-js");
const s2t = OpenCC.Converter({ from: "cn", to: "t" });
const s2hk = OpenCC.Converter({ from: "cn", to: "hk" });

const rows = await prisma.vocabulary.findMany({
    select: {
        id: true,
        hanSimplified: true,
        hanTraditional: true,
        hanHongKong: true,
        pinyin: true,
        jyutping: true,
    },
    orderBy: { id: "asc" },
    ...(LIMIT > 0 ? { take: LIMIT } : {}),
});

const mismatches = [];
const groupA = []; // DIFF-HK, hk == s2t (hk non-empty) → an toàn set trad = hk
const groupB = []; // DIFF-HK, hk != s2t → cần review từng cái
const groupC = []; // SAME-AS-HK (trad == hk, cả 2 khác s2t) → để nguyên
let compared = 0;

for (const r of rows) {
    const simp = String(r.hanSimplified ?? "").trim();
    const trad = String(r.hanTraditional ?? "").trim();
    const hk = String(r.hanHongKong ?? "").trim();

    if (!simp || !trad) continue;
    compared++;

    const expected = String(s2t(simp) ?? "").trim();
    if (!expected || expected === trad) continue;

    mismatches.push({
        id: r.id,
        simp,
        trad,
        hk,
        s2t: expected,
        s2hk_of_simp: String(s2hk(simp) ?? "").trim(),
        pinyin: r.pinyin,
        jyutping: r.jyutping,
    });

    if (trad === hk) {
        groupC.push({ id: r.id, simp, trad, hk, s2t: expected });
    } else if (hk && hk === expected) {
        groupA.push({ id: r.id, simp, trad, hk });
    } else {
        groupB.push({ id: r.id, simp, trad, hk, s2t: expected });
    }
}

console.log(`Compared: ${compared} | mismatches: ${mismatches.length}`);
console.log(`Group A (set trad=hk, an toàn): ${groupA.length}`);
console.log(`Group B (trad!=hk, hk!=s2t, cần review): ${groupB.length}`);
console.log(`Group C (trad==hk, để nguyên): ${groupC.length}`);

console.log("\n=== GROUP B (review từng cái) ===");
for (const m of groupB) {
    console.log(`[B] ${m.simp} | trad=${m.trad} | s2t=${m.s2t} | hk=${m.hk} | id=${m.id}`);
}

console.log("\n=== GROUP C (để nguyên, chỉ tham khảo) ===");
for (const m of groupC) {
    console.log(`[C] ${m.simp} | trad=${m.trad} | hk=${m.hk} | s2t=${m.s2t} | id=${m.id}`);
}

await prisma.$disconnect();
