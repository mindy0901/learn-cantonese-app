/**
 * detect-pure-cantonese-split.mjs — QUÉT CHỈ ĐỌC trên schema SPLIT (cantonese_vocabularies).
 * Dùng pipeline detectPureCantonese (lib/pureCantonese.js) — blocklist + CEDICT + no-pinyin.
 * Chạy: docker compose -f docker-compose.dev.yml exec -T backend node /app/detect-pure-cantonese-split.mjs
 */
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { detectPureCantonese } from "./lib/pureCantonese.js";

const LIMIT = Number(process.argv.find((x) => x.startsWith("--limit="))?.split("=")[1] ?? 0);

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
    const rows = await prisma.cantoneseVocabulary.findMany({
        select: {
            id: true,
            hanziSimplifiedHk: true,
            hanziTraditionalHk: true,
            pureCantonese: true,
            romanizations: { select: { jyutping: true } },
        },
    });

    const pure = [];
    for (const v of rows) {
        const jp = (v.romanizations || [])
            .map((r) => r.jyutping)
            .filter(Boolean)
            .join(" / ");
        const { isPureCantonese, signals } = detectPureCantonese({
            hanziSimplified: v.hanziSimplifiedHk,
            hanziTraditionalHk: v.hanziTraditionalHk,
            jyutping: jp,
        });
        if (isPureCantonese) pure.push({ v, jp, signals });
    }

    const flagged = rows.filter((v) => v.pureCantonese).length;
    console.log(`Tổng cantonese_vocabularies: ${rows.length}`);
    console.log(`Detect PURE (pipeline): ${pure.length}`);
    console.log(`Đang có pure_cantonese flag: ${flagged}`);
    console.log(
        "Theo tín hiệu:",
        JSON.stringify({
            char: pure.filter((p) => p.signals.includes("char")).length,
            cedict: pure.filter((p) => p.signals.includes("cedict")).length,
            "no-pinyin": pure.filter((p) => p.signals.includes("no-pinyin")).length,
        }),
    );

    const list = LIMIT ? pure.slice(0, LIMIT) : pure;
    for (const p of list) {
        console.log(
            `[${p.signals.join(",")}] ${p.v.hanziSimplifiedHk} | ${p.v.hanziTraditionalHk} | jp=${p.jp || "-"}`,
        );
    }
    if (LIMIT && pure.length > LIMIT) console.log(`... (${pure.length - LIMIT} từ nữa)`);

    await prisma.$disconnect();
    await pool.end();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
