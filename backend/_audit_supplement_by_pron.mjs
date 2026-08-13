/**
 * AUDIT (read-only / dry run) — đếm từ sẽ được THÊM meaning khi backfill từ
 * CC-Canto / words.hk, chia theo PHIÊN ÂM (jyutping) của hán tự.
 *
 * Quy tắc:
 *  - Match bằng hán tự QUẢNG (han_hongkong) + phiên âm (jyutping chuẩn hóa).
 *  - Meaning mới được nhóm với tên dict: category = "CC-Canto" / "words.hk".
 *
 * Chạy: node /app/_audit_supplement_by_pron.mjs
 * KHÔNG ghi database.
 */
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { readFileSync } from "node:fs";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const norm = (s) =>
    String(s ?? "")
        .replace(/\s+/g, "")
        .toLowerCase();
const normText = (s) =>
    String(s ?? "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, "");

// ---- Load sources ----
const ccc = JSON.parse(readFileSync("/app/data/cccanto.json", "utf8"));
const whk = JSON.parse(readFileSync("/app/data/wordshk.json", "utf8"));

// Map: han(normalized) -> [{ jp, en[] }]  (CC-Canto)
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

// Map: han(normalized) -> [{ jp, defs:[{en,yue}] }]  (words.hk)
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

const rows = await prisma.vocabulary.findMany({
    select: {
        id: true,
        hanHongKong: true,
        hanTraditional: true,
        hanSimplified: true,
        romanizationJson: true,
        meaningsJson: true,
        jyutping: true,
    },
});

function romanizations(v) {
    const roms = Array.isArray(v.romanizationJson) && v.romanizationJson.length > 0 ? v.romanizationJson : [];
    if (roms.length > 0)
        return roms.map((r) => ({ jp: r.jyutping ?? "", meanings: Array.isArray(r.meanings) ? r.meanings : [] }));
    // fallback flat
    const meanings = v.meaningsJson?.meanings ?? [];
    return [{ jp: v.jyutping ?? "", meanings }];
}

function existingTexts(meanings) {
    const set = new Set();
    for (const m of meanings ?? []) {
        if ((m.vietMeanings ?? "").trim()) set.add("vi|" + normText(m.vietMeanings));
        if ((m.engMeanings ?? "").trim()) set.add("en|" + normText(m.engMeanings));
    }
    return set;
}

let total = 0;
let wordsGain = 0; // từ có ít nhất 1 meaning mới
let wordsCcc = 0;
let wordsWhk = 0;
let cccNewTotal = 0;
let whkNewTotal = 0;
let matchedByPron = 0; // tổng cặp (từ × phiên âm) match được dict
const samples = [];

for (const v of rows) {
    total++;
    const han = norm(v.hanHongKong) || norm(v.hanTraditional) || norm(v.hanSimplified);
    if (!han) continue;

    const cccRecs = cccByHan.get(han) ?? [];
    const whkRecs = whkByHan.get(han) ?? [];

    let gained = false;
    let cccGained = false;
    let whkGained = false;
    let cccNew = 0;
    let whkNew = 0;

    for (const r of romanizations(v)) {
        const jp = norm(r.jp);
        if (!jp) continue;
        const existing = existingTexts(r.meanings);

        // CC-Canto match by jyutping
        const cMatch = cccRecs.find((rec) => rec.jp === jp) || (!jp ? cccRecs[0] : null);
        if (cMatch && cccRecs.some((rec) => rec.jp === jp)) {
            for (const en of cMatch.en) {
                const t = normText(en);
                if (t && !existing.has("en|" + t)) {
                    cccNew++;
                    cccGained = true;
                }
            }
        }

        // words.hk match by jyutping
        const wMatch = whkRecs.find((rec) => rec.jp === jp);
        if (wMatch) {
            for (const d of wMatch.defs) {
                if ((d.en ?? "").trim()) {
                    const t = normText(d.en);
                    if (t && !existing.has("en|" + t)) {
                        whkNew++;
                        whkGained = true;
                    }
                }
                if ((d.yue ?? "").trim()) {
                    const t = normText(d.yue);
                    if (t && !existing.has("vi|" + t) && !existing.has("en|" + t)) {
                        whkNew++;
                        whkGained = true;
                    }
                }
            }
        }
        if (cMatch || wMatch) matchedByPron++;
    }

    if (cccGained) {
        wordsCcc++;
        cccNewTotal += cccNew;
    }
    if (whkGained) {
        wordsWhk++;
        whkNewTotal += whkNew;
    }
    if (cccGained || whkGained) {
        gained = true;
        wordsGain++;
        if (samples.length < 10)
            samples.push({ han: v.hanHongKong || v.hanTraditional || v.hanSimplified, cccNew, whkNew });
    }
}

console.log("=== AUDIT: bổ sung meaning theo HÁN TỰ QUẢNG + PHIÊN ÂM (dry run) ===");
console.log(`Tổng từ vựng app: ${total}`);
console.log(`→ Từ sẽ được THÊM meaning (≥1): ${wordsGain}`);
console.log(`   - Thêm từ CC-Canto: ${wordsCcc} từ (tổng ${cccNewTotal} meaning, nhóm "CC-Canto")`);
console.log(`   - Thêm từ words.hk:  ${wordsWhk} từ (tổng ${whkNewTotal} meaning, nhóm "words.hk")`);
console.log(`→ Cặp (từ × phiên âm) match được dict: ${matchedByPron}`);
console.log("");
console.log("Sample:");
for (const s of samples) console.log(`   ${s.han} | CC-Canto +${s.cccNew} | words.hk +${s.whkNew}`);

await prisma.$disconnect();
