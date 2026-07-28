import { PrismaClient } from "../generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "..", "..", ".env.dev") });

const pool = new pg.Pool({
    connectionString: process.env["DATABASE_URL"],
});

const adapter = new PrismaPg(pool);

const globalForPrisma = /** @type {{ prisma?: PrismaClient }} */ (globalThis);

export const prisma =
    globalForPrisma.prisma ??
    new PrismaClient({
        adapter,
    });

if (process.env["NODE_ENV"] !== "production") {
    globalForPrisma.prisma = prisma;
}
