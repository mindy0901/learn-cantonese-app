/**
 * filter-pure-cantonese-split.mjs — LỌC cantonese_vocabularies còn 381 từ PURE CANTONESE.
 *
 * Pipeline detectPureCantonese (blocklist + CEDICT + no-pinyin). Chạy --dry mặc định.
 * Khi --apply:
 *   1. Backup CSV các từ sẽ XÓA (14.102) → backend/backup/pure-filter-deleted-<ts>.csv
 *   2. UPDATE pure_cantonese=true cho 381 từ pure
 *   3. DELETE các từ còn lại (FK CASCADE dọn children: romanizations/meanings/examples/characters/deck/set)
 *
 * Chạy: docker compose -f docker-compose.dev.yml exec -T backend node /app/filter-pure-cantonese-split.mjs [--apply]
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { detectPureCantonese } from "./lib/pureCantonese.js";

const APPLY = process.argv.includes("--apply");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
    const rows = await prisma.cantoneseVocabulary.findMany({
        select: {
            id: true,
            hanziSimplifiedHk: true,
            hanziTraditionalHk: true,
            pureCantonese: true,
            romanizations: { select: { jyutping: true } },
        },
    });

    const pureIds = new Set();
    for (const v of rows) {
        const jp = (v.romanizations || [])
            .map((r) => r.jyutping)
            .filter(Boolean)
            .join(" / ");
        const { isPureCantonese } = detectPureCantonese({
            hanziSimplified: v.hanziSimplifiedHk,
            hanziTraditionalHk: v.hanziTraditionalHk,
            jyutping: jp,
        });
        if (isPureCantonese) pureIds.add(v.id);
    }

    const toDelete = rows.filter((v) => !pureIds.has(v.id));
    const toFlag = rows.filter((v) => pureIds.has(v.id) && !v.pureCantonese);

    console.log(
        `Tổng: ${rows.length} | PURE: ${pureIds.size} | sẽ xóa: ${toDelete.length} | cần flag: ${toFlag.length}`,
    );

    if (!APPLY) {
        console.log("DRY RUN — thêm --apply để ghi DB. Backup CSV + flag + delete.");
        await prisma.$disconnect();
        await pool.end();
        return;
    }

    // 1. Backup CSV các từ sẽ xóa
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    mkdirSync(new URL("./backup/", import.meta.url), { recursive: true });
    const csvPath = new URL(`./backup/pure-filter-deleted-${ts}.csv`, import.meta.url);
    const esc = (s) => `"${String(s ?? "").replaceAll('"', '""')}"`;
    const csv = ["id,hanzi_simplified,hanzi_traditional_hk,jyutping"]
        .concat(
            toDelete.map((v) =>
                [
                    v.id,
                    esc(v.hanziSimplifiedHk),
                    esc(v.hanziTraditionalHk),
                    esc(
                        (v.romanizations || [])
                            .map((r) => r.jyutping)
                            .filter(Boolean)
                            .join(" / "),
                    ),
                ].join(","),
            ),
        )
        .join("\n");
    writeFileSync(csvPath, csv);
    console.log(`Backup ${toDelete.length} từ sẽ xóa → ${csvPath.pathname}`);

    // 2. Flag pure
    if (toFlag.length) {
        const res = await pool.query(
            "UPDATE cantonese_vocabularies SET pure_cantonese = true WHERE id = ANY($1::uuid[])",
            [toFlag.map((v) => v.id)],
        );
        console.log(`Flag pure_cantonese=true: ${res.rowCount}`);
    } else {
        console.log("Không cần flag (đã đúng).");
    }

    // 3. Delete (FK CASCADE dọn children)
    const del = await pool.query("DELETE FROM cantonese_vocabularies WHERE id = ANY($1::uuid[])", [
        toDelete.map((v) => v.id),
    ]);
    console.log(`Đã xóa: ${del.rowCount} từ cantonese_vocabularies`);

    const remain = await pool.query("SELECT count(*) FROM cantonese_vocabularies");
    console.log(`Còn lại: ${remain.rows[0].count}`);

    await prisma.$disconnect();
    await pool.end();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
