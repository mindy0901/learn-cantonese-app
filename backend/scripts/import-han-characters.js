#!/usr/bin/env node
/**
 * Import Hán characters from backend/data/phienam.txt into han_characters table.
 *
 * Each line of phienam.txt has the format: <character>=<han_viet>
 * The script inserts every pair as a separate row, preserving multiple readings
 * for the same character.
 *
 * Usage:
 *   node scripts/import-han-characters.js <user-email>
 *
 * If <user-email> is omitted, falls back to PUBLIC_DATA_EMAIL then first ADMIN_EMAIL.
 *
 * Requires SUPABASE_URL and SUPABASE_SECRET_KEY in env (or .env).
 */
import "dotenv/config";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { requireAdmin } from "../lib/supabaseAdmin.js";
import { findUserByEmail } from "../lib/dataService.js";
import { getAdminEmails } from "../lib/appAdmin.js";
import { normalizeSearchText } from "../lib/searchNormalize.js";
import { toPinyin } from "../lib/pinyin.js";
import { toHanHK } from "../lib/opencc.js";
import { toJyutping } from "../lib/jyutping.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const BATCH_SIZE = 500;

function resolveEmail() {
    const arg = process.argv[2]?.trim();
    if (arg) return arg;
    const envEmail = process.env.PUBLIC_DATA_EMAIL?.trim();
    if (envEmail) return envEmail;
    const admins = [...getAdminEmails()];
    if (admins.length > 0) return admins[0];
    return null;
}

const email = resolveEmail();
if (!email) {
    console.error(
        "Usage: node scripts/import-han-characters.js <user-email>\n" +
            "       or set PUBLIC_DATA_EMAIL / ADMIN_EMAILS in .env",
    );
    process.exit(1);
}

const db = requireAdmin();
const user = await findUserByEmail(db, email);
if (!user) {
    console.error(`User not found: ${email}`);
    process.exit(1);
}

const userId = user.id;
console.log(`Importing han characters for user: ${email} (${userId})`);

// Read and parse phienam.txt
const filePath = resolve(__dirname, "..", "data", "phienam.txt");
const raw = readFileSync(filePath, "utf-8");
const lines = raw.split(/\r?\n/);

const rows = [];
let skipped = 0;

for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue; // skip blank lines

    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 1) {
        skipped++;
        continue;
    }

    const character = trimmed.slice(0, eqIdx).trim();
    const hanViet = trimmed.slice(eqIdx + 1).trim();

    if (!character || !hanViet) {
        skipped++;
        continue;
    }

    rows.push({
        id: randomUUID(),
        user_id: userId,
        han_simplified: character,
        han_traditional: toHanHK(character) || null,
        han_viet: [hanViet],
        pinyin: toPinyin(character).split(" ").filter(Boolean),
        jyutping: toJyutping(character).split(" ").filter(Boolean),
        search_key: normalizeSearchText(
            character + " " + hanViet + " " + toPinyin(character) + " " + toJyutping(character),
        ),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    });
}

console.log(`Parsed ${rows.length} characters from ${lines.length} lines (${skipped} skipped)`);

// Batch insert
let inserted = 0;
for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const { error } = await db.from("han_characters").insert(chunk);
    if (error) {
        console.error(`Batch insert error at offset ${i}:`, error.message);
        process.exit(1);
    }
    inserted += chunk.length;
    console.log(`Inserted ${inserted}/${rows.length}`);
}

console.log(`Done. ${inserted} han characters imported for ${email}.`);
