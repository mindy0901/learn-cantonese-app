import { prisma } from "../lib/prisma.js";

const count = await prisma.vocabulary.count();
console.log(`✅ Connected. vocabulary count: ${count}`);
await prisma.$disconnect();
