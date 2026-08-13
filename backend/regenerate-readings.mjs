/**
 * Regenerate readings (OVERWRITE) cho model mới:
 *   - Mandarin (pinyin entries): pinyin = pinyin-pro(han_simplified).
 *   - Cantonese (jyutping entries): jyutping = pipeline 3 tầng
 *     (cantowords/words.hk → CC-Canto → to-jyutping) trên han_hongkong.
 *
 * CHÍNH SÁCH (bảo toàn đa âm):
 *   - Vocab có ĐÚNG 1 reading bên đó → ghi đè bằng kết quả generator.
 *   - Vocab có NHIỀU reading (đa âm) → chỉ làm mới reading có giá trị khớp
 *     kết quả generator (reading "primary"); các reading phụ GIỮ NGUYÊN.
 *   - Generator trả rỗng hoặc lẫn hán tự (pinyin-pro echo / không nhận diện)
 *     → bỏ qua, giữ nguyên.
 *
 * Cập nhật cả cột phẳng pinyin/jyutping (join " / ").
 * Hỗ trợ --dry để preview. Chạy: node /app/regenerate-readings.mjs --dry | --apply
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

const norm = (s) =>
    String(s ?? "")
        .toLowerCase()
        .replace(/[\s,，/]+/g, "");
const hasCJK = (s) => /[\u3400-\u9fff]/u.test(String(s ?? ""));

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

let pyChangedCount = 0;
let jpChangedCount = 0;
let rowsChanged = 0;
const examples = [];

for (const r of rows) {
    const simp = String(r.hanSimplified ?? "").trim() || String(r.hanTraditional ?? "").trim();
    const hk = String(r.hanHongKong ?? "").trim() || String(r.hanTraditional ?? "").trim();

    // ── Generator: primary reading mỗi bên ──
    let primaryPy = "";
    if (simp) {
        const py = toPinyin(simp);
        if (py && !hasCJK(py)) primaryPy = py;
    }
    let primaryJp = "";
    if (hk) {
        const jp = lookupJyutping(hk);
        if (jp && !hasCJK(jp)) primaryJp = jp;
    }

    const roms = Array.isArray(r.romanizationJson) ? r.romanizationJson : [];
    const pyCount = roms.filter((e) => e && e.type !== "jyutping").length;
    const jpCount = roms.filter((e) => e && e.type === "jyutping").length;

    let romChanged = false;
    let pyRowChanged = false;
    let jpRowChanged = false;
    const newRoms = roms.map((e) => {
        if (!e) return e;
        const t = e.type === "jyutping" ? "jyutping" : "pinyin";
        const next = { ...e };
        if (t === "pinyin" && primaryPy) {
            const old = String(e.pinyin ?? "").trim();
            const candidate = pyCount === 1 ? primaryPy : norm(old) === norm(primaryPy) ? primaryPy : old;
            if (candidate !== old) {
                next.pinyin = candidate;
                romChanged = true;
                pyRowChanged = true;
                pyChangedCount++;
            }
        } else if (t === "jyutping" && primaryJp) {
            const old = String(e.jyutping ?? "").trim();
            const candidate = jpCount === 1 ? primaryJp : norm(old) === norm(primaryJp) ? primaryJp : old;
            if (candidate !== old) {
                next.jyutping = candidate;
                romChanged = true;
                jpRowChanged = true;
                jpChangedCount++;
            }
        }
        return next;
    });

    const flatPy = newRoms
        .filter((e) => e && e.type !== "jyutping")
        .map((e) => String(e.pinyin ?? "").trim())
        .filter(Boolean)
        .join(" / ");
    const flatJp = newRoms
        .filter((e) => e && e.type === "jyutping")
        .map((e) => String(e.jyutping ?? "").trim())
        .filter(Boolean)
        .join(" / ");

    const oldFlatPy = String(r.pinyin ?? "").trim();
    const oldFlatJp = String(r.jyutping ?? "").trim();
    const flatPyChanged = flatPy !== oldFlatPy;
    const flatJpChanged = flatJp !== oldFlatJp;

    if (pyRowChanged || jpRowChanged || flatPyChanged || flatJpChanged) {
        rowsChanged++;
        if (examples.length < 30) {
            examples.push({ simp, hk, oldPy: oldFlatPy, newPy: flatPy, oldJp: oldFlatJp, newJp: flatJp });
        }
        if (!DRY) {
            await prisma.vocabulary.update({
                where: { id: r.id },
                data: {
                    ...(flatPyChanged ? { pinyin: flatPy } : {}),
                    ...(flatJpChanged ? { jyutping: flatJp } : {}),
                    ...(romChanged ? { romanizationJson: newRoms } : {}),
                    updatedAt: new Date(),
                },
            });
        }
    }
}

console.log(
    `Total: ${rows.length} | rows changed: ${rowsChanged} | pinyin entries changed: ${pyChangedCount} | jyutping entries changed: ${jpChangedCount} | mode: ${DRY ? "DRY" : "APPLY"}`,
);
for (const ex of examples) {
    console.log(
        `  ${ex.simp} (hk=${ex.hk})  py: ${ex.oldPy || "-"} → ${ex.newPy || "-"} | jp: ${ex.oldJp || "-"} → ${ex.newJp || "-"}`,
    );
}

await prisma.$disconnect();
await pool.end();
