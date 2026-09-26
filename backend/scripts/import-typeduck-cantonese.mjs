#!/usr/bin/env node
/**
 * Build + Import dataset TypeDuck (Cantonese) — từ có nghĩa Anh + tần suất >= 10000.
 * Nguồn: TypeDuck-HK/schema (CC BY 4.0) — jyut6ping3_scolar.dict.yaml (nghĩa Anh)
 *        + essay.txt (tần suất toàn cục).
 *
 * Mô hình app: 1 vocabulary (hanzi_traditional_hk) → nhiều readings (jyutping) → mỗi
 * reading có meanings (en; vi rỗng — chờ dịch sau). Chỉ import từ CHƯA tồn tại trong kho.
 *
 * Usage:
 *   (host) node backend/import-typeduck-cantonese.mjs --build --min 10000  # tạo dataset JSON từ dict files
 *   node backend/import-typeduck-cantonese.mjs --preview                    # đếm mới/trùng (KHÔNG ghi DB)
 *   node backend/import-typeduck-cantonese.mjs --apply                      # ghi DB (phải user đồng ý)
 *
 * ⚠️ Ghi DB phải có sự đồng ý user.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "../generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { createVocabulary } from "../lib/prismaServiceSplit.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Nguồn dict (chỉ host, để build): scratch-mist/typeduck
const SRC_DIR = resolve(__dirname, "..", "..", "scratch-mist", "typeduck");
// Dataset đóng gói (chạy trong container — bind mount /app = backend): backend/data
const DATASET_PATH = resolve(__dirname, "..", "data", "typeduck-import-10k.json");

const APPLY = process.argv.includes("--apply");
const PREVIEW = process.argv.includes("--preview");
const BUILD = process.argv.includes("--build");
const FIX_JYUTPING = process.argv.includes("--fix-jyutping");
const minArg = process.argv.find((a) => a.startsWith("--min="));
const MIN_FREQ = minArg ? Number(minArg.split("=")[1]) : 10000;

const read = (f) => readFileSync(resolve(SRC_DIR, f), "utf8").split(/\r?\n/);

// Tách jyutping dính liền thành từng âm tiết (có space): mỗi âm tiết kết thúc bằng
// chữ số thanh điệu (1-6). "hoeng1gong2dak6bit6" → "hoeng1 gong2 dak6 bit6".
// Bảng relation app yêu cầu jyutping có space giữa các âm tiết để breakdown hán tự căn đúng.
const splitJyutpingSyllables = (jp) =>
    String(jp ?? "")
        .replace(/([1-6])([a-z])/g, "$1 $2")
        .trim();

// ── Build dataset từ dict files (chỉ chạy trên host, nguồn trong scratch-mist) ──
function buildDataset() {
    const essay = new Map();
    for (const ln of read("essay.txt")) {
        if (!ln || ln.startsWith("#")) continue;
        const t = ln.split("\t");
        if (t.length < 2) continue;
        essay.set(t[0].trim(), parseInt(t[1], 10));
    }
    // scolar: jyutping,<csv 20 field>,<TAB>hanzi ; eng ở field 16, pos ở field 10.
    const rows = [];
    for (const ln of read("jyut6ping3_scolar.dict.yaml")) {
        if (!ln || ln.startsWith("#") || ln.startsWith("---")) continue;
        const t = ln.split("\t");
        if (t.length < 2) continue;
        const hanzi = t[1].trim();
        if (!hanzi) continue;
        const fr = essay.get(hanzi);
        if (fr == null || fr < MIN_FREQ) continue;
        const f = t[0].split(",");
        const eng = (f[16] || "").trim();
        if (!eng) continue;
        rows.push({ hanzi, jp: splitJyutpingSyllables(f[0]), eng });
    }
    const byHan = new Map();
    for (const r of rows) {
        if (!byHan.has(r.hanzi)) byHan.set(r.hanzi, new Map());
        const jpMap = byHan.get(r.hanzi);
        if (!jpMap.has(r.jp)) jpMap.set(r.jp, { jyutping: r.jp, engs: new Set() });
        const rd = jpMap.get(r.jp);
        rd.engs.add(r.eng);
    }
    const dataset = [];
    for (const [hanzi, jpMap] of byHan) {
        const readings = [...jpMap.values()]
            .map((rd) => ({
                jyutping: rd.jyutping,
                meanings: [...rd.engs].map((en) => ({ en, vi: "" })),
            }))
            .sort((a, b) => a.jyutping.localeCompare(b.jyutping));
        dataset.push({ hanzi, freq: essay.get(hanzi), readings });
    }
    dataset.sort((a, b) => b.freq - a.freq);
    mkdirSync(SRC_DIR, { recursive: true });
    const out = resolve(SRC_DIR, `typeduck-import-${MIN_FREQ}.json`);
    writeFileSync(out, JSON.stringify(dataset, null, 2), "utf8");
    const multi = dataset.filter((d) => [...d.hanzi].length > 1).length;
    const singleMultiJp = dataset.filter((d) => [...d.hanzi].length === 1 && d.readings.length > 1).length;
    console.log(`Dataset: ${dataset.length} từ (>=${MIN_FREQ}) → ${out}`);
    console.log(`  ghép: ${multi}, đơn: ${dataset.length - multi} (nhiều jyutping: ${singleMultiJp})`);
    console.log("  dùng --preview / --apply để import (chạy trong container, dataset ở backend/data).");
}

// ── Import dataset (chạy trong container — dataset ở /app/data) ──
async function importDataset() {
    if (!existsSync(DATASET_PATH)) {
        console.error(`Không tìm thấy dataset: ${DATASET_PATH}. Chạy --build trước (host).`);
        process.exit(1);
    }
    const dataset = JSON.parse(readFileSync(DATASET_PATH, "utf8"));
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    try {
        const existing = await prisma.cantoneseVocabulary.findMany({
            select: { id: true, hanziTraditionalHk: true, popularity: true },
        });
        const existingByHan = new Map();
        for (const r of existing) {
            const han = String(r.hanziTraditionalHk ?? "").trim();
            if (han) existingByHan.set(han, { id: r.id, popularity: r.popularity });
        }
        let created = 0;
        let skipped = 0;
        const freqToFill = []; // { id, freq } — từ đã có, popularity NULL → điền tần suất TypeDuck
        for (const item of dataset) {
            const han = String(item.hanzi ?? "").trim();
            if (!han) continue;
            const ex = existingByHan.get(han);
            if (ex) {
                skipped += 1;
                if (ex.popularity == null && typeof item.freq === "number") {
                    freqToFill.push({ id: ex.id, hanzi: han, freq: item.freq });
                }
                continue;
            }
            if (APPLY) {
                await createVocabulary("cantonese", {
                    hanziTraditionalHk: han,
                    pureCantonese: false,
                    popularity: null,
                    readings: (item.readings ?? []).map((rd) => ({
                        jyutping: splitJyutpingSyllables(rd.jyutping),
                        sinoVietnamese: "",
                        meanings: (rd.meanings ?? []).map((m) => ({
                            vi: String(m.vi ?? ""),
                            en: String(m.en ?? ""),
                        })),
                    })),
                });
            }
            created += 1;
        }
        let filledPop = 0;
        if (APPLY) {
            for (const f of freqToFill) {
                await prisma.cantoneseVocabulary.update({
                    where: { id: f.id },
                    data: { popularity: f.freq },
                });
                filledPop += 1;
            }
        }
        console.log(`Dataset: ${dataset.length} từ`);
        console.log(`  - đã tồn tại trong kho (skip): ${skipped}`);
        console.log(
            `  - từ đã có sẽ được điền popularity (tần suất TypeDuck, chỉ khi đang NULL): ${freqToFill.length}`,
        );
        console.log(APPLY ? `  - ✓ ĐÃ IMPORT mới: ${created} từ` : `  - (preview) Sẽ import mới: ${created} từ`);
        if (APPLY) {
            console.log(`  - ✓ ĐÃ điền popularity: ${filledPop}/${freqToFill.length} từ đã có`);
        }
    } finally {
        await pool.end();
    }
}

// ── Fix jyutping dính liền trong DB (từ import TypeDuck) ──
// Cập nhật mọi reading có pattern "số thanh điệu liền chữ cái" → tách space giữa âm tiết.
// Idempotent (chạy lại không đổi gì). CHỈ tác động dòng bị dính.
async function fixJyutping() {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    try {
        const all = await prisma.cantoneseVocabularyRomanization.findMany({
            select: { id: true, jyutping: true },
        });
        const need = all.filter((r) => /[1-6][a-z]/.test(r.jyutping ?? ""));
        const fixed = need.map((r) => ({ id: r.id, jyutping: splitJyutpingSyllables(r.jyutping) }));
        console.log(`Tổng readings: ${all.length}`);
        console.log(`  - jyutping dính liền (cần sửa): ${fixed.length}`);
        if (APPLY) {
            let done = 0;
            for (const f of fixed) {
                await prisma.cantoneseVocabularyRomanization.update({
                    where: { id: f.id },
                    data: { jyutping: f.jyutping },
                });
                done += 1;
            }
            console.log(`  - ✓ ĐÃ sửa: ${done} readings`);
        } else {
            console.log(`  - (preview) Sẽ sửa ${fixed.length} readings — chạy --fix-jyutping --apply để ghi DB`);
            const sample = fixed.slice(0, 5).map((f) => f.jyutping);
            console.log(`  - mẫu sau khi sửa: ${sample.join(" | ")}`);
        }
    } finally {
        await pool.end();
    }
}

if (FIX_JYUTPING) {
    fixJyutping().catch((err) => {
        console.error("FATAL:", err);
        process.exit(1);
    });
} else if (APPLY || PREVIEW) {
    importDataset().catch((err) => {
        console.error("FATAL:", err);
        process.exit(1);
    });
} else if (BUILD) {
    buildDataset();
} else {
    console.log("Dùng: --build | --preview | --apply | --fix-jyutping [--apply].");
}
