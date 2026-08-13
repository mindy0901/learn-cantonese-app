/**
 * backup-supabase.mjs — Backup local DB → Supabase (all 12 tables, FK order).
 * Reads local via Prisma (.env.dev), writes via supabase-js service key (.env.supabase).
 * Upsert by id (idempotent, safe to re-run).
 * --dry preview (default), --apply writes to Supabase.
 */
import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { prisma } from "./lib/prisma.js";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "..", ".env.dev") });
dotenv.config({ path: resolve(__dirname, ".env.supabase") });
const APPLY = process.argv.includes("--apply");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;
if (!supabaseUrl || !supabaseKey) {
    console.error("Missing SUPABASE_URL / SUPABASE_SECRET_KEY in .env.supabase");
    process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

const toSnake = (o) => {
    const out = {};
    for (const [k, v] of Object.entries(o || {})) {
        if (v === undefined || v === null) continue;
        const key = k.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());
        out[key] = v instanceof Date ? v.toISOString() : v;
    }
    return out;
};

// [prismaModel, supabaseTable]
const TABLES = [
    ["user", "users"],
    ["hanCharacter", "han_characters"],
    ["vocabulary", "vocabularies"],
    ["vocabularyMeaning", "vocabulary_meanings"],
    ["vocabularyExample", "vocabulary_examples"],
    ["vocabularyCharacter", "vocabulary_characters"],
    ["userVocabulary", "user_vocabularies"],
    ["grammar", "grammars"],
    ["grammarExample", "grammar_examples"],
    ["sentencePattern", "sentence_patterns"],
    ["flashcardDeck", "flashcard_decks"],
    ["flashcardDeckVocabulary", "flashcard_deck_vocabularies"],
];

const BATCH = 400;

async function main() {
    console.log(`MODE: ${APPLY ? "APPLY (writes to Supabase)" : "DRY (preview)"}`);
    for (const [model, table] of TABLES) {
        const rows = await prisma[model].findMany();
        console.log(`  ${table}: ${rows.length} rows`);
        if (!APPLY) continue;
        const payloads = rows.map(toSnake);
        for (let i = 0; i < payloads.length; i += BATCH) {
            const batch = payloads.slice(i, i + BATCH);
            const { error } = await supabase.from(table).upsert(batch, { onConflict: "id" });
            if (error) {
                console.error(`  ✗ ${table} batch ${i / BATCH}:`, error.message);
                process.exitCode = 1;
                break;
            }
        }
        if (process.exitCode) break;
        console.log(`  ✓ ${table}: upserted ${rows.length}`);
    }
    if (APPLY) console.log(process.exitCode ? "\n✗ finished with errors" : "\n✔ BACKUP COMPLETE");
    else console.log("\n(dry run — run with --apply to write)");
    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
