async function main() {
    const { prisma } = await import("./lib/prisma.js");
    const r = await prisma.$queryRawUnsafe("SELECT tablename FROM pg_tables WHERE schemaname = current_schema()");
    console.log(r.map((t) => t.tablename).sort());
    await prisma.$disconnect();
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
