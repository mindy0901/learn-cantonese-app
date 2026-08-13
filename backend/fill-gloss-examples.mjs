/**
 * fill-gloss-examples.mjs
 * Xử lý 2187 example "gloss" (chỉ có engExamples, không có câu Hán/jyutping/viet)
 * trong `vocabularies.meanings_json` — nguồn gốc: wordshk egs có yue/jp RỖNG.
 *
 * Chiến lược (phương án 1 — user chọn):
 *   - Với mỗi example gloss, tìm entry wordshk theo hanTraditional (+ jyutping).
 *   - Trong entry đó, tìm def có `en` khớp `engMeanings` của meaning.
 *   - Lấy câu ví dụ THẬT đầu tiên (yue/jp không rỗng) trong def đó → điền vào example.
 *   - Nếu def không có câu thật, hoặc không tìm được entry/def → XÓA example gloss.
 *
 * Hỗ trợ --dry để preview. Chạy: node /app/fill-gloss-examples.mjs --dry | --apply
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
    // Chỉ engExamples (không có câu/viet) → gloss
    return !han && !jp && !py && !viet && eng.length > 0;
}

async function main() {
    console.log(`🎯 Điền câu thật từ wordshk cho example gloss (dry=${DRY})\n`);

    const wordshk = JSON.parse(readFileSync(resolve(__dirname, "data", "wordshk.json"), "utf-8"));
    // Map hanTraditional → entries (ưu tiên giữ tất cả để match jyutping)
    const wsByTrad = new Map();
    for (const r of wordshk) {
        if (!r.t) continue;
        if (!wsByTrad.has(r.t)) wsByTrad.set(r.t, []);
        wsByTrad.get(r.t).push(r);
    }

    const rows = await prisma.vocabulary.findMany({
        select: { id: true, hanTraditional: true, jyutping: true, meaningsJson: true },
    });

    let totalGloss = 0;
    let filled = 0;
    let removed = 0;
    let noMatch = 0;
    const samples = [];

    for (const v of rows) {
        if (!v.meaningsJson) continue;
        const mj = v.meaningsJson;
        const meanings = Array.isArray(mj.meanings) ? mj.meanings : [];
        if (meanings.length === 0) continue;

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

                // Tìm entry wordshk theo hanTraditional (+ jyutping)
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

                // Tìm def có en khớp engMeanings của meaning (case-insensitive, chuẩn hóa)
                const mEng = String(m.engMeanings ?? "").trim();
                let def = null;
                if (mEng) {
                    def = (entry.defs || []).find((d) => norm(d.en) === norm(mEng)) || null;
                }
                if (!def && (entry.defs || []).length > 0) {
                    // fallback: def đầu tiên có en trùng gloss
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

                // Lấy câu thật đầu tiên (yue + jp không rỗng) trong def
                const real = (def.egs || []).find((eg) => String(eg.yue ?? "").trim() && String(eg.jp ?? "").trim());
                if (!real) {
                    removed++;
                    noMatch++;
                    exChanged = true;
                    if (samples.length < 10)
                        samples.push({ han: v.hanTraditional, act: "REMOVE", why: "no real sentence", gloss: glossEn });
                    continue;
                }

                // Điền câu thật vào example (giữ id, engExamples gốc)
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

        if (!meaningChanged) continue;

        if (!DRY) {
            await prisma.vocabulary.update({
                where: { id: v.id },
                data: { meaningsJson: { ...mj, meanings: nextMeanings } },
            });
        }
    }

    console.log(`Tổng example gloss: ${totalGloss}`);
    console.log(`Điền câu thật: ${filled}`);
    console.log(`Xóa hẳn (không có câu): ${removed} (noMatch=${noMatch})`);
    console.log("\n--- Mẫu preview ---");
    for (const s of samples) console.log(JSON.stringify(s));

    if (DRY) {
        console.log("\n(dry run — chưa ghi DB)");
    } else {
        console.log("\n✅ đã ghi DB");
    }
    await pool.end();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
