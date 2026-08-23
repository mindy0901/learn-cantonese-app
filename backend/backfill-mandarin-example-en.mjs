/**
 * backfill-mandarin-example-en.mjs
 * Điền `en` (nghĩa tiếng Anh) còn thiếu cho mandarin_vocabulary_examples (có vi, thiếu en)
 * bằng cách dịch vi → en qua /api/translate (deep_translator fallback: Google → MyMemory → Pons → Linguee).
 *
 * Lý do (2026-08-23): Full Sync - Mandarin dịch hàng loạt → Google rate-limit (429) vài câu,
 * `catch {}` trong syncMeaningsViEn nuốt lỗi → ví dụ thiếu en.
 *
 * Usage (chạy trong container backend):
 *   node backfill-mandarin-example-en.mjs --dry   # preview
 *   node backfill-mandarin-example-en.mjs          # ghi DB
 */
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const DRY = process.argv.includes("--dry");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const capFirst = (s) => {
    const t = String(s ?? "").trim();
    return t ? t.charAt(0).toLocaleUpperCase("en") + t.slice(1) : t;
};

async function translate(text) {
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const res = await fetch("http://localhost:3001/api/translate", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ text, source: "vi", target: "en" }),
            });
            if (res.ok) {
                const data = await res.json();
                const t = String(data?.translated ?? "").trim();
                if (t) return t;
            }
            // 429 / 5xx / rỗng → retry
        } catch {
            /* retry */
        }
        await sleep(1200 * (attempt + 1));
    }
    return "";
}

async function main() {
    const rows = await prisma.mandarinVocabularyExample.findMany({
        where: { vi: { not: "" }, en: "" },
        select: { id: true, vi: true, en: true },
    });
    console.log(`mandarin examples thiếu en: ${rows.length}`);

    let updated = 0;
    let failed = 0;
    const samples = [];
    for (const ex of rows) {
        const en = capFirst(await translate(ex.vi));
        if (en) {
            updated += 1;
            if (samples.length < 10) samples.push(`${ex.vi.slice(0, 22)} → ${en.slice(0, 32)}`);
            if (!DRY) {
                await prisma.mandarinVocabularyExample.update({ where: { id: ex.id }, data: { en } });
            }
        } else {
            failed += 1;
        }
        await sleep(300);
    }
    console.log(`[${DRY ? "DRY" : "WRITE"}]`, { total: rows.length, updated, failed });
    for (const s of samples) console.log("  ", s);
    console.log(DRY ? "→ DRY mode — chạy lại KHÔNG có --dry để ghi DB" : "→ Đã ghi xong");
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
