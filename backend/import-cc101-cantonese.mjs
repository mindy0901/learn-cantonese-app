/**
 * Import 2040 từ Cantonese từ CC101 (backend/data/cc101_core_2000.json) vào DB cantonese.
 * ⚠️ GHI ĐÈ: nếu hanzi đã tồn tại trong cantonese_vocabularies → XÓA data cũ (cascade)
 * rồi tạo mới từ dữ liệu CC101 (KHÔNG merge). (2026-08-22, user yêu cầu)
 *
 * Dữ liệu mỗi từ: hanzi (hanziTraditionalHk), jyutping, english, pos (category),
 * hanziAudio/englishAudio (R2 public URL) + examples (jyutping/english + audio).
 * Audio URL R2 = <R2_PUBLIC_BASE>/<id>.mp3 (đọc từ backend/.env.r2).
 *
 * Chạy: docker compose -f docker-compose.dev.yml exec -T backend node /app/import-cc101-cantonese.mjs
 * Preview: ... --dry  (chỉ đếm, KHÔNG ghi DB)
 */
import { createVocabulary } from "./lib/prismaServiceSplit.js";
import { prisma } from "./lib/prisma.js";
import fs from "node:fs";
import path from "node:path";

const DRY = process.argv.includes("--dry");

// ── R2 public base ──
function loadEnv(file) {
    const out = {};
    try {
        for (const line of fs.readFileSync(file, "utf8").split("\n")) {
            const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
            if (m && !m[1].startsWith("#")) out[m[1]] = m[2];
        }
    } catch {}
    return out;
}
const env = { ...loadEnv(path.join(import.meta.dirname, ".env.r2")), ...process.env };
const R2_BASE = env.R2_PUBLIC_BASE?.trim() || "";
const r2 = (url) => {
    const id = String(url ?? "")
        .split("/")
        .pop();
    return R2_BASE && id ? `${R2_BASE}/${id}` : null;
};

// POS tiếng Anh "(n)" → tiếng Việt (theo chuẩn UI app).
const POS_VI = { "(n)": "Danh từ", "(v)": "Động từ", "(adj)": "Tính từ", "(adv)": "Phó từ", "(pron)": "Đại từ" };
const posLabel = (p) => POS_VI[String(p ?? "").trim()] ?? String(p ?? "").trim();

const data = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "data", "cc101_core_2000.json"), "utf8"));
console.log(`Import ${data.length} từ CC101 vào cantonese... ${DRY ? "(DRY RUN)" : ""}`);

// ⚠️ Gộp các dòng cùng hanzi (2040 dòng / 1827 chữ — nhiều dòng cùng chữ khác nghĩa):
// 1 chữ → 1 vocab, mỗi dòng → 1 meaning (group theo jyutping → reading). Giữ TOÀN BỘ data CC101.
const byHan = new Map();
for (const w of data) {
    const hanzi = String(w.hanzi ?? "").trim();
    const jyutping = String(w.jyutping ?? "")
        .toLowerCase()
        .trim();
    if (!hanzi || !jyutping) continue;
    if (!byHan.has(hanzi)) byHan.set(hanzi, []);
    byHan.get(hanzi).push({ ...w, hanzi, jyutping, english: String(w.english ?? "").trim() });
}

// ── Chế độ khôi phục --only-missing: chỉ import các từ có ví dụ bị mất yue/audio ──
// (sau khi sync/save cũ làm mất data — đã fix payload, giờ khôi phục từ CC101).
let onlyHan = null;
if (process.argv.includes("--only-missing")) {
    const words = await prisma.cantoneseVocabulary.findMany({
        where: { hanziAudio: { not: null } },
        select: {
            id: true,
            hanziTraditionalHk: true,
            romanizations: {
                select: {
                    meanings: { select: { examples: { select: { yue: true, hanziAudio: true } } } },
                },
            },
        },
    });
    onlyHan = new Set();
    for (const w of words) {
        const exs = (w.romanizations ?? []).flatMap((r) => (r.meanings ?? []).flatMap((m) => m.examples ?? []));
        if (exs.some((e) => !String(e.yue ?? "").trim() || !e.hanziAudio)) onlyHan.add(w.hanziTraditionalHk);
    }
    console.log(`--only-missing: ${onlyHan.size} từ cần khôi phục (mất yue/audio ở ví dụ)`);
}
const entries = [...byHan].filter(([hanzi]) => (onlyHan ? onlyHan.has(hanzi) : true));

let created = 0,
    overwritten = 0,
    skipped = 0,
    failed = 0;
const failures = [];

for (const [hanzi, rows] of entries) {
    // Group rows theo jyutping → readings (nhiều reading nếu cùng chữ khác phiên âm).
    const byJy = new Map();
    for (const r of rows) {
        if (!byJy.has(r.jyutping)) byJy.set(r.jyutping, []);
        byJy.get(r.jyutping).push(r);
    }
    const readings = [...byJy].map(([jy, rs]) => ({
        jyutping: jy,
        sinoVietnamese: "",
        meanings: rs.map((r) => ({
            category: posLabel(r.pos),
            vi: "",
            en: r.english,
            examples: (r.examples ?? []).map((ex) => ({
                yue: String(ex.hanzi ?? "").trim(), // chữ Hán câu ví dụ (2026-08-22: thêm lại cột yue)
                romanization: String(ex.jyutping ?? "")
                    .toLowerCase()
                    .trim(),
                vi: "",
                en: String(ex.english ?? "").trim(),
                hanziAudio: r2(ex.hanziAudio),
                englishAudio: r2(ex.englishAudio),
            })),
        })),
    }));
    const first = rows[0];
    try {
        const dup = await prisma.cantoneseVocabulary.findFirst({
            where: { hanziTraditionalHk: hanzi },
            select: { id: true },
        });
        if (DRY) {
            if (dup) overwritten += 1;
            else created += 1;
            continue;
        }
        if (dup) overwritten += 1;
        // GHI ĐÈ: xóa toàn bộ data cũ (cascade readings/meanings/examples/characters) rồi tạo mới.
        await prisma.cantoneseVocabulary.deleteMany({ where: { hanziTraditionalHk: hanzi } });
        const body = {
            hanziTraditionalHk: hanzi,
            pureCantonese: false,
            popularity: null,
            hanziAudio: r2(first.hanziAudio),
            englishAudio: r2(first.englishAudio),
            readings,
        };
        await createVocabulary("cantonese", body);
        created += 1;
        if ((created + overwritten) % 200 === 0) {
            console.log(
                `  ${created + overwritten}/${entries.length} | created=${created} overwrite=${overwritten} fail=${failed}`,
            );
        }
    } catch (err) {
        failed += 1;
        failures.push(`${hanzi}: ${err.message}`);
    }
}

console.log(`\nXong: created=${created} overwritten=${overwritten} skipped=${skipped} failed=${failed}`);
if (failures.length) {
    console.log("Failed:");
    failures.slice(0, 20).forEach((f) => console.log("  -", f));
}
process.exit(failed ? 1 : 0);
