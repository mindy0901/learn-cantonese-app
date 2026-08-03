/**
 * Compare existing DB viet_meanings against CVDICT (read-only).
 * Reports how many match / differ / missing so we can decide bổ sung strategy.
 */
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { loadCVDict } from "./lib/cvdictLoader.js";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const { bySimp, byTrad } = loadCVDict();

async function main() {
  const vocabs = await prisma.vocabulary.findMany({
    select: { id: true, hanTraditional: true, hanSimplified: true, vietMeanings: true },
  });
  let both = 0, same = 0, diff = 0, onlyDb = 0, onlyCv = 0, neverBoth = 0;
  const diffExamples = [];
  for (const v of vocabs) {
    const simp = (v.hanSimplified || "").trim();
    const trad = (v.hanTraditional || "").trim();
    const key = simp || trad;
    const hit = bySimp.get(simp) || (trad ? byTrad.get(trad) : null) || byTrad.get(key);
    const dbVi = (v.vietMeanings || "").trim();
    const cvVi = hit ? hit.vi.trim() : "";
    const nDb = dbVi.toLowerCase().replace(/\s+/g, " ");
    const nCv = cvVi.toLowerCase().replace(/\s+/g, " ");
    if (!dbVi && !cvVi) { neverBoth++; continue; }
    if (dbVi && !cvVi) { onlyDb++; continue; }
    if (!dbVi && cvVi) { onlyCv++; continue; }
    both++;
    if (nDb === nCv) same++;
    else {
      diff++;
      if (diffExamples.length < 20) diffExamples.push({ key, db: dbVi, cv: cvVi });
    }
  }
  console.log("total:", vocabs.length);
  console.log("both have:", both, "| same:", same, "| DIFF:", diff);
  console.log("only DB has vi:", onlyDb, "| only CVDICT has vi:", onlyCv, "| neither...wait neverBoth:", neverBoth);
  console.log("\n-- diff examples (existing DB vs CVDICT) --");
  for (const e of diffExamples) console.log(`  ${e.key}: DB="${e.db}" | CVDICT="${e.cv}"`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());