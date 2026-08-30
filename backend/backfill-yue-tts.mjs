/**
 * Backfill TTS cho toàn bộ hanzi hero Cantonese (hanziTraditionalHk).
 * - Với mỗi hanzi duy nhất: nếu chưa có cache R2 (cantonese-tts/<md5>.mp3) → gTTS sinh → upload R2.
 * - Key = md5(hanzi) — ĐÚNG key mà /api/tts dùng → sau backfill, bấm nghe sẽ hit cache ngay.
 * - Có --dry để preview; concurrency để không rate-limit Google.
 *
 * Chạy: docker compose -f docker-compose.dev.yml exec -T backend node /app/backfill-yue-tts.mjs
 * Preview: ... --dry
 */
import { prisma } from "./lib/prisma.js";
import crypto from "node:crypto";
import { r2Head, uploadBufferToR2 } from "./lib/r2.js";
import { synthesizeCantoneseMp3 } from "./lib/gtts.js";

const DRY = process.argv.includes("--dry");
const key = (t) => `cantonese-tts/${crypto.createHash("md5").update(t).digest("hex")}.mp3`;

async function main() {
    const rows = await prisma.cantoneseVocabulary.findMany({
        where: { hanziTraditionalHk: { not: "" }, hanziTraditionalHk: { not: null } },
        select: { hanziTraditionalHk: true },
    });
    const hanziSet = new Set(rows.map((r) => String(r.hanziTraditionalHk ?? "").trim()).filter(Boolean));
    const list = [...hanziSet];
    console.log(`Backfill ${list.length} hanzi hero Cantonese${DRY ? " (DRY RUN)" : ""}`);

    let cached = 0,
        done = 0,
        fail = 0;
    const failedList = [];

    const CONCURRENCY = 4;
    for (let i = 0; i < list.length; i += CONCURRENCY) {
        const batch = list.slice(i, i + CONCURRENCY);
        await Promise.all(
            batch.map(async (hanzi) => {
                const k = key(hanzi);
                try {
                    if (!DRY) {
                        const head = await r2Head(k).catch(() => null);
                        if (head && head.ok) {
                            cached += 1;
                            return;
                        }
                    }
                    if (DRY) {
                        done += 1;
                        return;
                    }
                    const mp3 = await synthesizeCantoneseMp3(hanzi);
                    await uploadBufferToR2(k, mp3, "audio/mpeg");
                    done += 1;
                } catch (e) {
                    fail += 1;
                    if (failedList.length < 20) failedList.push(`${hanzi}: ${e.message}`);
                }
            }),
        );
        if ((i + batch.length) % 100 === 0 || i + batch.length >= list.length) {
            console.log(
                `  ${Math.min(i + batch.length, list.length)}/${list.length} | done=${done} cached=${cached} fail=${fail}`,
            );
        }
    }

    console.log(`\nXong: sinh=${done} cached=${cached} fail=${fail}`);
    if (failedList.length) {
        console.log("Failed (first 20):");
        failedList.forEach((f) => console.log("  -", f));
    }
    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
