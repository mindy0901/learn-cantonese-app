async function main() {
    const { prisma } = await import("./lib/prisma.js");
    const total = await prisma.vocabulary.count();
    const emptySV = await prisma.vocabulary.count({
        where: { OR: [{ sinoVietnamese: null }, { sinoVietnamese: "" }] },
    });
    const emptyPY = await prisma.vocabulary.count({ where: { OR: [{ pinyin: null }, { pinyin: "" }] } });
    console.log("Total:", total);
    console.log("Empty sinoVietnamese:", emptySV);
    console.log("Empty pinyin:", emptyPY);
    await prisma.$disconnect();
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
