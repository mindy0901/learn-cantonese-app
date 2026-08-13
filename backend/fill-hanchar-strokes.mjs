#!/usr/bin/env node
/**
 * fill-hanchar-strokes.mjs — Compute + store per-character stroke counts.
 *
 * Reads every row from `han_characters`, computes the stroke count of
 * `han_traditional` via cnchar (+cnchar-trad plugin for phồn thể), and stores
 * it in the new `stroke_count` column. Unknown chars get stroke_count = NULL.
 *
 * Usage:
 *   node /app/fill-hanchar-strokes.mjs [--dry]
 */
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import cnchar from "cnchar";
import trad from "cnchar-trad";

cnchar.use(trad);

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "..", "..", ".env.dev") });

const pool = new pg.Pool({ connectionString: process.env["DATABASE_URL"] });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const dry = process.argv.includes("--dry");

function strokeOf(str) {
    if (!str) return null;
    try {
        const n = cnchar.stroke(String(str));
        return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
    } catch {
        return null;
    }
}

async function main() {
    const chars = await prisma.hanCharacter.findMany({
        select: { id: true, hanTraditional: true, strokeCount: true },
    });
    console.log(`total han_characters: ${chars.length}`);

    let updated = 0;
    let skipped = 0;
    let unknown = 0;
    const updates = [];

    for (const c of chars) {
        const n = strokeOf(c.hanTraditional);
        if (n === null) {
            // Unknown char — store NULL (frontend will fall back to collator).
            if (c.strokeCount !== null) {
                updates.push({ id: c.id, strokeCount: null });
                skipped++;
            } else {
                unknown++;
            }
            continue;
        }
        if (c.strokeCount === n) {
            unknown++;
            continue;
        }
        updates.push({ id: c.id, strokeCount: n });
        updated++;
    }

    console.log(`to update: ${updates.length}, already correct: ${unknown}`);
    if (dry) {
        console.log(
            `[dry] first 10: ${updates
                .slice(0, 10)
                .map((u) => `${u.id.slice(0, 8)}:${u.strokeCount}`)
                .join(", ")}`,
        );
        await prisma.$disconnect();
        return;
    }

    // Batch update in chunks of 500.
    const BATCH = 500;
    for (let i = 0; i < updates.length; i += BATCH) {
        const chunk = updates.slice(i, i + BATCH);
        await prisma.$transaction(
            chunk.map((u) =>
                prisma.hanCharacter.update({
                    where: { id: u.id },
                    data: { strokeCount: u.strokeCount },
                }),
            ),
        );
        console.log(`  ... ${Math.min(i + BATCH, updates.length)}/${updates.length} updated`);
    }

    const total = await prisma.hanCharacter.count({ where: { strokeCount: { not: null } } });
    console.log(`DONE: updated=${updates.length} hasStroke=${total}`);
    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
