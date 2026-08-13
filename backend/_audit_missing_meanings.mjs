/**
 * AUDIT (read-only / dry run) — đếm từ vựng app THIẾU nghĩa mà CC-Canto / words.hk
 * có thể bổ sung, nếu chạy pipeline backfill meanings từ 2 nguồn này.
 *
 * Chạy: node /app/_audit_missing_meanings.mjs
 * KHÔNG ghi database.
 */
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { readFileSync } from "node:fs";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const norm = (s) => String(s ?? "").replace(/\s+/g, "");

// ---- Load sources ----
const ccc = JSON.parse(readFileSync("/app/data/cccanto.json", "utf8"));
const whk = JSON.parse(readFileSync("/app/data/wordshk.json", "utf8"));

// Build lookup maps keyed by normalized han form (t and s) → entry
const cccByHan = new Map();
let cccEntries = 0;
for (const e of ccc) {
    if (!Array.isArray(e) && (e.s || e.t) && Array.isArray(e.en) && e.en.length > 0) {
        cccEntries++;
        for (const f of [e.s, e.t]) {
            const k = norm(f);
            if (k && !cccByHan.has(k)) cccByHan.set(k, e);
        }
    }
}

const whkByHan = new Map();
let whkEntries = 0;
for (const e of whk) {
    if (e && (e.s || e.t) && Array.isArray(e.defs) && e.defs.length > 0) {
        whkEntries++;
        for (const f of [e.t, e.s]) {
            const k = norm(f);
            if (k && !whkByHan.has(k)) whkByHan.set(k, e);
        }
    }
}

// ---- App vocabularies ----
const rows = await prisma.vocabulary.findMany({
    select: {
        id: true,
        hanSimplified: true,
        hanTraditional: true,
        hanHongKong: true,
        meaningsJson: true,
        vietMeanings: true,
        engMeanings: true,
    },
});

function hasMeanings(v) {
    const meanings = v.meaningsJson?.meanings;
    if (Array.isArray(meanings)) {
        return meanings.some((m) => (m.vietMeanings ?? "").trim() || (m.engMeanings ?? "").trim());
    }
    return false;
}

let total = 0;
let missingMeanings = 0;
let hasFlatButNoJson = 0;
let cccHit = 0;
let whkHit = 0;
let eitherHit = 0;
let cccOnly = 0;
let whkOnly = 0;
let both = 0;

const missingSamples = { ccc: [], whk: [], both: [] };

for (const v of rows) {
    total++;
    if (hasMeanings(v)) continue;

    // Thiếu nghĩa trong meanings_json (nguồn chính)
    const hasFlat = (v.vietMeanings ?? "").trim() || (v.engMeanings ?? "").trim();
    if (hasFlat) {
        hasFlatButNoJson++;
        // vẫn tính là có thể "bổ sung vào json"? — không, đã có nghĩa phẳng. Bỏ qua.
        continue;
    }
    missingMeanings++;

    const forms = [v.hanHongKong, v.hanTraditional, v.hanSimplified].map(norm).filter(Boolean);
    const hitC = forms.some((f) => cccByHan.has(f));
    const hitW = forms.some((f) => whkByHan.has(f));

    if (hitC) cccHit++;
    if (hitW) whkHit++;
    if (hitC || hitW) {
        eitherHit++;
        if (hitC && hitW) {
            both++;
            if (missingSamples.both.length < 8)
                missingSamples.both.push(forms.find((f) => whkByHan.has(f) && cccByHan.has(f)));
        } else if (hitC) {
            cccOnly++;
            if (missingSamples.ccc.length < 8) missingSamples.ccc.push(forms.find((f) => cccByHan.has(f)));
        } else {
            whkOnly++;
            if (missingSamples.whk.length < 8) missingSamples.whk.push(forms.find((f) => whkByHan.has(f)));
        }
    }
}

console.log("=== AUDIT: bổ sung nghĩa từ CC-Canto / words.hk (dry run) ===");
console.log(`Tổng từ vựng app: ${total}`);
console.log(`Có nghĩa rồi (meanings_json): ${total - missingMeanings - hasFlatButNoJson}`);
console.log(`Chỉ có nghĩa flat (chưa vào json): ${hasFlatButNoJson}`);
console.log(`THIẾU nghĩa hoàn toàn: ${missingMeanings}`);
console.log("");
console.log(`→ Có thể bổ sung nghĩa:`);
console.log(`   - Từ CC-Canto: ${cccHit}`);
console.log(`   - Từ words.hk: ${whkHit}`);
console.log(`   - Từ 1 trong 2: ${eitherHit}`);
console.log(`     (chỉ CC-Canto: ${cccOnly} | chỉ words.hk: ${whkOnly} | cả 2: ${both})`);
console.log(`→ Vẫn thiếu (không nguồn nào): ${missingMeanings - eitherHit}`);
console.log("");
console.log(`(Nguồn: CC-Canto ${cccEntries} entry có nghĩa, words.hk ${whkEntries} entry có defs)`);
console.log("\nSample — chỉ CC-Canto:");
for (const s of missingSamples.ccc) console.log(`   ${s}`);
console.log("\nSample — chỉ words.hk:");
for (const s of missingSamples.whk) console.log(`   ${s}`);
console.log("\nSample — cả 2 nguồn:");
for (const s of missingSamples.both) console.log(`   ${s}`);

await prisma.$disconnect();
