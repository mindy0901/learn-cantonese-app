import { prisma } from "../lib/prisma.js";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

async function main() {
    const hash = await bcrypt.hash("admin", 10);
    const user = await prisma.user.upsert({
        where: { email: "admin" },
        update: { password: hash, isAdmin: true, name: "Admin" },
        create: { id: randomUUID(), email: "admin", password: hash, isAdmin: true, name: "Admin" },
    });
    console.log("Admin user created/updated:", user.email, "isAdmin:", user.isAdmin);
    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
