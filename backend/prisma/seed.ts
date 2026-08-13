// Starter models — replace with your own
import { PrismaClient } from "../generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { randomUUID } from "crypto";

const pool = new pg.Pool({ connectionString: process.env["DATABASE_URL"] });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    // Idempotent: only seed when the DB is empty (does not overwrite existing data).
    const existing = await prisma.vocabulary.count();
    if (existing > 0) {
        console.log(`DB already has ${existing} vocabularies — skipping seed.`);
        return;
    }

    const now = new Date();
    const user = await prisma.user.create({
        data: {
            id: randomUUID(),
            email: "admin",
            name: "Admin",
            isAdmin: true,
        },
    });

    await prisma.vocabulary.create({
        data: {
            id: randomUUID(),
            hanTraditional: "香港",
            hanSimplified: "香港",
            pinyin: "xiāng gǎng",
            jyutping: "hoeng1 gong2",
            vietMeanings: "Hồng Kông",
            engMeanings: "Hong Kong",
            hskLevel: "HSK 1",
        },
    });

    console.log("Seeded admin user + sample vocabulary.");
    console.log(`  admin id: ${user.id}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
