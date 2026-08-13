/**
 * fix-eng-capitalize-jsonb.mjs
 * Fix engMeanings trong `meanings_json` + `romanization_json` (JSONB) —
 * viết hoa chữ cái đầu mỗi phần sau dấu phẩy/chấm phẩy/dấu chấm.
 * (vd "capable; smart, brilliant" → "Capable; Smart, Brilliant")
 *
 * Chạy: node /app/fix-eng-capitalize-jsonb.mjs --dry | --apply
 */
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const DRY = process.argv.includes("--dry");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

function capEng(value) {
    const s = String(value ?? "").trim();
    if (!s) return s;
    return s.replace(/(^|[.,!?;/]\s*)(\p{L})/gu, (_m, pre, ch) => pre + ch.toLocaleUpperCase("vi"));
}

const fixMeanings = (meanings) =>
    (meanings ?? []).map((m) =>
        m && typeof m.engMeanings === "string" && m.engMeanings.trim()
            ? { ...m, engMeanings: capEng(m.engMeanings) }
            : m,
    );

async function main() {
    console.log(`✍️ Fix engMeanings capitalize (comma+;+.) trong JSONB (dry=${DRY})\n`);

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
            const next = fixMeanings(v.meaningsJson.meanings);
            const changed = next.some((m, i) => m.engMeanings !== v.meaningsJson.meanings[i].engMeanings);
            if (changed) {
                mjChanged++;
                mjFixes += next.filter((m, i) => m.engMeanings !== v.meaningsJson.meanings[i].engMeanings).length;
                if (samples.length < 8) {
                    for (let i = 0; i < next.length; i++) {
                        if (next[i].engMeanings !== v.meaningsJson.meanings[i].engMeanings) {
                            samples.push({
                                src: "meanings_json",
                                from: v.meaningsJson.meanings[i].engMeanings,
                                to: next[i].engMeanings,
                            });
                            break;
                        }
                    }
                }
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
                const nm = fixMeanings(rom.meanings);
                if (nm.some((m, i) => m.engMeanings !== rom.meanings[i].engMeanings)) {
                    romChanged = true;
                    romFixes += nm.filter((m, i) => m.engMeanings !== rom.meanings[i].engMeanings).length;
                    return { ...rom, meanings: nm };
                }
                return rom;
            });
            if (romChanged) {
                rjChanged++;
                rjFixes += romFixes;
                if (samples.length < 8) {
                    for (const rom of nextRoms) {
                        for (const m of rom.meanings || []) {
                            samples.push({ src: "romanization_json", from: m.engMeanings, to: m.engMeanings });
                            break;
                        }
                        break;
                    }
                }
                if (!DRY) {
                    await prisma.vocabulary.update({
                        where: { id: v.id },
                        data: { romanizationJson: nextRoms },
                    });
                }
            }
        }
    }

    console.log(`meanings_json: ${mjChanged} vocab thay đổi (${mjFixes} meaning fix)`);
    console.log(`romanization_json: ${rjChanged} vocab thay đổi (${rjFixes} meaning fix)`);
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
