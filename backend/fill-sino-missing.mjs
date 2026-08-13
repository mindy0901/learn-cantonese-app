/**
 * fill-sino-missing.mjs
 * Fill Sino-Vietnamese readings that are currently missing.
 *
 * Sources (priority):
 *   1. Unihan kVietnamese (kvietnamese.txt)
 *   2. phienam.txt fallback
 *   3. Manual/gazetted overrides for chars no local source covers:
 *      - 敍 → TỰ   (Từ điển Hán Nôm, hvdic.thivien.net)
 *      - 藴 → UẤN  (Từ điển Hán Nôm, hvdic.thivien.net)
 *      - 醖 → UẤN  (Từ điển Hán Nôm, hvdic.thivien.net)
 *
 * Steps:
 *   [1] Fill han_characters that have no sino_vietnamese yet.
 *   [2] Rebuild vocabularies that have no sino_vietnamese yet, composing
 *       per-character readings from the (now-updated) char store.
 *
 * Only fills EMPTY values — never overwrites existing readings.
 * Usage: node fill-sino-missing.mjs [--dry]
 */
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { buildMergedSinoVietnameseMap } from "./lib/sinoVietnamesesMap.js";

const DRY = process.argv.includes("--dry");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const HAN = /[\u3400-\u4dbf\u4e00-\u9fff]/;

// Manual overrides for chars with no source in unihan/phienam, or with a
// clearly wrong value in a local source (e.g. phienam junk like "MIAN3").
const OVERRIDES = new Map([
    ["敍", "TỰ"],
    ["藴", "UẤN"],
    ["醖", "UẤN"],
    ["麪", "MIẾN"], // phienam had junk "MIAN3"
]);

function hanChars(text) {
    return [...String(text ?? "")].filter((ch) => HAN.test(ch));
}

async function main() {
    const { map, stats } = buildMergedSinoVietnameseMap();
    // Inject overrides (force, to correct bad values); count those that fill gaps
    let overrideFilled = 0;
    for (const [char, value] of OVERRIDES) {
        const had = map.has(char);
        map.set(char, { value, source: "dict-override" });
        if (!had) overrideFilled++;
    }
    console.log(
        "📚 SV map: total",
        stats.total,
        "| single",
        stats.single,
        "| multi",
        stats.multi,
        "| +overrides",
        overrideFilled,
        "| total",
        map.size,
    );

    // [1] Fill han_characters missing SV
    console.log("\n[1/2] han_characters missing sino...");
    const allHanCharsDb = await prisma.hanCharacter.findMany({
        select: { id: true, hanTraditional: true, hanSimplified: true, sinoVietnamese: true },
    });
    const hanCharsDb = allHanCharsDb.filter(
        (h) => !Array.isArray(h.sinoVietnamese) || h.sinoVietnamese.length === 0 || !h.sinoVietnamese[0],
    );
    console.log("   ->", hanCharsDb.length, "han_chars missing SV");

    const hcUpdates = [];
    const hcMissing = [];
    for (const h of hanCharsDb) {
        const entry = map.get(h.hanTraditional) ?? map.get(h.hanSimplified || "");
        if (!entry) {
            hcMissing.push(h.hanTraditional);
            continue;
        }
        hcUpdates.push({ id: h.id, han: h.hanTraditional, to: entry.value, src: entry.source });
    }
    if (hcMissing.length) console.log("   ⚠ still no source:", hcMissing.join(" "));

    if (DRY) {
        console.log(`   (DRY) would update ${hcUpdates.length} han_chars`);
        for (const u of hcUpdates.slice(0, 30)) console.log(`     ${u.han} → ${u.to}`);
    } else {
        const BATCH = 100;
        for (let i = 0; i < hcUpdates.length; i += BATCH) {
            const batch = hcUpdates.slice(i, i + BATCH);
            await prisma.$transaction(
                batch.map(({ id, to }) =>
                    prisma.hanCharacter.update({
                        where: { id },
                        data: { sinoVietnamese: [to], updatedAt: new Date() },
                    }),
                ),
            );
        }
        console.log(`   ✅ updated ${hcUpdates.length} han_chars`);
    }

    // [2] Rebuild vocabularies missing SV from the char store
    console.log("\n[2/2] vocabularies missing sino...");
    const updatedHanChars = await prisma.hanCharacter.findMany({
        where: { NOT: { sinoVietnamese: { isEmpty: true } } },
        select: { hanTraditional: true, hanSimplified: true, sinoVietnamese: true },
    });
    const svMap = new Map();
    for (const h of updatedHanChars) {
        const sv = h.sinoVietnamese?.[0] ?? "";
        if (!sv) continue;
        if (h.hanTraditional) svMap.set(h.hanTraditional, sv);
        if (h.hanSimplified && h.hanSimplified !== h.hanTraditional) svMap.set(h.hanSimplified, sv);
    }
    // Ensure gazetted overrides are always in the composition map
    for (const [char, value] of OVERRIDES) if (!svMap.has(char)) svMap.set(char, value);
    // Simulate step [1] so dry preview reflects post-update state
    for (const u of hcUpdates) if (!svMap.has(u.han)) svMap.set(u.han, u.to);
    console.log("   -> char→SV map:", svMap.size, "entries (merged fallback:", map.size, ")");

    const vocabs = await prisma.vocabulary.findMany({
        where: { OR: [{ sinoVietnamese: null }, { sinoVietnamese: "" }] },
        select: { id: true, hanTraditional: true, hanSimplified: true },
    });
    console.log("   ->", vocabs.length, "vocabularies missing SV");

    const vUpdates = [];
    const blockedChars = new Set();
    let vSkipped = 0;
    for (const v of vocabs) {
        const chars = hanChars(v.hanTraditional);
        if (chars.length === 0) {
            vSkipped++;
            continue;
        }
        const parts = [];
        let ok = true;
        for (const ch of chars) {
            const sv = svMap.get(ch) ?? map.get(ch)?.value;
            if (!sv) {
                ok = false;
                blockedChars.add(ch);
                break;
            }
            parts.push(sv);
        }
        if (!ok) {
            vSkipped++;
            continue;
        }
        vUpdates.push({ id: v.id, han: v.hanTraditional, to: parts.join(" ") });
    }
    if (blockedChars.size) console.log("   ⚠ chars still blocking:", [...blockedChars].join(" "));

    if (DRY) {
        console.log(`   (DRY) would rebuild ${vUpdates.length} vocabularies | skipped ${vSkipped}`);
        for (const u of vUpdates.slice(0, 15)) console.log(`     ${u.han} → ${u.to}`);
    } else {
        const BATCH = 200;
        let done = 0;
        for (let i = 0; i < vUpdates.length; i += BATCH) {
            const batch = vUpdates.slice(i, i + BATCH);
            await prisma.$transaction(
                batch.map(({ id, to }) =>
                    prisma.vocabulary.update({ where: { id }, data: { sinoVietnamese: to, updatedAt: new Date() } }),
                ),
            );
            done += batch.length;
            console.log(`   ✅ ${done}/${vUpdates.length}`);
        }
        console.log(`   ✅ rebuilt ${vUpdates.length} vocabularies | skipped ${vSkipped}`);
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
        await pool.end();
    });
