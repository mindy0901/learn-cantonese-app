#!/usr/bin/env node
/**
 * fill-hanchar-strokes-unihan.mjs — Fill stroke_count from Unihan kTotalStrokes
 * for han_characters where stroke_count is still NULL (Cantonese-only chars,
 * rare traditional variants that cnchar doesn't know).
 *
 * Usage:
 *   node /app/fill-hanchar-strokes-unihan.mjs [--dry]
 */
import fs from "fs";
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "..", "..", ".env.dev") });

const pool = new pg.Pool({ connectionString: process.env["DATABASE_URL"] });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const dry = process.argv.includes("--dry");
const UNIHAN = resolve(__dirname, "data", "Unihan", "Unihan_IRGSources.txt");

function loadUnihanStrokes() {
    const map = new Map();
    const text = fs.readFileSync(UNIHAN, "utf8");
    for (const line of text.split("\n")) {
        if (!line || line.startsWith("#")) continue;
        const parts = line.split("\t");
        if (parts.length < 3 || parts[1] !== "kTotalStrokes") continue;
        const cp = parseInt(parts[0].slice(2), 16);
        const strokes = parseInt(parts[2], 10);
        if (Number.isFinite(cp) && Number.isFinite(strokes)) {
            map.set(cp, strokes);
        }
    }
    return map;
}

async function main() {
    const unihan = loadUnihanStrokes();
    console.log(`unihan kTotalStrokes entries: ${unihan.size}`);

    const missing = await prisma.hanCharacter.findMany({
        where: { strokeCount: null },
        select: { id: true, hanTraditional: true },
        orderBy: { hanTraditional: "asc" },
    });
    console.log(`missing stroke_count: ${missing.length}`);

    const updates = [];
    const stillMissing = [];
    for (const c of missing) {
        const cp = c.hanTraditional.codePointAt(0);
        const n = unihan.get(cp);
        if (n !== undefined) {
            updates.push({ id: c.id, han: c.hanTraditional, strokes: n });
        } else {
            stillMissing.push(c.hanTraditional);
        }
    }

    console.log(`found in Unihan: ${updates.length}, still missing: ${stillMissing.length}`);
    if (stillMissing.length) console.log(`still missing: ${stillMissing.join(", ")}`);
    for (const u of updates) console.log(`  ${u.han} -> ${u.strokes}`);

    if (dry) {
        console.log(`[dry] would update ${updates.length}`);
        await prisma.$disconnect();
        return;
    }

    const BATCH = 200;
    for (let i = 0; i < updates.length; i += BATCH) {
        const chunk = updates.slice(i, i + BATCH);
        await prisma.$transaction(
            chunk.map((u) => prisma.hanCharacter.update({ where: { id: u.id }, data: { strokeCount: u.strokes } })),
        );
        console.log(`  ... ${Math.min(i + BATCH, updates.length)}/${updates.length} updated`);
    }

    const still = await prisma.hanCharacter.count({ where: { strokeCount: null } });
    console.log(`DONE: updated=${updates.length}, remaining NULL=${still}`);
    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
