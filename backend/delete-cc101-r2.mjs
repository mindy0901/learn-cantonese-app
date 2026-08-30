/**
 * Xóa toàn bộ file CC101 khỏi R2 (root-level, KHÔNG phải yue-tts/ của gTTS).
 * ⚠️ Thao tác xóa không thể hoàn tác — chạy --dry để preview trước.
 *
 * Chạy: docker compose -f docker-compose.dev.yml exec -T backend node /app/delete-cc101-r2.mjs
 * Preview: ... --dry
 */
import { listR2Objects, deleteR2Object } from "./lib/r2.js";

const DRY = process.argv.includes("--dry");

async function main() {
    const all = await listR2Objects("");
    // CC101 = file root (không chứa "/"). Giữ nguyên yue-tts/ (gTTS mới).
    const root = all.filter((k) => !k.includes("/"));
    console.log(`Tổng objects: ${all.length} | CC101 root: ${root.length}${DRY ? " (DRY RUN)" : ""}`);

    if (DRY) {
        console.log("Preview — KHÔNG xóa. Sample:", root.slice(0, 5).join(", "));
        return;
    }

    let ok = 0,
        fail = 0;
    const CONCURRENCY = 20;
    for (let i = 0; i < root.length; i += CONCURRENCY) {
        const batch = root.slice(i, i + CONCURRENCY);
        const results = await Promise.all(batch.map((k) => deleteR2Object(k).catch(() => false)));
        ok += results.filter(Boolean).length;
        fail += results.filter((r) => !r).length;
        if ((i + batch.length) % 1000 === 0 || i + batch.length >= root.length) {
            console.log(`  ${Math.min(i + batch.length, root.length)}/${root.length} | ok=${ok} fail=${fail}`);
        }
    }
    console.log(`\nXong: xóa ${ok} file | lỗi ${fail}`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
