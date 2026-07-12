#!/usr/bin/env node
/**
 * One-shot: fill han_traditional (HK traditional) + han_simplified for all words via OpenCC.
 * Usage: node scripts/backfill-han-variants.js <user-email>
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env (or .env).
 */
import "dotenv/config";
import { requireAdmin } from "../lib/supabaseAdmin.js";
import { backfillHanVariants } from "../lib/hanVariantBackfill.js";
import { findUserByEmail } from "../lib/dataService.js";

const email = process.argv[2];
if (!email) {
    console.error("Usage: node scripts/backfill-han-variants.js <user-email>");
    process.exit(1);
}

const db = requireAdmin();
const user = await findUserByEmail(db, email);
if (!user) {
    console.error(`User not found: ${email}`);
    process.exit(1);
}

const result = await backfillHanVariants(db, user.id);
console.log(JSON.stringify({ ok: true, userId: user.id, ...result }, null, 2));
