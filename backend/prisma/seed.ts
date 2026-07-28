import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { randomUUID, createHash } from "crypto";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "..", "..", ".env.dev") });

const pool = new pg.Pool({
    connectionString: process.env["DATABASE_URL"],
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

interface HskEntry {
    character: string;
    forms: { simplified: string; traditional: string };
    level: string;
    pronunciations: { pinyin: string; jyutping: string; sino_vietnamese: string }[];
}

/** Generate a deterministic UUID v5-like from a string key */
function stableUUID(key: string): string {
    const hash = createHash("md5").update(key).digest("hex");
    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

function normPinyin(p: string): string {
    return (p || "").replace(/\s+/g, "").toLowerCase().trim();
}
function normJyutping(j: string): string {
    return (j || "").replace(/\s+/g, "").toLowerCase().trim();
}

async function main() {
    console.log("🌱 Seeding database...");

    // Create a default admin user
    const adminEmail = process.env["ADMIN_EMAIL"] || "admin@learn-cantonese.app";
    let user = await prisma.user.findUnique({ where: { email: adminEmail } });
    if (!user) {
        user = await prisma.user.create({
            data: {
                id: randomUUID(),
                email: adminEmail,
                name: "Admin",
                isAdmin: true,
            },
        });
        console.log(`   Created admin user: ${user.id}`);
    } else {
        console.log(`   Using existing user: ${user.id}`);
    }

    // Read HSK data
    const hskPath = resolve(process.cwd(), "vocabularies.json");
    console.log(`   Reading HSK data from ${hskPath}...`);
    const raw = readFileSync(hskPath, "utf-8");
    const allEntries: HskEntry[] = JSON.parse(raw);
    console.log(`   Total HSK entries: ${allEntries.length}`);

    const now = new Date();
    const BATCH = 500;

    // ── 1. Seed HanCharacters first (single-char entries) ──
    console.log(`\n🌱 Seeding Han Characters...`);
    const charEntries = allEntries.filter((e) => [...(e.character || "")].length === 1);
    console.log(`   Single characters: ${charEntries.length}`);

    await prisma.hanCharacter.deleteMany();

    let charTotal = 0;
    for (let i = 0; i < charEntries.length; i += BATCH) {
        const batch = charEntries.slice(i, i + BATCH);
        const rows = batch.map((entry) => {
            const forms = entry.forms || {};
            let traditional = (forms.traditional || "").trim();
            let simplified = (forms.simplified || "").trim();
            if (!traditional && !simplified) traditional = (entry.character || "").trim();
            if (!traditional && simplified) traditional = simplified;

            const prons = entry.pronunciations || [];
            const pinyins = prons.map((p) => p.pinyin?.trim()).filter(Boolean);
            const sinoVietnameseReadings = prons.map((p) => p.sino_vietnamese?.trim()).filter(Boolean);

            return {
                id: randomUUID(),
                hanSimplified: simplified || traditional || entry.character || "",
                hanTraditional: traditional,
                sinoVietnamese: sinoVietnameseReadings,
                jyutping: [],
                pinyin: pinyins,
                hskLevel: String(entry.level || "").trim() || "HSK",
                searchKey: null,
                createdAt: now,
                updatedAt: now,
            };
        });
        await prisma.hanCharacter.createMany({ data: rows });
        charTotal += rows.length;
        console.log(`   ✅ ${charTotal}/${charEntries.length}`);
    }
    console.log(`   Done! ${charTotal} han characters.`);

    // ── 2. Seed Vocabulary (upsert — NEVER delete, preserve study progress) ──
    console.log(`\n🌱 Seeding Vocabulary (upsert mode, preserving existing data)...`);
    const vocabEntries = allEntries;
    console.log(`   HSK entries (before expanding pronunciations): ${vocabEntries.length}`);

    let totalProns = 0;
    for (const entry of vocabEntries) {
        totalProns += (entry.pronunciations || []).length;
    }
    console.log(`   Total rows after expanding pronunciations: ${totalProns}`);

    // Build all rows with stable IDs
    const allRows: Array<{
        id: string;
        hanTraditional: string;
        hanSimplified: string | null;
        sinoVietnamese: string | null;
        pinyin: string | null;
        jyutping: string | null;
        hskLevel: string;
        searchKey: string | null;
    }> = [];

    for (const entry of vocabEntries) {
        const forms = entry.forms || {};
        let traditional = (forms.traditional || "").trim();
        let simplified = (forms.simplified || "").trim();
        if (!traditional && !simplified) traditional = (entry.character || "").trim();
        if (!traditional && simplified) traditional = simplified;

        const prons = entry.pronunciations || [];
        if (prons.length === 0) {
            const id = stableUUID(`${traditional}|${simplified || ""}||`);
            allRows.push({
                id,
                hanTraditional: traditional || entry.character || "",
                hanSimplified: simplified || null,
                sinoVietnamese: null,
                pinyin: null,
                jyutping: null,
                hskLevel: String(entry.level || "").trim() || "HSK",
                searchKey: null,
            });
        } else {
            for (const pron of prons) {
                const id = stableUUID(
                    `${traditional}|${simplified || ""}|${normPinyin(pron.pinyin)}|${normJyutping(pron.jyutping)}`,
                );
                allRows.push({
                    id,
                    hanTraditional: traditional || entry.character || "",
                    hanSimplified: simplified || null,
                    sinoVietnamese: pron.sino_vietnamese?.trim() || null,
                    pinyin: pron.pinyin?.trim() || null,
                    jyutping: pron.jyutping?.trim() || null,
                    hskLevel: String(entry.level || "").trim() || "HSK",
                    searchKey: null,
                });
            }
        }
    }

    // Upsert vocab in batches
    let upserted = 0;
    let newCount = 0;

    for (let i = 0; i < allRows.length; i += BATCH) {
        const batch = allRows.slice(i, i + BATCH);
        for (const row of batch) {
            const existing = await prisma.vocabulary.findUnique({ where: { id: row.id } });
            if (existing) {
                // Entry already exists — skip entirely, never overwrite user data
            } else {
                await prisma.vocabulary.create({ data: { ...row, createdAt: now, updatedAt: now } });
                newCount++;
            }
            upserted++;
        }
        console.log(`   ✅ ${upserted}/${allRows.length} (${newCount} new)`);
    }

    // Remove vocab that no longer exists in seed data
    const seedIds = new Set(allRows.map((r) => r.id));
    const staleVocab = await prisma.vocabulary.findMany({
        where: {
            hskLevel: { not: null },
            id: { notIn: [...seedIds] },
        },
        select: { id: true },
    });
    if (staleVocab.length > 0) {
        const staleIds = staleVocab.map((v) => v.id);
        await prisma.userVocabulary.deleteMany({ where: { vocabularyId: { in: staleIds } } });
        await prisma.vocabulary.deleteMany({ where: { id: { in: staleIds } } });
        console.log(`   🧹 Removed ${staleVocab.length} stale entries no longer in source`);
    }

    // Upsert userVocabulary links (preserve study progress!)
    let uvCreated = 0;
    const vocabWithHsk = allRows.filter((r) => r.hskLevel && r.hskLevel !== "");
    for (let i = 0; i < vocabWithHsk.length; i += BATCH) {
        const batch = vocabWithHsk.slice(i, i + BATCH);
        for (const row of batch) {
            await prisma.userVocabulary.upsert({
                where: { userId_vocabularyId: { userId: user.id, vocabularyId: row.id } },
                create: {
                    id: randomUUID(),
                    userId: user.id,
                    vocabularyId: row.id,
                    createdAt: now,
                    updatedAt: now,
                },
                update: {}, // no-op — preserves study progress!
            });
            uvCreated++;
        }
    }
    console.log(`   🔗 Upserted ${uvCreated} user-vocabulary links (progress preserved)`);

    // ── 3. Link single-char vocab to HanCharacter ──
    console.log(`\n🔗 Linking single-char vocab to han_characters...`);
    const hanChars = await prisma.hanCharacter.findMany({
        select: { id: true, hanTraditional: true },
    });
    const hanCharMap = new Map(hanChars.map((h) => [h.hanTraditional, h.id]));

    const singleCharVocabs = await prisma.vocabulary.findMany({
        where: {
            hskLevel: { not: null },
            hanTraditional: { in: [...hanCharMap.keys()] },
        },
        select: { id: true, hanTraditional: true },
    });

    let linkedCount = 0;
    for (const vocab of singleCharVocabs) {
        const charId = hanCharMap.get(vocab.hanTraditional);
        if (charId) {
            await prisma.vocabularyCharacter.upsert({
                where: {
                    vocabularyId_hanCharacterId: {
                        vocabularyId: vocab.id,
                        hanCharacterId: charId,
                    },
                },
                create: {
                    id: randomUUID(),
                    vocabularyId: vocab.id,
                    hanCharacterId: charId,
                    position: 0,
                },
                update: {},
            });
            linkedCount++;
        }
    }
    console.log(`   Linked ${linkedCount} single-char vocab`);
}

main()
    .catch((e) => {
        console.error("❌ Seed failed:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
        await pool.end();
    });
