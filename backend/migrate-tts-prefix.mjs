/**
 * Migrate prefix R2: yue-tts/ → cantonese-tts/ (đồng bộ tên theo cấp độ: cantonese/mandarin).
 * - Copy từng object (server-side) sang prefix mới → verify → xóa bản cũ.
 * - Chạy --dry để preview (không đổi gì).
 *
 * Chạy: docker compose -f docker-compose.dev.yml exec -T backend node /app/migrate-tts-prefix.mjs
 */
import { listR2Objects, copyR2Object, r2Head, deleteR2Object } from "./lib/r2.js";

const DRY = process.argv.includes("--dry");

async function main() {
    const all = await listR2Objects("");
    const yue = all.filter((k) => k.startsWith("yue-tts/"));
    const newKeys = yue.map((k) => `cantonese-tts/${k.slice("yue-tts/".length)}`);
    console.log(`yue-tts files: ${yue.length}${DRY ? " (DRY RUN — không đổi gì)" : ""}`);
    if (DRY) {
        console.log(
            "Sample:",
            yue
                .slice(0, 3)
                .map((k) => `${k} → cantonese-tts/${k.slice(8)}`)
                .join("\n"),
        );
        return;
    }

    let copied = 0,
        fail = 0;
    const CONCURRENCY = 20;
    for (let i = 0; i < yue.length; i += CONCURRENCY) {
        const batch = yue.slice(i, i + CONCURRENCY);
        await Promise.all(
            batch.map(async (k) => {
                const dest = `cantonese-tts/${k.slice("yue-tts/".length)}`;
                try {
                    const ok = await copyR2Object(k, dest);
                    if (ok) {
                        // Verify dest tồn tại rồi mới xóa source.
                        const head = await r2Head(dest).catch(() => null);
                        if (head && head.ok) {
                            await deleteR2Object(k);
                            copied += 1;
                        } else {
                            fail += 1;
                        }
                    } else {
                        fail += 1;
                    }
                } catch (e) {
                    fail += 1;
                }
            }),
        );
        if ((i + batch.length) % 500 === 0 || i + batch.length >= yue.length) {
            console.log(`  ${Math.min(i + batch.length, yue.length)}/${yue.length} | copied=${copied} fail=${fail}`);
        }
    }
    console.log(`\nXong: migrate ${copied} file | fail ${fail}`);
    const left = await listR2Objects("");
    console.log(
        `R2 còn lại: ${left.length} files | yue-tts còn: ${left.filter((k) => k.startsWith("yue-tts/")).length}`,
    );
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
