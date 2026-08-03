/**
 * sync-viet-meanings-rows.mjs
 * Tạo các dòng nghĩa RIÊNG BIỆT trong bảng vocabulary_meanings từ CVDICT.
 *
 * - Mỗi nghĩa CVD (tách bằng "/") => 1 dòng VocabularyMeaning (category, vietMeanings, position).
 * - Chỉ tạo cho vocab CHƯA có bất kỳ vocabularyMeanings nào (tránh ghi đè).
 * - Làm sạch: bỏ mã pinyin [ge4], cụm LT:/CL:, ký tự ghép |, phần tử lặp trùng.
 * - WRITES to DB on real run; --dry previews.
 */
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { randomUUID } from "crypto";
import { loadCVDict } from "./lib/cvdictLoader.js";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const { bySimp, byTrad } = loadCVDict();

// ── Clean a single CVD meaning part ──
function cleanMeaning(raw) {
  let s = String(raw || "").trim();
  // Remove LT:/classifier annotations that are not Vietnamese meaning
  s = s.replace(/^LT:\s*/i, "");
  s = s.replace(/LT:.*$/i, "").trim();
  s = s.replace(/^CL:\s*/i, "");
// Remove trailing/embedded pinyin phonetic annotations [ge4] etc.
  s = s.replace(/\[[^\]]*\]/g, "").trim();
  // Remove "…，." Taiwan marker "台湾)" style? keep text. Remove '| ' alt-char bridging
  s = s.replace(/\|\s*/g, "").trim();
  s = s.replace(/\s+/g, " ");
  return s;
}

// Drop classifier leftovers that are pure Hanzi (e.g. "個,位,名", "根", "絲丝")
const PURE_HANZI_ONLY = /^[\s\u3400-\u4dbf\u4e00-\u9fff,、＿_]+$/;

function token(s) {
  return String(s || "").toLowerCase().replace(/[^a-zà-ỹ0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function isNoise(part, dbVi) {
  const p = cleanMeaning(part);
  if (!p) return true;
  // pure Hanzi classifier leftovers (個,位,名 / 根 / bar) -> noise
  if (PURE_HANZI_ONLY.test(p)) return true;
  // pure classifier like "個 [ge4]" after cleaning left empty => handled by !p
  // Not Vietnamese: mostly latin / pinyin-only
  const hasZhOrVi = /[a-zà-ỹ]/.test(p);
  const hasHan = /[\u3400-\u4dbf\u4e00-\u9fff]/.test(p);
  if (!hasZhOrVi && !hasHan) return true;
  // if whole part equals DB existing meaning token -> duplicate
  if (dbVi && token(p) === token(dbVi)) return true;
  return false;
}

async function main() {
  const DRY = process.argv.includes("--dry");

  // Only vocab WITHOUT any meanings yet
  const vocabs = await prisma.vocabulary.findMany({
    where: { vocabularyMeanings: { none: {} } },
    select: { id: true, hanTraditional: true, hanSimplified: true },
  });
  console.log("📖 vocabularies missing any meaning:", vocabs.length);

  let withCv = 0, noCv = 0, tempRows = 0;
  const samples = [];

  for (const v of vocabs) {
    const simp = (v.hanSimplified || "").trim();
    const trad = (v.hanTraditional || "").trim();
    const key = simp || trad;
    const hit = bySimp.get(simp) || (trad ? byTrad.get(trad) : null) || byTrad.get(key);
    if (!hit) { noCv++; continue; }

    // split CVD into separate distinct meanings
    const parts = hit.vi.split("/").map((p) => p.trim()).filter(Boolean);
    const seen = new Set();
    const rows = [];
    let pos = 0;
    for (const part of parts) {
      const cleaned = cleanMeaning(part);
      if (!cleaned || isNoise(part, "")) continue;
      if (seen.has(token(cleaned))) continue;
      seen.add(token(cleaned));
      rows.push({ category: "", vietMeanings: cleaned, position: pos++ });
    }
    if (rows.length === 0) { noCv++; continue; }

    withCv++;
    tempRows += rows.length;
    if (!DRY) {
      const now = new Date();
      await prisma.vocabularyMeaning.createMany({
        data: rows.map(({ category, vietMeanings, position }) => ({
          id: randomUUID(),
          vocabularyId: v.id,
          category,
          vietMeanings,
          position,
          createdAt: now,
          updatedAt: now,
        })),
      });
    }
    if (samples.length < 20) {
      samples.push({ key, rows: rows.map((r) => r.vietMeanings) });
    }
  }

  console.log("vocab WITH clean CVD meanings:", withCv, "| no-CVD:", noCv);
  console.log("meaning rows to create:", tempRows, DRY ? "(DRY)" : "(written)");

  console.log("\n-- samples --");
  for (const s of samples) console.log(`\n  ${s.key}:\n     ${s.rows.map((r) => `"${r}"`).join("\n     ")}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());