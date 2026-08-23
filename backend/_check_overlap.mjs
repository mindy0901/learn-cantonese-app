import { prisma } from "./lib/prisma.js";
import fs from "node:fs";

const data = JSON.parse(fs.readFileSync("data/cc101_core_2000.json", "utf8"));
const cc101Han = new Set(data.map((x) => String(x.hanzi ?? "").trim()).filter(Boolean));
const rows = await prisma.cantoneseVocabulary.findMany({ select: { hanziTraditionalHk: true } });
const existing = new Set(rows.map((r) => String(r.hanziTraditionalHk ?? "").trim()).filter(Boolean));
let overlap = 0;
for (const h of cc101Han) if (existing.has(h)) overlap += 1;
console.log("CC101 hanzi:", cc101Han.size, "| existing cantonese:", existing.size, "| overlap (sẽ GHI ĐÈ):", overlap);
console.log(
    "ví dụ trùng:",
    [...cc101Han]
        .filter((h) => existing.has(h))
        .slice(0, 12)
        .join(", "),
);
process.exit(0);
