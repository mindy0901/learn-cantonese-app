/**
 * backfill-wordshk-meanings.mjs
 * Add nested meanings + examples (from backend/data/wordshk.json) to existing
 * custom vocabularies (no HSK level) that currently have NO nested meanings.
 *
 * Only ADDS — never overwrites existing nested rows. Idempotent (stable UUIDs
 * + ON CONFLICT DO NOTHING).
 *
 * Usage: node backfill-wordshk-meanings.mjs [--dry]
 */
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY = process.argv.includes("--dry");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const POS_MAP = {
    名詞: "Danh từ",
    動詞: "Động từ",
    形容詞: "Tính từ",
    副詞: "Trạng từ",
    語句: "Cụm từ",
    語素: "Hình vị",
    量詞: "Lượng từ",
    區別詞: "Tính từ",
    詞綴: "Phụ tố",
    代詞: "Đại từ",
    連詞: "Liên từ",
    助詞: "Trợ từ",
    擬聲詞: "Từ tượng thanh",
    介詞: "Giới từ",
    數詞: "Số từ",
    感嘆詞: "Thán từ",
    方位詞: "Định vị từ",
    其他: "Khác",
};
function posCategory(pos) {
    const list = Array.isArray(pos) ? pos : [];
    return list.length ? POS_MAP[list[0]] || list[0] || "" : "";
}

function normJyutping(jp) {
    return String(jp ?? "")
        .replace(/\s+/g, "")
        .toLowerCase();
}

function stableSubUUID(...parts) {
    const key = parts.join("|");
    return crypto
        .createHash("md5")
        .update(key)
        .digest("hex")
        .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
}

async function main() {
    console.log(`📚 Backfilling wordshk nested meanings for custom words (dry=${DRY})\n`);

    const wordshk = JSON.parse(readFileSync(resolve(__dirname, "data", "wordshk.json"), "utf-8"));
    const wsByTrad = new Map();
    for (const r of wordshk) {
        if (!r.t) continue;
        if (!wsByTrad.has(r.t)) wsByTrad.set(r.t, []);
        wsByTrad.get(r.t).push(r);
    }

    const rows = await prisma.$queryRawUnsafe(
        `SELECT id, han_traditional, han_simplified, jyutping
         FROM vocabularies
         WHERE (hsk_level IS NULL OR hsk_level = '')
           AND NOT EXISTS (SELECT 1 FROM vocabulary_meanings vm WHERE vm.vocabulary_id = vocabularies.id)`,
    );
    console.log(`orphan custom words: ${rows.length}`);

    const plans = [];
    let unmatched = 0;
    for (const r of rows) {
        const recs = wsByTrad.get(r.han_traditional);
        if (!recs || recs.length === 0) {
            unmatched++;
            continue;
        }
        const rec = recs.find((x) => normJyutping(x.jp) === normJyutping(r.jyutping)) || recs[0];
        const defs = (rec.defs || [])
            .filter((d) => d.en || d.yue)
            .map((d) => ({
                category: posCategory(rec.pos),
                yue: d.yue || "",
                en: d.en || "",
                egs: (d.egs || []).map((eg) => ({
                    yue: eg.yue || "",
                    jp: eg.jp || "",
                    en: eg.en || "",
                })),
            }));
        if (defs.length === 0) {
            unmatched++;
            continue;
        }
        plans.push({ id: r.id, defs });
    }
    const meaningCount = plans.reduce((a, p) => a + p.defs.length, 0);
    const exampleCount = plans.reduce((a, p) => a + p.defs.reduce((x, d) => x + d.egs.length, 0), 0);
    console.log(`matched wordshk: ${plans.length}, unmatched: ${unmatched}`);
    console.log(`would add: ${meaningCount} meanings, ${exampleCount} examples`);

    if (DRY) {
        console.log("\n(dry run — nothing written)");
        await pool.end();
        return;
    }

    const now = new Date().toISOString();
    const mIds = [],
        mVid = [],
        mCat = [],
        mVi = [],
        mEn = [],
        mPos = [];
    const eIds = [],
        eVid = [],
        eMid = [],
        eHan = [],
        eJp = [],
        ePy = [],
        eVi = [],
        eEn = [],
        ePos = [];

    for (const p of plans) {
        let pos = 0;
        for (const d of p.defs) {
            const mid = stableSubUUID(p.id, "m", pos);
            mIds.push(mid);
            mVid.push(p.id);
            mCat.push(d.category || null);
            mVi.push(null);
            mEn.push(d.en || null);
            mPos.push(pos++);

            let epos = 0;
            for (const eg of d.egs) {
                eIds.push(stableSubUUID(p.id, mid, "e", epos));
                eVid.push(p.id);
                eMid.push(mid);
                eHan.push(eg.yue || null);
                eJp.push(eg.jp || null);
                ePy.push(null);
                eVi.push(null);
                eEn.push(eg.en || null);
                ePos.push(epos++);
            }
        }
    }

    const nowArr = (n) => Array(n).fill(now);
    const nM = await prisma.$executeRawUnsafe(
        `INSERT INTO vocabulary_meanings (id, vocabulary_id, category, viet_meanings, eng_meanings, position, created_at, updated_at)
         SELECT * FROM unnest(
           $1::uuid[], $2::uuid[], $3::varchar[], $4::varchar[], $5::varchar[],
           $6::smallint[], $7::timestamp[], $8::timestamp[]
         ) ON CONFLICT (id) DO NOTHING`,
        mIds,
        mVid,
        mCat,
        mVi,
        mEn,
        mPos,
        nowArr(mIds.length),
        nowArr(mIds.length),
    );
    const nE = await prisma.$executeRawUnsafe(
        `INSERT INTO vocabulary_examples (id, vocabulary_id, meaning_id, han_example, jyutping_example, pinyin_example, viet_examples, eng_examples, position, created_at, updated_at)
         SELECT * FROM unnest(
           $1::uuid[], $2::uuid[], $3::uuid[], $4::varchar[], $5::varchar[],
           $6::varchar[], $7::varchar[], $8::varchar[], $9::smallint[],
           $10::timestamp[], $11::timestamp[]
         ) ON CONFLICT (id) DO NOTHING`,
        eIds,
        eVid,
        eMid,
        eHan,
        eJp,
        ePy,
        eVi,
        eEn,
        ePos,
        nowArr(eIds.length),
        nowArr(eIds.length),
    );
    console.log(`\n✅ backfilled ${plans.length} vocabularies (${nM} meanings, ${nE} examples)`);
    await pool.end();
}

main().catch((e) => {
    console.error("❌", e);
    process.exit(1);
});
