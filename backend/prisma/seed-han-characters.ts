import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
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
    pronunciations: { pinyin: string; sino_vietnamese: string }[];
}

async function main() {
    console.log("🌱 Seeding Han Characters from HSK data...");

    // Read HSK data
    const hskPath = resolve(process.cwd(), "hsk_full.json");
    const raw = readFileSync(hskPath, "utf-8");
    const allEntries: HskEntry[] = JSON.parse(raw);

    // Filter single-character entries
    const charEntries = allEntries.filter((e) => [...(e.character || "")].length === 1);
    console.log(`   Single characters: ${charEntries.length}`);

    // Clear existing
    const deleted = await prisma.hanCharacter.deleteMany();
    if (deleted.count > 0) console.log(`   Cleared ${deleted.count} existing han characters`);

    // Batch insert
    const BATCH = 500;
    let total = 0;
    const now = new Date();

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
                hskLevel: String(entry.level || "").trim() || null,
                searchKey: null,
                createdAt: now,
                updatedAt: now,
            };
        });

        await prisma.hanCharacter.createMany({ data: rows });
        total += rows.length;
        console.log(`   ✅ ${total}/${charEntries.length}`);
    }

    console.log(`\n🎉 Done! Imported ${total} han characters.`);
}

main()
    .catch((e) => {
        console.error("❌ Failed:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
        await pool.end();
    });
