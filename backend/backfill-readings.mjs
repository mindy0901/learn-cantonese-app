/**
 * Backfill readings (pinyin + jyutping) theo mô hình hiển thị mới:
 *   - Giản thể + Phồn thể hiển thị PINYIN (nguồn: pinyin-pro).
 *   - Phồn thể (HK) hiển thị JYUTPING (nguồn: pipeline 3 tầng cantowords → CC-Canto → to-jyutping).
 *
 * CHÍNH SÁCH AN TOÀN (đã xác nhận user 2026-08-12):
 *   - Chỉ FILL khi còn TRỐNG — KHÔNG ghi đè readings đã có (giữ nguyên đa âm).
 *   - Pinyin: BỎ QUA kí tự Cantonese-only (có jyutping trong kho, ko có pinyin)
 *     và kí tự pinyin-pro ko nhận diện (trả về nguyên ký tự) → không sinh pinyin sai.
 *   - Jyutping: lookupJyutping(han_hongkong) — chỉ fill khi trống.
 *
 * Hỗ trợ --dry để preview trước khi ghi.
 * Chạy: node /app/backfill-readings.mjs --dry | --apply
 */
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { toPinyin } from "./lib/pinyin.js";
import { lookupJyutping } from "./lib/jyutpingLookup.js";

const DRY = process.argv.includes("--dry");
const LIMIT = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] || 0);

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

// ── Kho hán tự: nhận biết kí tự Cantonese-only (có jyutping, ko có pinyin) ──
const hanChars = await prisma.hanCharacter.findMany({
    select: { hanTraditional: true, hanSimplified: true, pinyin: true, jyutping: true },
});
const charInfo = new Map(); // char → { hasPinyin, hasJyutping }
for (const hc of hanChars) {
    const hasPinyin = Array.isArray(hc.pinyin) && hc.pinyin.some((p) => String(p ?? "").trim());
    const hasJyutping = Array.isArray(hc.jyutping) && hc.jyutping.some((j) => String(j ?? "").trim());
    for (const ch of [hc.hanTraditional, hc.hanSimplified]) {
        const key = String(ch ?? "").trim();
        if (!key) continue;
        const prev = charInfo.get(key) ?? { hasPinyin: false, hasJyutping: false };
        charInfo.set(key, { hasPinyin: prev.hasPinyin || hasPinyin, hasJyutping: prev.hasJyutping || hasJyutping });
    }
}

/** Sinh pinyin an toàn: bỏ qua kí tự Cantonese-only / pinyin-pro trả nguyên ký tự. */
function safePinyin(text) {
    const parts = [];
    for (const ch of String(text ?? "")) {
        if (!/[\u3400-\u9fff]/.test(ch)) continue;
        const info = charInfo.get(ch);
        if (info && info.hasJyutping && !info.hasPinyin) continue; // Cantonese-only
        const py = toPinyin(ch);
        if (!py || py === ch) continue; // pinyin-pro ko nhận diện
        parts.push(py);
    }
    return parts.join(" ");
}

const rows = await prisma.vocabulary.findMany({
    select: {
        id: true,
        hanSimplified: true,
        hanTraditional: true,
        hanHongKong: true,
        pinyin: true,
        jyutping: true,
        romanizationJson: true,
    },
    orderBy: { id: "asc" },
    ...(LIMIT > 0 ? { take: LIMIT } : {}),
});

let flatPinyinFilled = 0;
let flatJyutpingFilled = 0;
let romPinyinFilled = 0;
let romJyutpingFilled = 0;
const examples = [];

for (const r of rows) {
    const simp = String(r.hanSimplified ?? "").trim();
    const trad = String(r.hanTraditional ?? "").trim();
    const hk = String(r.hanHongKong ?? "").trim();
    const oldPy = String(r.pinyin ?? "").trim();
    const oldJp = String(r.jyutping ?? "").trim();

    // ── Flat pinyin: chỉ fill khi trống ──
    let newPy = oldPy;
    if (!oldPy && (trad || simp)) {
        const py = safePinyin(trad || simp);
        if (py) newPy = py;
    }

    // ── Flat jyutping: chỉ fill khi trống ──
    let newJp = oldJp;
    if (!oldJp && hk) {
        const jp = lookupJyutping(hk);
        if (jp) newJp = jp;
    }

    // ── Romanization entries: chỉ fill trống ──
    let romChanged = false;
    let roms = Array.isArray(r.romanizationJson) ? r.romanizationJson : [];
    roms = roms.map((ro) => {
        if (!ro) return ro;
        let c = false;
        const next = { ...ro };
        if (!String(ro.pinyin ?? "").trim() && (trad || simp)) {
            const py = safePinyin(trad || simp);
            if (py) {
                next.pinyin = py;
                c = true;
                romPinyinFilled++;
            }
        }
        if (!String(ro.jyutping ?? "").trim() && hk) {
            const jp = lookupJyutping(hk);
            if (jp) {
                next.jyutping = jp;
                c = true;
                romJyutpingFilled++;
            }
        }
        if (c) romChanged = true;
        return next;
    });

    const pyChanged = newPy !== oldPy;
    const jpChanged = newJp !== oldJp;
    if (pyChanged) flatPinyinFilled++;
    if (jpChanged) flatJyutpingFilled++;

    if (examples.length < 10 && (pyChanged || jpChanged || romChanged)) {
        examples.push({ simp, trad, hk, oldPy, newPy, oldJp, newJp });
    }

    if (!DRY && (pyChanged || jpChanged || romChanged)) {
        await prisma.vocabulary.update({
            where: { id: r.id },
            data: {
                ...(pyChanged ? { pinyin: newPy } : {}),
                ...(jpChanged ? { jyutping: newJp } : {}),
                ...(romChanged ? { romanizationJson: roms } : {}),
                updatedAt: new Date(),
            },
        });
    }
}

console.log(
    `Total: ${rows.length} | flatPinyinFilled: ${flatPinyinFilled} | flatJyutpingFilled: ${flatJyutpingFilled} | ` +
        `romPinyinFilled: ${romPinyinFilled} | romJyutpingFilled: ${romJyutpingFilled} | mode: ${DRY ? "DRY" : "APPLY"}`,
);
for (const ex of examples) {
    console.log(
        `  ${ex.simp || "-"} | ${ex.trad || "-"} | ${ex.hk || "-"} → py: "${ex.oldPy}"→"${ex.newPy}" jp: "${ex.oldJp}"→"${ex.newJp}"`,
    );
}

await prisma.$disconnect();
await pool.end();
