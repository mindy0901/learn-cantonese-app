import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const HAN = /\p{Script=Han}/gu;
const vs = await prisma.vocabulary.findMany({ select: { hanTraditional: true, sinoVietnamese: true } });
let incomplete = 0,
    empty = 0,
    ok = 0,
    multi = 0;
const samples = [];
for (const v of vs) {
    const hanCount = [...(v.hanTraditional || "")].filter((c) => HAN.test(c)).length;
    if (hanCount <= 1) continue;
    multi++;
    const sv = (v.sinoVietnamese || "").trim();
    if (!sv) {
        empty++;
        continue;
    }
    const tokens = sv.split(/\s+/).filter(Boolean);
    if (tokens.length >= hanCount) {
        ok++;
        continue;
    }
    incomplete++;
    if (samples.length < 15) samples.push({ han: v.hanTraditional, sv, tokens: tokens.length, chars: hanCount });
}
console.log("multi-char total:", multi);
console.log("incomplete:", incomplete, "| empty:", empty, "| ok:", ok);
console.log(JSON.stringify(samples, null, 2));
await prisma.$disconnect();
