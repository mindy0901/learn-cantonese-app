/**
 * Restore audio CC101 (hanzi_audio / english_audio) — NHẸ, chỉ điền khi đang NULL.
 * ⚠️ KHÔNG delete/create lại vocab — chỉ UPDATE cột audio (giữ nguyên mọi dữ liệu khác:
 * readings/meanings/examples từ Hanzii/words.hk).
 *
 * - Vocab: match theo hanziTraditionalHk = CC101.hanzi → set hanzi_audio/english_audio (R2 URL).
 * - Example: match theo (yue, romanization) chuẩn hóa → set hanzi_audio/english_audio.
 * - Audio URL R2 = <R2_PUBLIC_BASE>/<id>.mp3 (giống import gốc).
 *
 * Chạy (trong container): docker compose -f docker-compose.dev.yml exec -T backend node /app/restore-cc101-audio.mjs
 * Preview: ... --dry
 */
import { prisma } from "../lib/prisma.js";
import fs from "node:fs";
import path from "node:path";

const DRY = process.argv.includes("--dry");

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
const env = { ...loadEnv(path.join(import.meta.dirname, "..", ".env.r2")), ...process.env };
const R2_BASE = env.R2_PUBLIC_BASE?.trim() || "";
const r2 = (url) => {
    const id = String(url ?? "")
        .split("/")
        .pop();
    return R2_BASE && id ? `${R2_BASE}/${id}` : null;
};

// Chuẩn hóa để match: bỏ khoảng trắng + lowercase
const norm = (s) =>
    String(s ?? "")
        .toLowerCase()
        .replace(/\s+/g, "")
        .replace(/[。，、！？.!?,;；:：'"「」『』()（）]/g, "");

const data = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "..", "data", "cc101_core_2000.json"), "utf8"));

// Map vocab theo hanzi (hanziTraditionalHk) — dùng row đầu tiên cho word audio.
const byHan = new Map();
for (const w of data) {
    const hanzi = String(w.hanzi ?? "").trim();
    if (!hanzi) continue;
    if (!byHan.has(hanzi)) byHan.set(hanzi, []);
    byHan.get(hanzi).push(w);
}

// Map example theo (hanzi + norm(yue) + norm(romanization)).
const exByKey = new Map(); // key: hanzi|normYue|normRoman -> audio pair
for (const w of data) {
    const hanzi = String(w.hanzi ?? "").trim();
    for (const ex of w.examples ?? []) {
        const yue = String(ex.hanzi ?? "").trim();
        const rom = String(ex.jyutping ?? "").trim();
        const key = `${hanzi}|${norm(yue)}|${norm(rom)}`;
        if (!exByKey.has(key)) {
            exByKey.set(key, { hanziAudio: r2(ex.hanziAudio), englishAudio: r2(ex.englishAudio) });
        }
    }
}

console.log(
    `CC101: ${data.length} rows | ${byHan.size} từ | ${exByKey.size} ví dụ | R2 base: ${R2_BASE ? "OK" : "THIẾU"}`,
);
console.log(`${DRY ? "(DRY RUN — không ghi DB)" : ""}`);

// ── Vocab ──
const vocabMissing = await prisma.cantoneseVocabulary.findMany({
    where: { hanziAudio: null },
    select: { id: true, hanziTraditionalHk: true, englishAudio: true },
});
let vocabFill = 0,
    vocabNoData = 0;
const vocabUpdates = [];
for (const v of vocabMissing) {
    const rows = byHan.get(String(v.hanziTraditionalHk ?? "").trim());
    if (!rows || !rows.length) {
        vocabNoData += 1;
        continue;
    }
    const first = rows[0];
    const ha = r2(first.hanziAudio);
    const ea = r2(first.englishAudio);
    if (!ha && !ea) {
        vocabNoData += 1;
        continue;
    }
    vocabFill += 1;
    vocabUpdates.push({ id: v.id, ha, ea });
}

// ── Examples ──
const exMissing = await prisma.cantoneseVocabularyExample.findMany({
    where: { hanziAudio: null },
    select: {
        id: true,
        yue: true,
        romanization: true,
        cantoneseVocabularyMeaning: {
            select: {
                cantoneseVocabularyRomanization: {
                    select: {
                        cantoneseVocabulary: { select: { hanziTraditionalHk: true } },
                    },
                },
            },
        },
    },
});
let exFill = 0,
    exNoData = 0;
const exUpdates = [];
for (const e of exMissing) {
    const hanzi = String(
        e.cantoneseVocabularyMeaning?.cantoneseVocabularyRomanization?.cantoneseVocabulary?.hanziTraditionalHk ?? "",
    ).trim();
    const key = `${hanzi}|${norm(e.yue)}|${norm(e.romanization)}`;
    const audio = exByKey.get(key);
    if (!audio) {
        // Thử match chỉ theo yue (nếu romanization khác format)
        let found = null;
        for (const [k, v] of exByKey) {
            if (k.startsWith(`${hanzi}|${norm(e.yue)}|`)) {
                found = v;
                break;
            }
        }
        if (found) {
            exFill += 1;
            exUpdates.push({ id: e.id, ha: found.hanziAudio, ea: found.englishAudio });
        } else {
            exNoData += 1;
        }
        continue;
    }
    exFill += 1;
    exUpdates.push({ id: e.id, ha: audio.hanziAudio, ea: audio.englishAudio });
}

console.log(`Vocab: cần ${vocabMissing.length} | sẽ điền ${vocabFill} | không có dữ liệu ${vocabNoData}`);
console.log(`Examples: cần ${exMissing.length} | sẽ điền ${exFill} | không có dữ liệu ${exNoData}`);

if (DRY) {
    console.log("\n(DRY RUN — dừng tại đây)");
    process.exit(0);
}

// ── Ghi DB (từng record, transaction theo batch) ──
let vDone = 0,
    eDone = 0;
for (let i = 0; i < vocabUpdates.length; i += 200) {
    const batch = vocabUpdates.slice(i, i + 200);
    await prisma.$transaction(
        batch.map((u) =>
            prisma.cantoneseVocabulary.update({
                where: { id: u.id },
                data: { hanziAudio: u.ha, englishAudio: u.ea },
            }),
        ),
    );
    vDone += batch.length;
    console.log(`  vocab ${vDone}/${vocabUpdates.length}`);
}
for (let i = 0; i < exUpdates.length; i += 500) {
    const batch = exUpdates.slice(i, i + 500);
    await prisma.$transaction(
        batch.map((u) =>
            prisma.cantoneseVocabularyExample.update({
                where: { id: u.id },
                data: { hanziAudio: u.ha, englishAudio: u.ea },
            }),
        ),
    );
    eDone += batch.length;
    console.log(`  example ${eDone}/${exUpdates.length}`);
}

console.log(`\nXong: vocab=${vDone} example=${eDone}`);
await prisma.$disconnect();
