/**
 * Rebuild HanCharacter readings from the CORRECT vocabulary breakdown.
 * Overwrites pinyin/jyutping per character — removes readings wrongly merged
 * by an earlier buggy backfill (regex .test() stateful bug).
 *
 * Chạy (chỉ khi user đồng ý):
 *   docker compose -f docker-compose.dev.yml exec -T backend node rebuild-han-character-readings.mjs
 */
import { rebuildHanCharacterReadings } from "./lib/hanCharacterBreakdown.js";

async function main() {
    console.log("⏳ Rebuilding HanCharacter readings from correct breakdown...");
    const result = await rebuildHanCharacterReadings();
    console.log(
        `✅ Done: ${result.total} han chars scanned, ${result.updated} updated, ${result.cleared} cleared (no readings)`,
    );
}

main()
    .catch((e) => {
        console.error("❌ Rebuild failed:", e);
        process.exit(1);
    })
    .finally(async () => {
        const { prisma } = await import("./lib/prisma.js");
        await prisma.$disconnect();
    });
