#!/usr/bin/env node
/**
 * import-radicals.mjs — Import 214 radicals vào bảng `radicals`.
 * Nguồn: backend/data/radicals.json (trích từ https://nhaihsk.com/radicals).
 *
 * Idempotent: upsert theo `number` (unique #1–214) — chạy lại không tạo trùng.
 * Stable ID = MD5(`radical|<char>`) để id ổn định khi re-run.
 *
 * Usage:
 *   node /app/import-radicals.mjs [--dry]
 */
import { createHash } from "crypto";
import fs from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "..", "..", ".env.dev") });

const pool = new pg.Pool({ connectionString: process.env["DATABASE_URL"] });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const dry = process.argv.includes("--dry");
const DATA = resolve(__dirname, "data", "radicals.json");

function stableUUID(char) {
    const h = createHash("md5").update(`radical|${char}`).digest("hex");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function loadRadicals() {
    const raw = JSON.parse(fs.readFileSync(DATA, "utf8"));
    const rows = [];
    for (const g of raw.groups) {
        for (const r of g.radicals) {
            rows.push({
                id: stableUUID(r.char.trim()),
                number: r.no,
                char: r.char.trim(),
                name: r.name,
                desc: r.desc ?? "",
                pinyin: r.pinyin ?? "",
                variants: r.variants ?? [],
                strokeCount: g.strokes,
            });
        }
    }
    return rows;
}

async function main() {
    const rows = loadRadicals();
    console.log(`radicals to import: ${rows.length}`);

    if (dry) {
        for (const r of rows.slice(0, 5))
            console.log(`  #${r.number} ${r.char} ${r.name} (${r.strokeCount} nét) ${r.desc.slice(0, 40)}`);
        console.log(`[dry] chạy lại với --apply để ghi DB`);
        return;
    }

    let created = 0;
    let updated = 0;
    for (const r of rows) {
        const { id, ...rest } = r;
        const existing = await prisma.radical.findUnique({
            where: { number: r.number },
            select: { id: true, char: true },
        });
        if (existing) {
            await prisma.radical.update({ where: { number: r.number }, data: rest });
            updated++;
        } else {
            await prisma.radical.create({ data: { id, ...rest } });
            created++;
        }
    }

    const total = await prisma.radical.count();
    console.log(`done: created=${created} updated=${updated} total in DB=${total}`);
    await pool.end();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
