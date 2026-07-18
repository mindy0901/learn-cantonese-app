#!/usr/bin/env node
/**
 * Rebuild han_characters from OpenCC STCharacters dictionary:
 * 1. Delete all existing rows
 * 2. Parse OpenCC STCharacters.js to get all simplified characters
 * 3. Import each simplified character
 * 4. Update han-viet from phienam.txt
 *
 * Usage: node backend/scripts/rebuild-han-characters.js <user-email>
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
    console.error("Usage: node scripts/rebuild-han-characters.js <user-email>");
    process.exit(1);
}

const db = requireAdmin();
const user = await findUserByEmail(db, email);
if (!user) {
    console.error(`User not found: ${email}`);
    process.exit(1);
}

const userId = user.id;
console.log(`Rebuilding han_characters for: ${email} (${userId})`);

// Step 1: Delete all existing rows
console.log("Deleting existing han_characters...");
const { error: delErr } = await db.from("han_characters").delete().neq("id", "00000000-0000-0000-0000-000000000000");
if (delErr) {
    console.error("Delete error:", delErr.message);
    process.exit(1);
}
console.log("Deleted all rows.");

// Step 2: Parse OpenCC STCharacters dict
console.log("Parsing OpenCC STCharacters dictionary...");
const paths = [
    resolve(
        __dirname,
        "..",
        "node_modules",
        ".pnpm",
        "opencc-js@1.0.5",
        "node_modules",
        "opencc-js",
        "dist",
        "esm-lib",
        "dict",
        "STCharacters.js",
    ),
    resolve(__dirname, "..", "node_modules", "opencc-js", "dist", "esm-lib", "dict", "STCharacters.js"),
];

let openccRaw = null;
for (const p of paths) {
    try {
        openccRaw = readFileSync(p, "utf-8");
        break;
    } catch {}
}
if (!openccRaw) {
    console.error("Cannot find OpenCC STCharacters.js");
    process.exit(1);
}

const dictStr = openccRaw
    .replace(/^export default "/, "")
    .replace(/"\s*$/, "")
    .replace(/\\n/g, "");
const entries = dictStr.split("|").filter(Boolean);

const simplChars = new Set();
let excluded = 0;
for (const entry of entries) {
    const parts = entry.trim().split(/\s+/);
    const simplified = (parts[0] || "").trim();
    if (simplified.length === 1 && /\p{Script=Han}/u.test(simplified)) {
        const cp = simplified.codePointAt(0);
        // Only CJK Unified Ideographs block (official simplified chars)
        if (cp >= 0x4e00 && cp <= 0x9fff) {
            simplChars.add(simplified);
        } else {
            excluded++;
        }
    }
}

console.log(
    `Found ${simplChars.size} simplified characters (CJK Unified block), ${excluded} excluded (Extension blocks)`,
);

// Step 3: Parse phienam.txt for han-viet readings
console.log("Parsing phienam.txt...");
const phienamPath = resolve(__dirname, "..", "data", "phienam.txt");
const raw = readFileSync(phienamPath, "utf-8");
const lines = raw.split(/\r?\n/);

const charReadings = new Map();
for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 1) continue;
    const ch = trimmed.slice(0, eqIdx).trim();
    const hv = trimmed.slice(eqIdx + 1).trim();
    if (!ch || !hv) continue;
    if (!charReadings.has(ch)) charReadings.set(ch, new Set());
    charReadings.get(ch).add(hv);
}

// Step 4: Build rows
console.log("Building rows...");
const rows = [];
for (const ch of simplChars) {
    const readings = charReadings.get(ch);
    const hanVietArr = readings && readings.size > 0 ? [...readings] : null;
    const hvText = hanVietArr ? [...new Set(hanVietArr.map((r) => normalizeSearchText(r)))].join(" ") : "";
    const pinyinStr = toPinyin(ch);
    const pinyinArr = pinyinStr.split(" ").filter(Boolean);
    const pinyinText = pinyinArr.length > 0 ? [...new Set(pinyinArr.map((r) => normalizeSearchText(r)))].join(" ") : "";
    const jyutpingStr = toJyutping(ch);
    const jyutpingArr = jyutpingStr.split(" ").filter(Boolean);
    const jyutpingText =
        jyutpingArr.length > 0 ? [...new Set(jyutpingArr.map((r) => normalizeSearchText(r)))].join(" ") : "";
    const hanTrad = toHanHK(ch) || null;
    const searchKey = normalizeSearchText(
        ch + " " + (hanTrad ?? "") + " " + hvText + " " + pinyinText + " " + jyutpingText,
    );

    rows.push({
        id: randomUUID(),
        user_id: userId,
        han_simplified: ch,
        han_traditional: hanTrad,
        han_viet: hanVietArr,
        pinyin: pinyinArr.length > 0 ? pinyinArr : null,
        jyutping: jyutpingArr.length > 0 ? jyutpingArr : null,
        search_key: searchKey,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    });
}

console.log(`Built ${rows.length} rows (${rows.filter((r) => r.han_viet).length} with han-viet)`);

// Step 5: Batch insert
let inserted = 0;
for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const { error } = await db.from("han_characters").insert(chunk);
    if (error) {
        console.error(`Batch insert error at offset ${i}:`, error.message);
        process.exit(1);
    }
    inserted += chunk.length;
    if (inserted % 1000 === 0 || inserted === rows.length) {
        console.log(`Inserted ${inserted}/${rows.length}`);
    }
}

console.log(`Done. ${inserted} han characters imported for ${email}.`);
