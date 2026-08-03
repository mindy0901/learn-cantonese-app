/**
 * Backfill `hanCharacters` JSON + HanCharacter store from existing vocabularies.
 *
 * Chạy (chỉ khi user đồng ý):
 *   docker compose -f docker-compose.dev.yml exec -T backend node backfill-han-characters.mjs
 *
 * Hành vi:
 *  - Với mỗi vocabulary: tính breakdown hanCharacters, ghi vào cột JSON.
 *  - Với mỗi hán tự trong từ: find-or-create trong bảng han_characters,
 *    merge readings (chỉ thêm mới, không ghi đè), rồi link qua vocabulary_characters.
 */
import { backfillVocabularyHanCharacters } from "./lib/hanCharacterBreakdown.js";

async function main() {
    console.log("⏳ Backfilling hanCharacters + HanCharacter store...");
    const result = await backfillVocabularyHanCharacters();
    console.log(
        `✅ Done: ${result.total} vocabularies, ${result.chars} char slots, ` +
            `${result.created} created, ${result.updated} updated, ${result.linked} links`,
    );
}

main()
    .catch((e) => {
        console.error("❌ Backfill failed:", e);
        process.exit(1);
    })
    .finally(async () => {
        const { prisma } = await import("./lib/prisma.js");
        await prisma.$disconnect();
    });
