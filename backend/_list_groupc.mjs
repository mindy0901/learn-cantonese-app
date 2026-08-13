/**
 * LIST (read-only) — ghi danh sách Group C (trad==hk, khác OpenCC s2t) ra file
 * /app/_groupc.txt (host: backend/_groupc.txt) để review trước khi chuẩn hóa.
 */
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { writeFileSync } from "node:fs";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const OpenCC = await import("opencc-js");
const s2t = OpenCC.Converter({ from: "cn", to: "t" });

const rows = await prisma.vocabulary.findMany({
    select: { id: true, hanSimplified: true, hanTraditional: true, hanHongKong: true },
    orderBy: { id: "asc" },
});

const groupC = [];
for (const r of rows) {
    const simp = String(r.hanSimplified ?? "").trim();
    const trad = String(r.hanTraditional ?? "").trim();
    const hk = String(r.hanHongKong ?? "").trim();
    if (!simp || !trad) continue;
    const expected = String(s2t(simp) ?? "").trim();
    if (expected && expected !== trad && trad === hk) {
        groupC.push({ id: r.id, simp, trad, hk, s2t: expected });
    }
}

const lines = groupC.map((g) => `${g.simp} | trad/hk=${g.trad} | s2t=${g.s2t} | id=${g.id}`);
const out = `Group C count: ${groupC.length}\n` + lines.join("\n");
writeFileSync("/app/_groupc.txt", out, "utf8");
console.log(`Written ${groupC.length} rows to /app/_groupc.txt`);

await prisma.$disconnect();
