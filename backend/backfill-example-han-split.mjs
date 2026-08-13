/**
 * backfill-example-han-split.mjs
 * Tách `hanExample` ("giản\nphồn") trong example của `meanings_json` + `romanization_json`
 * thành 2 field riêng `hanSimplified` / `hanTraditional`.
 *
 * - Chỉ thêm field còn thiếu (không đổi field đã có).
 * - Giữ `hanExample` (join lại) để tương thích ngược.
 *
 * Chạy: node /app/backfill-example-han-split.mjs --dry | --apply
 */
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const DRY = process.argv.includes("--dry");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

function splitExampleHan(ex) {
    const simp = (ex?.hanSimplified ?? "").trim();
    const trad = (ex?.hanTraditional ?? "").trim();
    if (simp || trad) return { hanSimplified: simp, hanTraditional: trad };
    const lines = String(ex?.hanExample ?? "")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
    return {
        hanSimplified: lines[0] ?? "",
        hanTraditional: lines[1] ?? "",
    };
}

/** Fix examples array: add missing hanSimplified/hanTraditional. Returns [next, changedCount]. */
function fixExamples(examples) {
    let changed = 0;
    const next = (examples ?? []).map((ex) => {
        if (!ex || typeof ex !== "object") return ex;
        const han = splitExampleHan(ex);
        const hasExplicit = Boolean((ex.hanSimplified ?? "").trim() || (ex.hanTraditional ?? "").trim());
        if (hasExplicit) return ex; // đã có field riêng — không đổi
        if (!han.hanSimplified && !han.hanTraditional) return ex;
        changed++;
        return {
            ...ex,
            hanSimplified: han.hanSimplified,
            hanTraditional: han.hanTraditional,
            hanExample: [han.hanSimplified, han.hanTraditional].filter(Boolean).join("\n"),
        };
    });
    return [next, changed];
}

function fixMeanings(meanings) {
    let changed = 0;
    const next = (meanings ?? []).map((m) => {
        if (!m || !Array.isArray(m.examples)) return m;
        const [exs, c] = fixExamples(m.examples);
        if (c > 0) {
            changed += c;
            return { ...m, examples: exs };
        }
        return m;
    });
    return [next, changed];
}

async function main() {
    console.log(`✂️ Tách hanExample → hanSimplified/hanTraditional trong JSONB (dry=${DRY})\n`);
    const rows = await prisma.vocabulary.findMany({
        select: { id: true, meaningsJson: true, romanizationJson: true },
    });

    let mjChanged = 0;
    let mjFixes = 0;
    let rjChanged = 0;
    let rjFixes = 0;
    const samples = [];

    for (const v of rows) {
        // meanings_json
        if (v.meaningsJson && Array.isArray(v.meaningsJson.meanings)) {
            const [next, c] = fixMeanings(v.meaningsJson.meanings);
            if (c > 0) {
                mjChanged++;
                mjFixes += c;
                if (samples.length < 8) samples.push({ src: "meanings_json", id: v.id, fixes: c });
                if (!DRY) {
                    await prisma.vocabulary.update({
                        where: { id: v.id },
                        data: { meaningsJson: { ...v.meaningsJson, meanings: next } },
                    });
                }
            }
        }
        // romanization_json
        if (v.romanizationJson && Array.isArray(v.romanizationJson)) {
            let romChanged = false;
            let romFixes = 0;
            const nextRoms = v.romanizationJson.map((rom) => {
                if (!rom || !Array.isArray(rom.meanings)) return rom;
                const [nm, c] = fixMeanings(rom.meanings);
                if (c > 0) {
                    romChanged = true;
                    romFixes += c;
                    return { ...rom, meanings: nm };
                }
                return rom;
            });
            if (romChanged) {
                rjChanged++;
                rjFixes += romFixes;
                if (samples.length < 8) samples.push({ src: "romanization_json", id: v.id, fixes: romFixes });
                if (!DRY) {
                    await prisma.vocabulary.update({
                        where: { id: v.id },
                        data: { romanizationJson: nextRoms },
                    });
                }
            }
        }
    }

    console.log(`meanings_json: ${mjChanged} vocab thay đổi (${mjFixes} example fix)`);
    console.log(`romanization_json: ${rjChanged} vocab thay đổi (${rjFixes} example fix)`);
    console.log("\n--- Mẫu ---");
    for (const s of samples) console.log(JSON.stringify(s));
    if (DRY) console.log("\n(dry run — chưa ghi DB)");
    else console.log("\n✅ đã ghi DB");
    await pool.end();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
