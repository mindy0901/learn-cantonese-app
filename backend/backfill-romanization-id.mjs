/**
 * Backfill `vocabularies.romanization_json` (JSONB) — thêm `id` (stable UUID
 * theo MD5 normPinyin|normJyutping) cho từng romanization object chưa có id.
 *
 * Hỗ trợ --dry để preview trước khi ghi.
 * Chạy: node /app/backfill-romanization-id.mjs --dry | --apply
 */
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import { createHash } from "crypto";
import pg from "pg";

const DRY = process.argv.includes("--dry");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

function romanizationId(pinyin, jyutping) {
    const normPy = String(pinyin ?? "")
        .replace(/\s+/g, "")
        .toLowerCase();
    const normJp = String(jyutping ?? "")
        .replace(/\s+/g, "")
        .toLowerCase();
    return createHash("md5")
        .update(`${normPy}|${normJp}`)
        .digest("hex")
        .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
}

const rows = await prisma.vocabulary.findMany({
    select: { id: true, romanizationJson: true },
    where: { romanizationJson: { not: null } },
});

let changed = 0;
let unchanged = 0;
let added = 0;
for (const r of rows) {
    const roms = r.romanizationJson;
    if (!Array.isArray(roms)) {
        unchanged++;
        continue;
    }
    let rowChanged = false;
    const next = roms.map((ro) => {
        if (ro && typeof ro.id === "string" && ro.id) return ro;
        const id = romanizationId(ro?.pinyin, ro?.jyutping);
        if (!id) return ro;
        rowChanged = true;
        added++;
        return { id, ...ro };
    });
    if (!rowChanged) {
        unchanged++;
        continue;
    }
    changed++;
    if (!DRY) {
        await prisma.vocabulary.update({
            where: { id: r.id },
            data: { romanizationJson: next, updatedAt: new Date() },
        });
    }
}

console.log(
    `Total: ${rows.length} | changed: ${changed} | unchanged: ${unchanged} | ids added: ${added} | mode: ${DRY ? "DRY" : "APPLY"}`,
);

await prisma.$disconnect();
await pool.end();
