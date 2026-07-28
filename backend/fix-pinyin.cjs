async function main() {
    const { prisma } = await import("./lib/prisma.js");
    const { splitPinyin } = await import("./lib/pinyinSplit.js");

    const vocabs = await prisma.vocabulary.findMany({
        where: { pinyin: { not: null } },
        select: { id: true, hanTraditional: true, pinyin: true },
    });

    let fixed = 0;
    // Batch updates for speed
    const BATCH = 100;
    let batch = [];

    for (const v of vocabs) {
        const original = v.pinyin;
        // Detect erhua: word ends with 儿 or 兒
        const erhua = /[儿兒]$/.test(v.hanTraditional);
        const fixedPinyin = splitPinyin(original, { erhua });
        if (fixedPinyin !== original) {
            batch.push(
                prisma.vocabulary.update({
                    where: { id: v.id },
                    data: { pinyin: fixedPinyin },
                }),
            );
            fixed++;
            if (fixed <= 10) console.log(v.hanTraditional + ": " + original + " -> " + fixedPinyin);

            if (batch.length >= BATCH) {
                await Promise.all(batch);
                batch = [];
                console.log("  ... batch done, fixed so far:", fixed);
            }
        }
    }
    if (batch.length > 0) await Promise.all(batch);

    console.log("Total fixed:", fixed, "/", vocabs.length);
    await prisma.$disconnect();
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
