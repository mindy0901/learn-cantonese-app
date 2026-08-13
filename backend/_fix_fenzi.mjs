/**
 * FIX (cần --apply) — dọn nghĩa bị trộn của từ `分子` (id 92f37e27...):
 * giữ nghĩa "phân tử/tử số", bỏ nghĩa `份子` (thành phần / tiền mừng).
 * - Backup row đầy đủ vào "_local_backup_2026-08-13_fenzi_row" (nếu chưa có).
 * - Cập nhật meanings_json + pinyin + flat fallback columns.
 */
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const DRY = !process.argv.includes("--apply");
const ID = "92f37e27-6f8e-ea02-7f6b-16f3d1c6bbcf";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const MEANINGS = {
    examples: [],
    meanings: [
        {
            id: "d679fe94-58b0-4f62-b6a6-c4802e9a5e5d",
            category: "",
            examples: [],
            position: 0,
            engMeanings: "Molecule; Numerator (of a fraction)",
            vietMeanings: "Phân tử / (toán học) tử số của một phân số",
        },
    ],
};

// Backup (chỉ 1 lần, nếu bảng chưa có row này)
await pool.query(`CREATE TABLE IF NOT EXISTS "_local_backup_2026-08-13_fenzi_row" (LIKE vocabularies INCLUDING ALL)`);
const backupCheck = await pool.query(
    `SELECT COUNT(*)::int AS c FROM "_local_backup_2026-08-13_fenzi_row" WHERE id = $1`,
    [ID],
);
if (backupCheck.rows[0].c === 0) {
    await pool.query(`INSERT INTO "_local_backup_2026-08-13_fenzi_row" SELECT * FROM vocabularies WHERE id = $1`, [ID]);
    console.log("Backup row created.");
} else {
    console.log("Backup row already exists.");
}

const data = {
    pinyin: "fèn zǐ",
    vietMeanings: "Phân tử / (toán học) tử số của một phân số",
    engMeanings: "Molecule; Numerator (of a fraction)",
    meaningsJson: MEANINGS,
    updatedAt: new Date(),
};

if (!DRY) {
    await prisma.vocabulary.update({ where: { id: ID }, data });
}

console.log(`Mode: ${DRY ? "DRY" : "APPLY"}`);
console.log(`-> pinyin: fèn zǐ`);
console.log(`-> vietMeanings: ${data.vietMeanings}`);
console.log(`-> engMeanings: ${data.engMeanings}`);
console.log(`-> meanings_json: ${JSON.stringify(MEANINGS)}`);

await prisma.$disconnect();
