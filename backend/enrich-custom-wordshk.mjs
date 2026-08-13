/**
 * enrich-custom-wordshk.mjs
 * Backfill `sinoVietnamese` for custom (no-HSK) vocabularies (the popular words
 * imported from wordshk, etc.).
 *
 * - sinoVietnamese: derived per-character from backend/data/sino-vietnamese.json
 *   (unknown chars render as "-"), only when the field is currently empty.
 *
 * ⚠️ 2026-08-13: KHÔNG còn auto-set `pure_cantonese` — theo user rule, flag này
 * CHỈ set manual bằng toggle trong edit page.
 *
 * Usage: node enrich-custom-wordshk.mjs [--dry]
 */
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { buildMergedSinoVietnameseMap } from "./lib/sinoVietnamesesMap.js";

const DRY = process.argv.includes("--dry");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const HAN_CHAR_TEST = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

function deriveSinoVietnamese(text, sinoMap) {
    const parts = [];
    for (const ch of String(text ?? "")) {
        if (!HAN_CHAR_TEST.test(ch)) continue;
        parts.push(sinoMap.get(ch)?.value || "-");
    }
    return parts.join(" ");
}

async function main() {
    const sinoMap = buildMergedSinoVietnameseMap().map;
    const rows = await prisma.$queryRawUnsafe(
        `SELECT id, han_traditional, han_simplified, jyutping, pinyin, sino_vietnamese, pure_cantonese
         FROM vocabularies
         WHERE (hsk_level IS NULL OR hsk_level = '')
           AND jyutping IS NOT NULL AND jyutping <> ''`,
    );

    const ids = [],
        sinoArr = [];
    let setSino = 0;
    for (const r of rows) {
        const han = r.han_traditional || r.han_simplified || "";
        const hanChars = [...han].filter((c) => HAN_CHAR_TEST.test(c));
        if (!hanChars.length) continue;

        const curSino = r.sino_vietnamese || "";
        const sino = curSino || deriveSinoVietnamese(han, sinoMap);
        if (!curSino && sino) setSino++;

        ids.push(r.id);
        sinoArr.push(sino || null);
    }

    console.log(`custom words: ${rows.length}`);
    console.log(`fill sino: ${setSino}`);

    if (DRY) {
        console.log("\n(dry run — nothing written)");
        await pool.end();
        return;
    }

    await prisma.$executeRawUnsafe(
        `UPDATE vocabularies v SET
           sino_vietnamese = COALESCE(u.sino, v.sino_vietnamese),
           updated_at = now()
         FROM unnest($1::uuid[], $2::varchar[]) AS u(id, sino)
         WHERE v.id = u.id`,
        ids,
        sinoArr,
    );
    console.log(`\n✅ updated ${ids.length} rows`);
    await pool.end();
}

main().catch((e) => {
    console.error("❌", e);
    process.exit(1);
});
