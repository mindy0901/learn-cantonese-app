async function main() {
    const { prisma } = await import("./lib/prisma.js");
    const { randomUUID } = await import("crypto");

    const vocabs = await prisma.vocabulary.findMany({
        select: { hanTraditional: true, pinyin: true, jyutping: true, hskLevel: true },
    });

    const charMap = new Map();
    const HAN = /[\u3400-\u4dbf\u4e00-\u9fff]/g;

    for (const v of vocabs) {
        const text = v.hanTraditional ?? "";
        const chars = [...text].filter((ch) => HAN.test(ch));
        HAN.lastIndex = 0;
        const pyParts = (v.pinyin ?? "").split(/[\s,/、]+/).filter(Boolean);
        const jpParts = (v.jyutping ?? "").split(/\s+/).filter(Boolean);
        for (let i = 0; i < chars.length; i++) {
            const ch = chars[i];
            if (!charMap.has(ch)) charMap.set(ch, { pinyin: new Set(), jyutping: new Set(), hskLevels: new Set() });
            const entry = charMap.get(ch);
            if (pyParts[i]) entry.pinyin.add(pyParts[i]);
            if (jpParts[i]) entry.jyutping.add(jpParts[i]);
            if (v.hskLevel) entry.hskLevels.add(v.hskLevel);
        }
    }

    const existing = await prisma.hanCharacter.findMany({
        select: { hanSimplified: true, id: true, pinyin: true, jyutping: true, hskLevel: true },
    });
    const existingMap = new Map(existing.map((h) => [h.hanSimplified, h]));

    let created = 0,
        updated = 0;
    for (const [ch, readings] of charMap) {
        const ex = existingMap.get(ch);
        const pyArr = [...readings.pinyin].sort();
        const jpArr = [...readings.jyutping].sort();
        const hsk = [...readings.hskLevels].sort().join(" ") || undefined;

        if (ex) {
            const mp = [...new Set([...ex.pinyin, ...pyArr])].sort();
            const mj = [...new Set([...ex.jyutping, ...jpArr])].sort();
            if (mp.length > ex.pinyin.length || mj.length > ex.jyutping.length || (!ex.hskLevel && hsk)) {
                await prisma.hanCharacter.update({
                    where: { id: ex.id },
                    data: { pinyin: mp, jyutping: mj, hskLevel: hsk },
                });
                updated++;
            }
        } else {
            await prisma.hanCharacter.create({
                data: {
                    id: randomUUID(),
                    hanSimplified: ch,
                    hanTraditional: ch,
                    pinyin: pyArr,
                    jyutping: jpArr,
                    hskLevel: hsk,
                    sinoVietnamese: [],
                },
            });
            created++;
        }
    }

    console.log("Created:", created, "Updated:", updated, "Total chars:", charMap.size);
    await prisma.$disconnect();
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
