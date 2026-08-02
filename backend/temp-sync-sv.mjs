import { PrismaClient } from './generated/prisma/client.ts';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const HAN = /[\u3400-\u4dbf\u4e00-\u9fff]/;

const hanChars = await prisma.hanCharacter.findMany({
    where: { sinoVietnamese: { isEmpty: false } },
    select: { hanTraditional: true, hanSimplified: true, sinoVietnamese: true },
});

const svByChar = new Map();
for (const h of hanChars) {
    const sv = h.sinoVietnamese?.[0] ?? '';
    if (!sv) continue;
    if (h.hanTraditional) svByChar.set(h.hanTraditional, sv);
    if (h.hanSimplified && h.hanSimplified !== h.hanTraditional) {
        svByChar.set(h.hanSimplified, sv);
    }
}

console.log('Loaded', svByChar.size, 'character sinoVietnamese mappings');

const vocabs = await prisma.vocabulary.findMany({
    where: { OR: [{ sinoVietnamese: null }, { sinoVietnamese: '' }] },
    select: { id: true, hanTraditional: true, hanSimplified: true },
});

console.log('Found', vocabs.length, 'vocabularies missing sinoVietnamese');

let updated = 0;
let skipped = 0;

for (const vocab of vocabs) {
    const trad = vocab.hanTraditional ?? '';
    const chars = [...trad];
    const svParts = [];
    let allFound = true;

    for (const ch of chars) {
        if (!HAN.test(ch)) continue;
        const sv = svByChar.get(ch);
        if (sv) {
            svParts.push(sv);
        } else {
            allFound = false;
            break;
        }
    }

    if (!allFound || svParts.length === 0) {
        skipped++;
        continue;
    }

    await prisma.vocabulary.update({
        where: { id: vocab.id },
        data: { sinoVietnamese: svParts.join(' ') },
    });
    updated++;
}

console.log('Done! Updated:', updated, 'Skipped:', skipped);
await prisma.$disconnect();
await pool.end();
