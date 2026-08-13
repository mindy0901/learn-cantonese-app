/**
 * FIX (cần --apply) — sửa `han_simplified` chứa phồn thể → giản thể chuẩn (t2s).
 * Chỉ sửa từ KHÔNG chứa ký tự Quảng thuần (嗰/係/搵/喎/劏/餸/捱/晒) — các từ
 * đó không có giản thể chuẩn riêng, giữ nguyên.
 *
 * Sau khi đổi han_simplified, recompute `hanCharacters` breakdown + sync hán tự.
 *
 * Chạy:
 *   docker compose -f docker-compose.dev.yml exec -T backend node /app/fix-simplified-trad.mjs --dry
 *   docker compose -f docker-compose.dev.yml exec -T backend node /app/fix-simplified-trad.mjs --apply
 */
import { prisma } from "./lib/prisma.js";
import { computeHanCharacters, syncVocabularyHanCharacters } from "./lib/hanCharacterBreakdown.js";

const OpenCC = await import("opencc-js");
const t2s = OpenCC.Converter({ from: "t", to: "cn" });

const CANTONESE_CHARS = new Set(["嗰", "係", "搵", "喎", "劏", "餸", "捱", "晒"]);
const isDry = !process.argv.includes("--apply");

function hasCantoneseChar(s) {
    for (const ch of [...s]) if (CANTONESE_CHARS.has(ch)) return true;
    return false;
}

const rows = await prisma.vocabulary.findMany({
    select: { id: true, hanSimplified: true, hanTraditional: true, hanHongKong: true, romanizationJson: true },
    orderBy: { id: "asc" },
});

const targets = [];
for (const r of rows) {
    const simp = String(r.hanSimplified ?? "").trim();
    if (!simp || hasCantoneseChar(simp)) continue;
    const converted = String(t2s(simp) ?? "").trim();
    if (converted && converted !== simp) {
        targets.push({ ...r, oldSimp: simp, newSimp: converted });
    }
}

console.log(`Mode: ${isDry ? "DRY" : "APPLY"}`);
console.log(`Sẽ sửa: ${targets.length} từ (bỏ qua từ Quảng thuần)`);

for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    console.log(`  ${i + 1}. ${t.oldSimp} → ${t.newSimp} (id=${t.id})`);
    if (isDry) continue;

    // 1) Đổi han_simplified
    await prisma.vocabulary.update({
        where: { id: t.id },
        data: { hanSimplified: t.newSimp, updatedAt: new Date() },
    });
    // 2) Recompute breakdown + sync hán tự (đọc lại vocab đã cập nhật)
    const vocab = await prisma.vocabulary.findUnique({ where: { id: t.id } });
    const breakdown = computeHanCharacters(vocab);
    if (breakdown.length > 0) {
        await prisma.vocabulary.update({
            where: { id: t.id },
            data: { hanCharacters: breakdown, updatedAt: new Date() },
        });
        await syncVocabularyHanCharacters(t.id, breakdown);
    }
}

console.log(`\n${isDry ? "DRY — chưa ghi gì. Chạy --apply để ghi." : "Hoàn tất — đã sửa DB."}`);
await prisma.$disconnect();
