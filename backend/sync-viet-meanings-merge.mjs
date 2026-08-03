/**
 * sync-viet-meanings-merge.mjs
 * Bổ sung (merge) CVDICT meanings vào Vocabulary.vietMeanings.
 *
 * - Giữ nguyên nghĩa DB hiện có (KHÔNG ghi đè).
 * - Append thêm nghĩa CVDICT còn thiếu, tách bằng " / ".
 * - Dedupe: nếu nghĩa CVD đã có trong DB (theo token) thì bỏ qua.
 *
 * WRITES to DB — run only after confirmation.
 */
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { loadCVDict } from "./lib/cvdictLoader.js";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const { bySimp, byTrad } = loadCVDict();

function tokenize(s) {
  return String(s || "").toLowerCase().replace(/[^a-zà-ỹ0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

async function main() {
  const vocabs = await prisma.vocabulary.findMany({
    select: { id: true, hanTraditional: true, hanSimplified: true, vietMeanings: true },
  });
  const DRY = process.argv.includes("--dry");
  let changed = 0, unchanged = 0, noCv = 0;
  const examples = [];

  for (const v of vocabs) {
    const simp = (v.hanSimplified || "").trim();
    const trad = (v.hanTraditional || "").trim();
    const key = simp || trad;
    const hit = bySimp.get(simp) || (trad ? byTrad.get(trad) : null) || byTrad.get(key);
    if (!hit) { noCv++; continue; }

    const dbVi = (v.vietMeanings || "").trim();
    const cvParts = hit.vi.split("/").map((s) => s.trim()).filter(Boolean);

    // Existing DB: split by / and , and ; to get set of existing tokens
    const dbTokens = new Set(
      dbVi.split(/[/;,]/).map((s) => tokenize(s)).filter(Boolean)
    );
    const missing = cvParts.filter((p) => !dbTokens.has(tokenize(p)));

    if (missing.length === 0) { unchanged++; continue; }

    // Final = dbVi + " / " + missing (dedupe display-level)
    const finalParts = [];
    if (dbVi) finalParts.push(dbVi);
    // avoid re-adding any cv part already literally present
    for (const m of missing) {
      if (!dbVi.toLowerCase().includes(m.toLowerCase())) finalParts.push(m);
    }
    const merged = finalParts.join(" / ");

    if (dbVi === merged) { unchanged++; continue; }

    if (!DRY) {
      await prisma.vocabulary.update({
        where: { id: v.id },
        data: { vietMeanings: merged, updatedAt: new Date() },
      });
    }
    changed++;
    if (examples.length < 15) examples.push({ key, before: dbVi, after: merged });
  }

  console.log("✅ Done", DRY ? "(DRY RUN - no writes)" : "");
  console.log("   changed:", changed, "| unchanged(already-contains):", unchanged, "| no-CVDICT:", noCv);
  console.log("\n-- examples --");
  for (const e of examples) console.log(`\n  ${e.key}\n     trước: ${e.before}\n     sau:   ${e.after}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());