import { prisma } from "./lib/prisma.js";
const totalVocab = await prisma.vocabulary.count();
const totalUserVocab = await prisma.userVocabulary.count();
const users = await prisma.user.findMany({ select: { id: true, email: true, name: true } });
for (const u of users) {
    const count = await prisma.userVocabulary.count({ where: { userId: u.id } });
    console.log(`User ${u.name} (${u.email}): ${count} linked vocab`);
}
console.log(`Total vocabularies: ${totalVocab}`);
console.log(`Total user_vocabularies: ${totalUserVocab}`);
await prisma.$disconnect();
