/**
 * fill-gloss-examples-romanization.mjs
 * Xử lý example "gloss" (chỉ có engExamples, không có câu Hán/jyutping/viet)
 * trong `vocabularies.romanization_json` (JSONB — nguồn API đọc).
 *
 * Chiến lược giống fill-gloss-examples.mjs (đã xử lý meanings_json):
 *   - Với mỗi example gloss trong mỗi pronunciation, tìm entry wordshk theo
 *     hanTraditional → def có en khớp engMeanings → lấy câu thật đầu tiên
 *     (yue/jp không rỗng) → điền; không có → XÓA example gloss.
 *
 * Hỗ trợ --dry. Chạy: node /app/fill-gloss-examples-romanization.mjs --dry | --apply
 */
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY = process.argv.includes("--dry");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const norm = (s) =>
    String(s ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "");

function isGlossExample(ex) {
    const han = String(ex?.hanExample ?? "").trim();
    const jp = String(ex?.jyutpingExample ?? "").trim();
    const py = String(ex?.pinyinExample ?? "").trim();
    const viet = String(ex?.vietExamples ?? "").trim();
    const eng = String(ex?.engExamples ?? "").trim();
    return !han && !jp && !py && !viet && eng.length > 0;
}

async function main() {
    console.log(`🎯 Điền câu thật từ wordshk cho example gloss trong romanization_json (dry=${DRY})\n`);

    const wordshk = JSON.parse(readFileSync(resolve(__dirname, "data", "wordshk.json"), "utf-8"));
    const wsByTrad = new Map();
    for (const r of wordshk) {
        if (!r.t) continue;
        if (!wsByTrad.has(r.t)) wsByTrad.set(r.t, []);
        wsByTrad.get(r.t).push(r);
    }

    const rows = await prisma.vocabulary.findMany({
        select: { id: true, hanTraditional: true, jyutping: true, romanizationJson: true },
    });

    let totalGloss = 0;
    let filled = 0;
    let removed = 0;
    let noMatch = 0;
    const samples = [];

    for (const v of rows) {
        if (!v.romanizationJson) continue;
        const roms = v.romanizationJson;
        if (!Array.isArray(roms)) continue;

        let romChanged = false;
        const nextRoms = roms.map((rom) => {
            const meanings = Array.isArray(rom.meanings) ? rom.meanings : [];
            if (meanings.length === 0) return rom;
            let meaningChanged = false;
            const nextMeanings = meanings.map((m) => {
                const exs = Array.isArray(m.examples) ? m.examples : [];
                if (exs.length === 0) return m;
                let exChanged = false;
                const nextExs = [];
                for (const ex of exs) {
                    if (!isGlossExample(ex)) {
                        nextExs.push(ex);
                        continue;
                    }
                    totalGloss++;
                    const glossEn = String(ex.engExamples ?? "").trim();
                    const entries = wsByTrad.get(v.hanTraditional) || [];
                    let entry = null;
                    if (v.jyutping) {
                        entry = entries.find((x) => norm(x.jp) === norm(v.jyutping)) || null;
                    }
                    if (!entry && entries.length > 0) entry = entries[0];
                    if (!entry) {
                        removed++;
                        noMatch++;
                        exChanged = true;
                        if (samples.length < 10)
                            samples.push({ han: v.hanTraditional, act: "REMOVE", why: "no entry", gloss: glossEn });
                        continue;
                    }
                    const mEng = String(m.engMeanings ?? "").trim();
                    let def = null;
                    if (mEng) def = (entry.defs || []).find((d) => norm(d.en) === norm(mEng)) || null;
                    if (!def && (entry.defs || []).length > 0) {
                        def = (entry.defs || []).find((d) => norm(d.en) === norm(glossEn)) || null;
                    }
                    if (!def) {
                        removed++;
                        noMatch++;
                        exChanged = true;
                        if (samples.length < 10)
                            samples.push({ han: v.hanTraditional, act: "REMOVE", why: "no def", gloss: glossEn });
                        continue;
                    }
                    const real = (def.egs || []).find(
                        (eg) => String(eg.yue ?? "").trim() && String(eg.jp ?? "").trim(),
                    );
                    if (!real) {
                        removed++;
                        noMatch++;
                        exChanged = true;
                        if (samples.length < 10)
                            samples.push({
                                han: v.hanTraditional,
                                act: "REMOVE",
                                why: "no real sentence",
                                gloss: glossEn,
                            });
                        continue;
                    }
                    filled++;
                    exChanged = true;
                    if (samples.length < 10)
                        samples.push({
                            han: v.hanTraditional,
                            act: "FILL",
                            yue: real.yue,
                            jp: real.jp,
                            en: real.en,
                            gloss: glossEn,
                        });
                    nextExs.push({
                        ...ex,
                        hanExample: real.yue,
                        jyutpingExample: real.jp,
                        pinyinExample: ex.pinyinExample ?? "",
                        vietExamples: ex.vietExamples ?? "",
                        engExamples: real.en || ex.engExamples,
                    });
                }
                if (!exChanged) return m;
                meaningChanged = true;
                return { ...m, examples: nextExs };
            });
            if (!meaningChanged) return rom;
            romChanged = true;
            return { ...rom, meanings: nextMeanings };
        });

        if (!romChanged) continue;
        if (!DRY) {
            await prisma.vocabulary.update({
                where: { id: v.id },
                data: { romanizationJson: nextRoms },
            });
        }
    }

    console.log(`Tổng example gloss: ${totalGloss}`);
    console.log(`Điền câu thật: ${filled}`);
    console.log(`Xóa hẳn: ${removed} (noMatch=${noMatch})`);
    console.log("\n--- Mẫu preview ---");
    for (const s of samples) console.log(JSON.stringify(s));
    if (DRY) console.log("\n(dry run — chưa ghi DB)");
    else console.log("\n✅ đã ghi DB");
    await pool.end();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
