/**
 * BACKFILL — ghi đè meanings của từ vựng từ CC-Canto + words.hk.
 *
 * Quy tắc (theo yêu cầu user):
 *  - Match bằng hán tự QUẢNG (han_hongkong) + phiên âm (jyutping chuẩn hóa).
 *  - Với phiên âm match được dict → GHI ĐÈ meanings cũ bằng meanings từ dict.
 *  - Meaning nhóm theo tên dict: category = "CC-Canto" / "words.hk".
 *  - words.hk: yue (nghĩa tiếng Quảng) → vietMeanings (để translate sau), en → engMeanings.
 *  - CC-Canto: en → engMeanings (không có tiếng Việt).
 *  - Phiên âm KHÔNG match dict → giữ nguyên meanings cũ (không phá dữ liệu).
 *
 * Chạy: node /app/backfill-meanings-dict.mjs --dry | --apply
 * Backup: "_local_backup_2026-08-13_dict_meanings" (script tự tạo trước khi ghi).
 */
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { buildMeaningsJson, romanizationId } from "./lib/prismaService.js";

const APPLY = process.argv.includes("--apply");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const norm = (s) =>
    String(s ?? "")
        .replace(/\s+/g, "")
        .toLowerCase();

// ---- Load sources ----
const ccc = JSON.parse(readFileSync("/app/data/cccanto.json", "utf8"));
const whk = JSON.parse(readFileSync("/app/data/wordshk.json", "utf8"));

const cccByHan = new Map();
for (const e of ccc) {
    if (Array.isArray(e) || !(e.s || e.t)) continue;
    if (!Array.isArray(e.en) || e.en.length === 0) continue;
    const rec = { jp: norm(e.jp), en: e.en };
    for (const f of [e.s, e.t]) {
        const k = norm(f);
        if (!k) continue;
        if (!cccByHan.has(k)) cccByHan.set(k, []);
        cccByHan.get(k).push(rec);
    }
}
const whkByHan = new Map();
for (const e of whk) {
    if (!e || !(e.s || e.t)) continue;
    if (!Array.isArray(e.defs) || e.defs.length === 0) continue;
    const rec = { jp: norm(e.jp), defs: e.defs };
    for (const f of [e.t, e.s]) {
        const k = norm(f);
        if (!k) continue;
        if (!whkByHan.has(k)) whkByHan.set(k, []);
        whkByHan.get(k).push(rec);
    }
}

// ---- Build meanings from a dict entry ----
function buildCccMeanings(rec) {
    return rec.en.map((enText, i) => ({
        id: randomUUID(),
        category: "CC-Canto",
        vietMeanings: "",
        engMeanings: String(enText ?? "").trim(),
        examples: [],
        position: i,
    }));
}

function buildWhkMeanings(rec) {
    return rec.defs.map((d, i) => ({
        id: randomUUID(),
        category: "words.hk",
        vietMeanings: String(d.yue ?? "").trim(),
        engMeanings: String(d.en ?? "").trim(),
        examples: (Array.isArray(d.egs) ? d.egs : []).map((eg, j) => ({
            id: randomUUID(),
            hanSimplified: "",
            hanTraditional: String(eg.yue ?? "").trim(),
            hanExample: String(eg.yue ?? "").trim(),
            jyutpingExample: String(eg.jp ?? "").trim(),
            pinyinExample: "",
            vietExamples: "",
            engExamples: String(eg.en ?? "").trim(),
            position: j,
        })),
        position: i,
    }));
}

// ---- Fetch vocabularies ----
const rows = await prisma.vocabulary.findMany({
    select: {
        id: true,
        hanHongKong: true,
        hanTraditional: true,
        hanSimplified: true,
        romanizationJson: true,
        meaningsJson: true,
        jyutping: true,
        pinyin: true,
        sinoVietnamese: true,
    },
    orderBy: { id: "asc" },
});

let overwritten = 0; // từ có ≥1 phiên âm bị ghi đè
let romOverwritten = 0; // tổng phiên âm bị ghi đè
let touched = 0;

// Backup toàn bộ trước khi ghi
if (APPLY) {
    await pool.query(
        `CREATE TABLE IF NOT EXISTS "_local_backup_2026-08-13_dict_meanings" (LIKE vocabularies INCLUDING ALL)`,
    );
    const chk = await pool.query(`SELECT COUNT(*)::int AS c FROM "_local_backup_2026-08-13_dict_meanings"`);
    if (chk.rows[0].c === 0) {
        await pool.query(`INSERT INTO "_local_backup_2026-08-13_dict_meanings" SELECT * FROM vocabularies`);
        console.log("Backup created.");
    } else {
        console.log("Backup already exists — skip.");
    }
}

for (const v of rows) {
    const han = norm(v.hanHongKong) || norm(v.hanTraditional) || norm(v.hanSimplified);
    if (!han) continue;
    const cccRecs = cccByHan.get(han) ?? [];
    const whkRecs = whkByHan.get(han) ?? [];
    if (cccRecs.length === 0 && whkRecs.length === 0) continue;

    // Current romanizations (fallback 1 entry từ flat)
    let roms =
        Array.isArray(v.romanizationJson) && v.romanizationJson.length > 0
            ? v.romanizationJson
            : [
                  {
                      id: romanizationId(v.pinyin, v.jyutping),
                      pinyin: (v.pinyin ?? "").toLowerCase().trim(),
                      jyutping: (v.jyutping ?? "").toLowerCase().trim(),
                      sinoVietnamese: v.sinoVietnamese ?? "",
                      meanings: v.meaningsJson?.meanings ?? [],
                      examples: v.meaningsJson?.examples ?? [],
                  },
              ];

    let changed = false;
    const nextRoms = roms.map((r) => {
        const jp = norm(r.jyutping);
        const cMatch = jp ? cccRecs.find((rec) => rec.jp === jp) : null;
        const wMatch = jp ? whkRecs.find((rec) => rec.jp === jp) : null;
        if (!cMatch && !wMatch) return r; // giữ nguyên phiên âm này

        const meanings = [];
        if (cMatch) meanings.push(...buildCccMeanings(cMatch));
        if (wMatch) meanings.push(...buildWhkMeanings(wMatch));
        changed = true;
        romOverwritten++;
        return { ...r, meanings };
    });

    if (changed) {
        overwritten++;
        const primary = nextRoms[0];
        const payload = {
            romanizationJson: nextRoms,
            meaningsJson: buildMeaningsJson(primary?.meanings ?? []),
            updatedAt: new Date(),
        };
        if (APPLY) {
            await prisma.vocabulary.update({ where: { id: v.id }, data: payload });
        }
        touched++;
    }
}

console.log(`Mode: ${APPLY ? "APPLY" : "DRY"}`);
console.log(`Tổng từ vựng: ${rows.length}`);
console.log(`→ Từ sẽ bị GHI ĐÈ meanings: ${overwritten}`);
console.log(`→ Phiên âm bị ghi đè: ${romOverwritten}`);
console.log(`→ (touched = ${touched})`);

await prisma.$disconnect();
