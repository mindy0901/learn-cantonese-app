/**
 * backfill-sv-incomplete.mjs
 * Rebuild `sinoVietnamese` for multi-char vocabularies whose current value is
 * INCOMPLETE (fewer tokens than han chars), e.g. 香港 has "hương" but should be
 * "HƯƠNG CẢNG".
 *
 * Source: han_characters store (Unihan kVietnamese + phienam, already merged).
 * Only fills when EVERY han char has a known reading; otherwise leaves as-is.
 * Only touches words that are currently incomplete — never overwrites complete values.
 *
 * Usage: node backfill-sv-incomplete.mjs [--dry]
 */
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const DRY = process.argv.includes("--dry");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const HAN = /[\u3400-\u4dbf\u4e00-\u9fff]/;

function hanChars(text) {
    return [...String(text ?? "")].filter((ch) => HAN.test(ch));
}
function svTokens(sv) {
    return String(sv ?? "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
}

async function main() {
    // [1] Build char → sino map from han_characters store (Unihan+phienam merged)
    const hanCharsDb = await prisma.hanCharacter.findMany({
        where: { sinoVietnamese: { isEmpty: false } },
        select: { hanTraditional: true, hanSimplified: true, sinoVietnamese: true },
    });
    const svMap = new Map();
    for (const h of hanCharsDb) {
        const sv = h.sinoVietnamese?.[0] ?? "";
        if (!sv) continue;
        if (h.hanTraditional) svMap.set(h.hanTraditional, sv);
        if (h.hanSimplified && h.hanSimplified !== h.hanTraditional) svMap.set(h.hanSimplified, sv);
    }
    console.log("📚 char → sino map:", svMap.size, "entries");

    // [2] Find vocabularies with incomplete sino (tokens < han char count, multi-char)
    const vocabs = await prisma.vocabulary.findMany({
        where: { sinoVietnamese: { not: null }, NOT: { sinoVietnamese: "" } },
        select: { id: true, hanTraditional: true, hanSimplified: true, sinoVietnamese: true },
    });

    const incomplete = [];
    for (const v of vocabs) {
        const count = hanChars(v.hanTraditional).length;
        if (count <= 1) continue;
        if (svTokens(v.sinoVietnamese).length >= count) continue;
        incomplete.push(v);
    }
    console.log("🔍 multi-char incomplete:", incomplete.length);

    // [3] Compute new values
    const updates = [];
    let allFound = 0;
    let partialMissing = 0;
    for (const v of incomplete) {
        const chars = hanChars(v.hanTraditional);
        const parts = [];
        let ok = true;
        for (const ch of chars) {
            const sv = svMap.get(ch);
            if (!sv) {
                ok = false;
                break;
            }
            parts.push(sv);
        }
        if (!ok || parts.length !== chars.length) {
            partialMissing++;
            continue;
        }
        const newSv = parts.join(" ");
        updates.push({ id: v.id, han: v.hanTraditional, from: v.sinoVietnamese, to: newSv });
        allFound++;
    }
    console.log(`✅ rebuildable: ${allFound} | still missing some char: ${partialMissing}`);

    if (DRY) {
        console.log(`(DRY — no writes; ${updates.length} rows)`);
        for (const u of updates.slice(0, 20)) {
            console.log(`  ${u.han} | ${u.from} → ${u.to}`);
        }
        return;
    }

    const BATCH = 200;
    let done = 0;
    for (let i = 0; i < updates.length; i += BATCH) {
        const batch = updates.slice(i, i + BATCH);
        await prisma.$transaction(
            batch.map(({ id, to }) =>
                prisma.vocabulary.update({ where: { id }, data: { sinoVietnamese: to, updatedAt: new Date() } }),
            ),
        );
        done += batch.length;
        console.log(`  ✅ ${done}/${updates.length}`);
    }
    console.log(`✔ updated ${updates.length} vocabularies`);
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
