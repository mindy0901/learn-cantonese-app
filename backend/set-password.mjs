// set-password.mjs — set bcrypt password for a user by email.
// Usage: node set-password.mjs <email> <password>
import { prisma } from "./lib/prisma.js";
import bcrypt from "bcryptjs";

const email = process.argv[2];
const pw = process.argv[3] ?? "admin";
if (!email) {
    console.error("Usage: node set-password.mjs <email> [password]");
    process.exit(1);
}
const hash = await bcrypt.hash(pw, 10);
const user = await prisma.user.update({ where: { email }, data: { password: hash } });
console.log("Password set for:", user.email, "isAdmin:", user.isAdmin);
await prisma.$disconnect();
