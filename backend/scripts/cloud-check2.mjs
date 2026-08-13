import { PrismaClient } from "../generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "..", ".env.cloud"), override: true });
const url = process.env["DATABASE_URL"] || "";
const isCloud = /db\.prisma\.io/.test(url);
const pool = new pg.Pool({ connectionString: url });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const total = await prisma.vocabulary.count();
const merged = await prisma.$queryRawUnsafe(
    "SELECT COUNT(*) AS c FROM vocabularies WHERE LENGTH(han_traditional)=1 AND (pinyin ~ ',' OR pinyin ~ ' ' OR jyutping ~ ' ')",
);
const a = await prisma.$queryRawUnsafe("SELECT pinyin, jyutping FROM vocabularies WHERE han_traditional='啊'");
console.log(JSON.stringify({ isCloud, total, merged: Number(merged[0].c), a }));
await prisma.$disconnect();
