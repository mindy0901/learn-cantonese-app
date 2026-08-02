import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import fs from "fs";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const rows = await prisma.vocabulary.findMany({
    where: { hskLevel: { not: null, not: "" } },
    orderBy: { hanTraditional: "asc" },
});

const map = new Map();
for (const r of rows) {
    const k = r.hanTraditional + "|" + (r.hanSimplified || "");
    if (!map.has(k))
        map.set(k, {
            character: r.hanTraditional,
            forms: { simplified: r.hanSimplified || "", traditional: r.hanTraditional },
            level: r.hskLevel || "",
            pronunciations: [],
        });
    map.get(k).pronunciations.push({
        pinyin: r.pinyin || "",
        jyutping: r.jyutping || "",
        sino_vietnamese: r.sinoVietnamese || "",
    });
}

fs.writeFileSync("vocabularies.json", JSON.stringify([...map.values()], null, 2));
console.log("Done: " + [...map.values()].length + " entries");

await prisma.$disconnect();
await pool.end();
