#!/usr/bin/env node
/**
 * backfill-radical-id.mjs — Gán han_characters.radical_id từ bộ thủ (Kangxi)
 * dùng Unihan kRSUnicode (backend/data/Unihan/Unihan_IRGSources.txt).
 *
 * Chỉ cập nhật các dòng han_characters có radical_id = NULL.
 * Chữ không có trong Unihan (Cantonese-only, variant hiếm) → giữ NULL.
 *
 * Usage:
 *   node /app/backfill-radical-id.mjs [--dry]
 */
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
const UNIHAN = resolve(__dirname, "data", "Unihan", "Unihan_IRGSources.txt");

/** Load kRSUnicode → Map<codepoint, kangxiRadicalNumber> */
function loadUnihanRadicals() {
    const map = new Map();
    const text = fs.readFileSync(UNIHAN, "utf8");
    for (const line of text.split("\n")) {
        if (!line || line.startsWith("#")) continue;
        const parts = line.split("\t");
        if (parts.length < 3 || parts[1] !== "kRSUnicode") continue;
        const cp = parseInt(parts[0].slice(2), 16);
        // value dạng "1.4" | "119.4" | đôi khi "1" hoặc nhiều giá trị cách nhau bởi space
        const val = parts[2].trim().split(/\s+/)[0];
        const num = parseInt(val.split(".")[0], 10);
        if (Number.isFinite(cp) && Number.isFinite(num) && num >= 1 && num <= 214) {
            map.set(cp, num);
        }
    }
    return map;
}

async function main() {
    const unihan = loadUnihanRadicals();
    console.log(`unihan kRSUnicode entries: ${unihan.size}`);

    // Radical map: number → id
    const radicals = await prisma.radical.findMany({ select: { id: true, number: true } });
    const radicalByNo = new Map(radicals.map((r) => [r.number, r.id]));
    console.log(`radicals in DB: ${radicals.length}`);

    const missing = await prisma.hanCharacter.findMany({
        where: { radicalId: null },
        select: { id: true, hanTraditional: true },
        orderBy: { hanTraditional: "asc" },
    });
    console.log(`han_characters with radical_id NULL: ${missing.length}`);

    const updates = [];
    const stillMissing = [];
    let noRadicalMap = 0;
    for (const c of missing) {
        const cp = c.hanTraditional.codePointAt(0);
        const no = unihan.get(cp);
        if (no === undefined) {
            noRadicalMap++;
            stillMissing.push(c.hanTraditional);
            continue;
        }
        const radicalId = radicalByNo.get(no);
        if (!radicalId) {
            stillMissing.push(c.hanTraditional);
            continue;
        }
        updates.push({ id: c.id, char: c.hanTraditional, radicalNo: no, radicalId });
    }

    console.log(`sẽ cập nhật: ${updates.length}`);
    console.log(`không map được (không có trong Unihan / thiếu radical): ${stillMissing.length}`);

    if (dry) {
        for (const u of updates.slice(0, 10)) console.log(`  ${u.char} → radical #${u.radicalNo}`);
        console.log(`[dry] chạy lại với --apply để ghi DB`);
        return;
    }

    // BATCH update
    const BATCH = 500;
    for (let i = 0; i < updates.length; i += BATCH) {
        const batch = updates.slice(i, i + BATCH);
        await prisma.$transaction(
            batch.map((u) => prisma.hanCharacter.update({ where: { id: u.id }, data: { radicalId: u.radicalId } })),
        );
    }
    console.log(`done: updated=${updates.length}`);
    await pool.end();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
