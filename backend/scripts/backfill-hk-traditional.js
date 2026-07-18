#!/usr/bin/env node
/**
 * Backfill han_traditional (HK traditional) for all han_characters
 * using OpenCC s2hk pipeline: STCharacters + HKVariants.
 *
 * Simplified → Standard Traditional → HK Traditional
 */

import "dotenv/config";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { requireAdmin } from "../lib/supabaseAdmin.js";
import { findUserByEmail } from "../lib/dataService.js";
import { getAdminEmails } from "../lib/appAdmin.js";
import { normalizeSearchText } from "../lib/searchNormalize.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BATCH_SIZE = 500;

function resolveEmail() {
  const arg = process.argv[2]?.trim();
  if (arg) return arg;
  return process.env.PUBLIC_DATA_EMAIL?.trim() || [...getAdminEmails()][0] || null;
}

const email = resolveEmail();
if (!email) { console.error("Usage: node scripts/backfill-hk-traditional.js <user-email>"); process.exit(1); }

const db = requireAdmin();
const user = await findUserByEmail(db, email);
if (!user) { console.error(`User not found: ${email}`); process.exit(1); }
const userId = user.id;

// Parse OpenCC dict file
function parseDict(filename) {
  const paths = [
    resolve(__dirname, "..", "node_modules", ".pnpm", "opencc-js@1.0.5", "node_modules", "opencc-js", "dist", "esm-lib", "dict", filename),
    resolve(__dirname, "..", "node_modules", "opencc-js", "dist", "esm-lib", "dict", filename),
  ];
  for (const p of paths) {
    try {
      const raw = readFileSync(p, "utf-8");
      const dict = raw.replace(/^export default "/, "").replace(/"\s*$/, "").replace(/\\n/g, "");
      const map = new Map();
      for (const entry of dict.split("|").filter(Boolean)) {
        const parts = entry.trim().split(/\s+/);
        const key = parts[0] || "";
        const val = parts[1] || "";
        if (key && val && key !== val) map.set(key, val);
      }
      return map;
    } catch {}
  }
  return null;
}

// Step 1: Simplified → Standard Traditional
console.log("Loading STCharacters...");
const s2t = parseDict("STCharacters.js");
if (!s2t) { console.error("Cannot load STCharacters"); process.exit(1); }
console.log(`STCharacters: ${s2t.size} mappings`);

// Step 2: Standard Traditional → HK Traditional
console.log("Loading HKVariants...");
const t2hk = parseDict("HKVariants.js");
if (!t2hk) { console.error("Cannot load HKVariants"); process.exit(1); }
console.log(`HKVariants: ${t2hk.size} mappings`);

// Build combined map: simplified → HK traditional
const s2hk = new Map();
for (const [simp, trad] of s2t) {
  const hk = t2hk.get(trad) || trad;
  if (hk !== simp) s2hk.set(simp, hk);
}
console.log(`s2hk combined: ${s2hk.size} mappings`);

// Step 3: Update han_characters
console.log(`\nUpdating han_characters for ${email}...`);
let offset = 0;
let updated = 0;
let skipped = 0;
const pageSize = 500;

while (true) {
  const { data: rows, error } = await db.from("han_characters")
    .select("id, han_simplified, han_traditional, han_viet, pinyin, jyutping")
    .eq("user_id", userId)
    .range(offset, offset + pageSize - 1)
    .order("id");

  if (error) { console.error("Fetch error:", error.message); process.exit(1); }
  if (!rows || rows.length === 0) break;

  const toUpsert = [];
  for (const row of rows) {
    const ch = (row.han_simplified || "").trim();
    const hk = s2hk.get(ch);
    if (!hk) { skipped++; continue; }

    const prev = (row.han_traditional || "").trim();
    if (prev === hk) { skipped++; continue; }

    // Build search_key
    const readings = Array.isArray(row.han_viet) ? row.han_viet : [];
    const pinyinArr = Array.isArray(row.pinyin) ? row.pinyin : [];
    const jyutpingArr = Array.isArray(row.jyutping) ? row.jyutping : [];
    const readingsText = [...new Set(readings.map((r) => normalizeSearchText(String(r))))].join(" ");
    const pinyinText = [...new Set(pinyinArr.map((r) => normalizeSearchText(String(r))))].join(" ");
    const jyutpingText = [...new Set(jyutpingArr.map((r) => normalizeSearchText(String(r))))].join(" ");
    const searchKey = normalizeSearchText(ch + " " + hk + " " + readingsText + " " + pinyinText + " " + jyutpingText);

    toUpsert.push({
      id: row.id,
      user_id: userId,
      han_simplified: ch,
      han_traditional: hk,
      search_key: searchKey,
      updated_at: new Date().toISOString(),
    });
    updated++;
  }

  if (toUpsert.length > 0) {
    for (let i = 0; i < toUpsert.length; i += BATCH_SIZE) {
      const chunk = toUpsert.slice(i, i + BATCH_SIZE);
      const { error: upsertErr } = await db.from("han_characters").upsert(chunk);
      if (upsertErr) { console.error("Upsert error:", upsertErr.message); process.exit(1); }
    }
  }

  offset += pageSize;
  console.log(`  Processed ${offset} rows, updated ${updated}, skipped ${skipped}`);
}

console.log(`\nDone. Updated: ${updated}, Skipped: ${skipped}`);

