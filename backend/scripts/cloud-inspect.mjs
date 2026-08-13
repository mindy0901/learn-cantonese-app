import { prisma } from "../lib/prisma.js";

const tables = await prisma.$queryRawUnsafe(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name",
);
const out = {};
for (const t of tables) {
    const name = t.table_name;
    if (name.startsWith("_prisma")) continue;
    try {
        const c = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM "${name}"`);
        out[name] = Number(c[0].c);
    } catch (e) {
        out[name] = "ERR:" + e.message.slice(0, 40);
    }
}
console.log(JSON.stringify(out));
await prisma.$disconnect();
