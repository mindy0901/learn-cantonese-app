async function main() {
    const { prisma } = await import("./lib/prisma.js");
    await prisma.$executeRawUnsafe(
        `ALTER TABLE vocabularies ADD COLUMN IF NOT EXISTS viet_meanings VARCHAR DEFAULT ''`,
    );
    await prisma.$executeRawUnsafe(`ALTER TABLE vocabularies ADD COLUMN IF NOT EXISTS eng_meanings VARCHAR DEFAULT ''`);
    await prisma.$executeRawUnsafe(`ALTER TABLE vocabularies ADD COLUMN IF NOT EXISTS viet_examples TEXT DEFAULT ''`);
    console.log("Columns added successfully");
    await prisma.$disconnect();
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
