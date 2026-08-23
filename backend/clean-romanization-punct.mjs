/**
 * clean-romanization-punct.mjs
 * Loại bỏ dấu câu (CJK + ASCII) khỏi jyutping/pinyin và romanization ví dụ — giữ chữ cái
 * (kể cả dấu thanh Unicode), số, khoảng trắng. (2026-08-22)
 *   "ngo5 hai6..." → "ngo5 hai6"; "haai1." → "haai1"
 *
 * Giống hệt logic cleanRomanization trong lib/prismaServiceSplit.js — làm sạch data cũ
 * sinh ra từ bug fill toJyutping giữ dấu câu của chữ Hán (VD "我係..." → "ngo5 hai6...").
 *
 * Áp dụng cho:
 *   - cantonese_vocabulary_romanizations.jyutping
 *   - mandarin_vocabulary_romanizations.pinyin
 *   - cantonese_vocabulary_examples.romanization
 *   - mandarin_vocabulary_examples.romanization
 *
 * Usage (chạy trong container):
 *   node clean-romanization-punct.mjs --dry    # preview (không ghi)
 *   node clean-romanization-punct.mjs           # ghi vào DB
 */
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const DRY = process.argv.includes("--dry");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const cleanRomanization = (v) =>
    String(v ?? "")
        .replace(/[，。！？、；：（）《》「」『』【】—…,.;:!?()"“”]/gu, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();

async function cleanModel(model, field, label) {
    const rows = await prisma[model].findMany({ select: { id: true, [field]: true } });
    let changed = 0;
    const samples = [];
    for (const row of rows) {
        const orig = String(row[field] ?? "");
        if (!orig) continue;
        const cleaned = cleanRomanization(orig);
        if (cleaned !== orig) {
            changed += 1;
            if (samples.length < 8) samples.push(`${JSON.stringify(orig)} → ${JSON.stringify(cleaned)}`);
            if (!DRY) {
                await prisma[model].update({ where: { id: row.id }, data: { [field]: cleaned } });
            }
        }
    }
    console.log(`[${label}] ${changed} dòng bẩn${DRY ? " (DRY — chưa ghi)" : " đã làm sạch"}`);
    for (const s of samples) console.log(`    ${s}`);
    return changed;
}

async function main() {
    const total = {};
    total.cantoneseJyutping = await cleanModel("cantoneseVocabularyRomanization", "jyutping", "Cantonese jyutping");
    total.mandarinPinyin = await cleanModel("mandarinVocabularyRomanization", "pinyin", "Mandarin pinyin");
    total.cantoneseExamples = await cleanModel(
        "cantoneseVocabularyExample",
        "romanization",
        "Cantonese example romanization",
    );
    total.mandarinExamples = await cleanModel(
        "mandarinVocabularyExample",
        "romanization",
        "Mandarin example romanization",
    );
    console.log("Tổng:", JSON.stringify(total));
    console.log(DRY ? "→ DRY mode — chạy lại KHÔNG có --dry để ghi vào DB" : "→ Đã ghi xong vào DB");
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
