/**
 * split-merged-readings.mjs — Split single-char vocabulary rows that have MULTIPLE
 * pinyin/jyutping readings merged into ONE row (old cloud data style) into separate
 * rows — one row per reading, matching the app's schema design
 * ("cùng một chữ có nhiều phiên âm → nhiều dòng DB").
 *
 * e.g. 啊 pinyin="a à ǎ ā á" jyutping="aa3 # aa2 aa1 aa4"
 *   → 5 rows: (a, aa3), (à, null), (ǎ, aa2), (ā, aa1), (á, aa4)
 *
 * Safety:
 *   - Only touches single-char rows with merged readings.
 *   - Keeps the FIRST reading on the original row; creates new rows for the rest.
 *   - New row IDs = stableUUID(hanTraditional|hanSimplified|normPinyin|normJyutping).
 *   - Never deletes original row; never overwrites other data.
 *   - --dry: preview only.
 * WRITES to DB — run only after explicit confirmation.
 */

import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import crypto from "crypto";
import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Always load LOCAL dev DB (.env.dev) so this script is independent of docker exec env.
dotenv.config({ path: resolve(__dirname, "..", "..", ".env.dev"), override: true });

const DRY = process.argv.includes("--dry");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

function normReading(s) {
    return String(s ?? "")
        .replace(/\s+/g, "")
        .toLowerCase();
}

function stableUUID(trad, simp, pinyin, jyutping) {
    const key = `${trad || ""}|${simp || ""}|${normReading(pinyin)}|${normReading(jyutping)}`;
    return crypto
        .createHash("md5")
        .update(key)
        .digest("hex")
        .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
}

function splitPinyin(py) {
    return String(py ?? "")
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
}

function splitJyutping(jp) {
    return String(jp ?? "")
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
}

async function main() {
    console.log(`🔀 Splitting merged single-char readings (dry=${DRY})\n`);

    const rows = await prisma.$queryRawUnsafe(`
        SELECT id, han_traditional, han_simplified, pinyin, jyutping,
               sino_vietnamese, viet_meanings, eng_meanings, hsk_level, search_key, han_characters
        FROM vocabularies
        WHERE LENGTH(han_traditional) = 1
          AND (pinyin ~ ',' OR pinyin ~ ' ' OR jyutping ~ ' ')
    `);
    console.log(`  total merged rows found: ${rows.length}\n`);

    let newRows = 0;
    let keptOriginal = 0;
    const samples = [];

    for (const v of rows) {
        const hanTraditional = String(v.han_traditional ?? "").trim();
        const hanSimplified = String(v.han_simplified ?? "").trim() || undefined;
        const pinyin = String(v.pinyin ?? "").trim();
        const jyutping = String(v.jyutping ?? "").trim();
        const pys = splitPinyin(pinyin);
        const jps = splitJyutping(jyutping);
        if (pys.length <= 1 && jps.length <= 1) continue;

        const readingCount = Math.max(pys.length, jps.length);

        // First reading stays on the original row
        const firstPy = pys[0] ?? null;
        const firstJp = jps[0] ? (jps[0] === "#" ? null : jps[0]) : null;
        await prisma.vocabulary.update({
            where: { id: String(v.id) },
            data: {
                pinyin: firstPy,
                jyutping: firstJp,
                hanCharacters: null, // recompute below
                updatedAt: new Date(),
            },
        });
        keptOriginal++;

        // Remaining readings → new rows (skip any that already exist)
        const toCreate = [];
        for (let i = 1; i < readingCount; i++) {
            const py = pys[i] ?? null;
            const jpRaw = jps[i];
            const jp = jpRaw && jpRaw !== "#" ? jpRaw : null;
            const id = stableUUID(hanTraditional, hanSimplified, py, jp);
            toCreate.push({
                id,
                hanTraditional,
                hanSimplified,
                pinyin: py,
                jyutping: jp,
                sinoVietnamese: String(v.sino_vietnamese ?? "").trim() || undefined,
                vietMeanings: String(v.viet_meanings ?? "").trim() || undefined,
                engMeanings: String(v.eng_meanings ?? "").trim() || undefined,
                hskLevel: String(v.hsk_level ?? "").trim() || undefined,
                searchKey: String(v.search_key ?? "").trim() || undefined,
            });
            if (samples.length < 10) {
                samples.push({
                    trad: hanTraditional,
                    py: py,
                    jp: jp || null,
                    from: `${pinyin} / ${jyutping || "-"}`,
                });
            }
        }
        if (!DRY && toCreate.length > 0) {
            const res = await prisma.vocabulary.createMany({ data: toCreate, skipDuplicates: true });
            newRows += res.count;
        } else {
            newRows += toCreate.length;
        }
    }

    console.log(`  ✅ original rows updated (keep 1st reading): ${keptOriginal}`);
    console.log(`  🆕 new rows created: ${newRows}`);
    if (samples.length) {
        console.log("\n  samples (new rows):");
        for (const s of samples) {
            console.log(`    ${s.trad} | py=${s.py} | jp=${s.jp || "-"}   (from: ${s.from})`);
        }
    }
    console.log(DRY ? "\n  (dry run — nothing written)" : "\n  ✅ Done!");
}

main().catch((e) => {
    console.error("❌", e);
    process.exit(1);
});
