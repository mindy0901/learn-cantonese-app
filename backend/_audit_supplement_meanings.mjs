/**
 * AUDIT (read-only / dry run) — đếm MEANING MỚI mà CC-Canto / words.hk có thể
 * BỔ SUNG cho từ vựng app (so sánh nội dung nghĩa, không trùng → tính là thêm được).
 *
 * Chạy: node /app/_audit_supplement_meanings.mjs
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

const cccByHan = new Map();
for (const e of ccc) {
    if (!Array.isArray(e) && (e.s || e.t) && Array.isArray(e.en) && e.en.length > 0) {
        for (const f of [e.s, e.t]) {
            const k = norm(f);
            if (k && !cccByHan.has(k)) cccByHan.set(k, e);
        }
    }
}
const whkByHan = new Map();
for (const e of whk) {
    if (e && (e.s || e.t) && Array.isArray(e.defs) && e.defs.length > 0) {
        for (const f of [e.t, e.s]) {
            const k = norm(f);
            if (k && !whkByHan.has(k)) whkByHan.set(k, e);
        }
    }
}

const rows = await prisma.vocabulary.findMany({
    select: { id: true, hanSimplified: true, hanTraditional: true, hanHongKong: true, meaningsJson: true },
});

// existing meaning text set per vocab
function existingTexts(v) {
    const set = new Set();
    const meanings = v.meaningsJson?.meanings;
    if (Array.isArray(meanings)) {
        for (const m of meanings) {
            if ((m.vietMeanings ?? "").trim()) set.add("vi|" + normText(m.vietMeanings));
            if ((m.engMeanings ?? "").trim()) set.add("en|" + normText(m.engMeanings));
        }
    }
    return set;
}

let total = 0;
let cccSupplementWords = 0;
let whkSupplementWords = 0;
let whkEngSupplementWords = 0;
let eitherSupplementWords = 0;
let cccNewMeanings = 0;
let whkNewMeanings = 0;
let whkEngNewMeanings = 0;

const samples = [];

for (const v of rows) {
    total++;
    const forms = [v.hanHongKong, v.hanTraditional, v.hanSimplified].map(norm).filter(Boolean);
    const existing = existingTexts(v);

    let cNew = 0;
    let wNew = 0;
    let wEngNew = 0;

    const cEntry = forms.map((f) => cccByHan.get(f)).find(Boolean);
    if (cEntry) {
        for (const en of cEntry.en) {
            const t = normText(en);
            if (t && !existing.has("en|" + t)) cNew++;
        }
    }
    const wEntry = forms.map((f) => whkByHan.get(f)).find(Boolean);
    if (wEntry) {
        for (const d of wEntry.defs) {
            if ((d.en ?? "").trim()) {
                const t = normText(d.en);
                if (t && !existing.has("en|" + t)) {
                    wNew++;
                    wEngNew++;
                }
            }
            if ((d.yue ?? "").trim()) {
                const t = normText(d.yue);
                if (t && !existing.has("vi|" + t) && !existing.has("en|" + t)) wNew++;
            }
        }
    }

    if (cNew > 0) cccSupplementWords++;
    if (wNew > 0) whkSupplementWords++;
    if (wEngNew > 0) whkEngSupplementWords++;
    if (cNew > 0 || wNew > 0) {
        eitherSupplementWords++;
        cccNewMeanings += cNew;
        whkNewMeanings += wNew;
        whkEngNewMeanings += wEngNew;
        if (samples.length < 10) samples.push({ han: forms[0] || forms[1] || forms[2], cNew, wNew, wEngNew });
    }
}

console.log("=== AUDIT: bổ sung MEANING MỚI từ CC-Canto / words.hk (dry run) ===");
console.log(`Tổng từ vựng app: ${total}`);
console.log(`→ Từ có thể THÊM meaning mới từ CC-Canto: ${cccSupplementWords} từ (tổng ${cccNewMeanings} meaning)`);
console.log(`→ Từ có thể THÊM meaning mới từ words.hk:   ${whkSupplementWords} từ (tổng ${whkNewMeanings} meaning)`);
console.log(`   (chỉ tính nghĩa ENG words.hk:            ${whkEngSupplementWords} từ / ${whkEngNewMeanings} meaning)`);
console.log(`→ Từ có thể thêm từ 1 trong 2 nguồn:        ${eitherSupplementWords}`);
console.log("");
console.log("Sample:");
for (const s of samples) console.log(`   ${s.han} | CC-Canto +${s.cNew} | words.hk +${s.wNew} (eng +${s.wEngNew})`);

await prisma.$disconnect();
