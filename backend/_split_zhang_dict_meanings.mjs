/**
 * Thử nghiệm: tách nghĩa dict của từ 长 theo cách đọc (2026-08-13).
 * - zoeng2 (zhǎng/TRƯỞNG = trưởng, lãnh đạo, lớn lên) → nhóm nghĩa leader/grow.
 * - coeng4 (cháng/TRƯỜNG = dài) → nhóm nghĩa dài/forte/length.
 * Chỉ áp dụng cho vocab 686063d4. Chạy: node /app/_split_zhang_dict_meanings.mjs
 */
import { prisma } from "./lib/prisma.js";

const ID = "686063d4-9cf8-50ec-6fca-7a191e25319e";
const ZOENG2_IDS = new Set([
    "8069ba3f-03df-4499-970c-798710abc012", // Chief
    "5635154c-e255-403a-86a1-a89e609905bf", // Head
    "02dbd406-e42c-4ab0-b0af-96146ad234ec", // Elder
    "aab02d01-c950-4a75-ba8e-61a64fa5a9ce", // To grow
    "53c4d35b-bd83-4af3-8762-c8eabe4ed4d1", // To develop
    "6baa0a47-ba7d-4e51-846b-ac20fdab1297", // To increase
    "4850e86e-0984-4b02-838d-cfb6295d08f5", // To enhance
    "167bc251-9624-48ff-b9eb-019cc1b33861", // Older
    "286cc752-2641-42bc-a427-9e4ef26e7045", // Senior
    "aa443bab-3e59-442c-8799-c700074e3448", // Leader
    "d5b6d5ab-4240-4d39-972e-4ddcf1f7e971", // To grow up
    "83194ee5-54f9-4318-9254-9ea74a18f661", // To grow in years
    "88a40046-8401-460c-b138-6221a3f2db59", // Eldest
    "8bab768c-1b21-4fe6-8023-53b346dfc9b9", // # adapted from cc-cedict
    "9f3d98fb-57ce-4e54-9c56-08a870e58505", // Prefix "the eldest"
    "34720a4a-af84-4945-a26b-75b29eeb5994", // Suffix "leader"
    "31506836-0b75-4cf7-a144-798763bc4426", // To grow (words.hk, 增加；變大)
]);
const COENG4_IDS = new Set([
    "d92657d6-02c8-40d1-ae66-5fda3e82d056", // forte/Length/long
    "489e0332-6414-4960-893b-f0bb335a6403", // Long (words.hk)
    "33dd0bc1-4be4-484a-add3-40dc28685a41", // Length (words.hk)
    "a9d6ebc3-dc88-4616-ad4e-f247966ac91f", // Strong point (words.hk)
]);

async function main() {
    const v = await prisma.vocabulary.findUnique({ where: { id: ID } });
    if (!v) throw new Error("Không tìm thấy vocab");
    const roms = Array.isArray(v.romanizationJson) ? v.romanizationJson : [];

    for (const r of roms) {
        if (r?.type !== "jyutping" || !String(r?.jyutping ?? "").trim()) continue;
        const jp = String(r.jyutping).trim().toLowerCase();
        const keepIds = jp === "zoeng2" ? ZOENG2_IDS : jp === "coeng4" ? COENG4_IDS : null;
        if (!keepIds) continue;
        const before = Array.isArray(r.meanings) ? r.meanings.length : 0;
        r.meanings = (Array.isArray(r.meanings) ? r.meanings : []).filter((m) => keepIds.has(m?.id));
        console.log(`- jyutping ${jp}: meanings ${before} → ${r.meanings.length}`);
    }

    await prisma.vocabulary.update({ where: { id: ID }, data: { romanizationJson: roms } });
    console.log("Đã ghi DB.");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
