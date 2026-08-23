/**
 * backfill-cantonese-example-yue.mjs
 * Điền `yue` (chữ Hán câu ví dụ) còn thiếu cho cantonese_vocabulary_examples.
 *
 * Lý do: cột `yue` thêm lại 08-22 — chỉ CC101 được điền han; từ cũ (wordshk/CC-Canto,
 * import 08-07) lúc import chỉ lấy jyutping + bản dịch, BỎ mất chữ Hán câu ví dụ.
 *
 * Nguồn: `data/wordshk.json` (粵典 — `defs[].egs[]` có { yue, jp, en }).
 *
 * Matching (ưu tiên):
 *   1. Theo EN (chuẩn hoá, case-insensitive) — vì jyutping trong DB đôi khi bị cắt ngắn
 *      (VD 唔掂: "ceot1 gaai1 m4 daai3 din6 waa2" thiếu đuôi). Nếu nhiều ứng viên → khớp jyutping.
 *   2. Fallback theo JYUTPING (chuẩn hoá bỏ khoảng trắng, lowercase).
 *
 * Usage:
 *   node backfill-cantonese-example-yue.mjs --dry   # preview (không ghi)
 *   node backfill-cantonese-example-yue.mjs          # ghi vào DB
 */
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { readFileSync } from "fs";

const DRY = process.argv.includes("--dry");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

/** Chuẩn hoá jyutping — bỏ khoảng trắng + lowercase ("ceoi2 siu1" → "ceoi2siu1"). */
const normJp = (s) =>
    String(s ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
/** Chuẩn hoá EN để so khớp — lowercase, dồn khoảng trắng/dấu câu. */
const normEn = (s) =>
    String(s ?? "")
        .toLowerCase()
        .replace(/[\s.,;:!?"'()…、，。]+/g, " ")
        .trim();

// ── Build index từ wordshk.json ──
const wordshk = JSON.parse(readFileSync(new URL("./data/wordshk.json", import.meta.url), "utf8"));
const rows = Array.isArray(wordshk) ? wordshk : wordshk.words || wordshk.data || [];
const byJp = new Map(); // normJp → [{ yue, en }]
const byEn = new Map(); // normEn → [{ yue, jp }]
let sourceEx = 0;
for (const r of rows) {
    for (const def of r.defs ?? []) {
        for (const eg of def.egs ?? []) {
            const yue = String(eg.yue ?? "").trim();
            if (!yue) continue;
            const en = String(eg.en ?? "").trim();
            const kp = normJp(eg.jp);
            if (kp) {
                if (!byJp.has(kp)) byJp.set(kp, []);
                byJp.get(kp).push({ yue, en });
            }
            if (en) {
                const ke = normEn(en);
                if (!byEn.has(ke)) byEn.set(ke, []);
                byEn.get(ke).push({ yue, jp: String(eg.jp ?? "") });
            }
            sourceEx += 1;
        }
    }
}
console.log(`wordshk examples: ${sourceEx} | byJp: ${byJp.size} | byEn: ${byEn.size}`);

async function main() {
    const examples = await prisma.cantoneseVocabularyExample.findMany({
        select: { id: true, yue: true, romanization: true, en: true },
    });
    let alreadyHad = 0;
    let matched = 0;
    let noSource = 0;
    const samples = [];
    for (const ex of examples) {
        if (ex.yue && ex.yue.trim()) {
            alreadyHad += 1;
            continue;
        }
        let yue = "";
        // 1) match theo EN
        const enKey = normEn(ex.en);
        if (enKey && byEn.has(enKey)) {
            const cands = byEn.get(enKey);
            if (cands.length === 1) yue = cands[0].yue;
            else {
                const jpKey = normJp(ex.romanization);
                const m = cands.find((c) => normJp(c.jp) === jpKey);
                if (m) yue = m.yue;
            }
        }
        // 2) fallback match theo JYUTPING
        if (!yue) {
            const jpKey = normJp(ex.romanization);
            if (jpKey && byJp.has(jpKey)) {
                const cands = byJp.get(jpKey);
                if (cands.length === 1) yue = cands[0].yue;
            }
        }
        if (!yue) {
            noSource += 1;
            continue;
        }
        matched += 1;
        if (samples.length < 10) samples.push(`${JSON.stringify(ex.romanization)} → ${JSON.stringify(yue)}`);
        if (!DRY) {
            await prisma.cantoneseVocabularyExample.update({ where: { id: ex.id }, data: { yue } });
        }
    }
    console.log(`[${DRY ? "DRY" : "WRITE"}] kết quả:`, { alreadyHad, matched, noSource });
    for (const s of samples) console.log("  ", s);
    console.log(DRY ? "→ DRY mode — chạy lại KHÔNG có --dry để ghi vào DB" : "→ Đã ghi xong");
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
