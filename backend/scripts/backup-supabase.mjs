/**
 * backup-supabase.mjs — Backup local DB → Supabase (all 21 tables, FK order).
 * Reads local via Prisma (.env.dev), writes via supabase-js service key (.env.supabase).
 * Upsert by id (idempotent, safe to re-run).
 * --dry preview (default), --apply writes to Supabase.
 * --reset (kèm --apply): XÓA toàn bộ dữ liệu 21 bảng trên cloud trước khi insert
 *   → mirror chính xác local (dọn cả các dòng thừa không còn ở local). Dùng khi
 *   local đã dedupe/merge/xóa từ sau lần backup trước.
 */
import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { prisma } from "../lib/prisma.js";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "..", "..", ".env.dev") });
dotenv.config({ path: resolve(__dirname, "..", ".env.supabase") });
const APPLY = process.argv.includes("--apply");
const RESET = process.argv.includes("--reset");

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

// [prismaModel, supabaseTable] — 2026-08-31: schema SPLIT (bỏ han_characters/vocabulary_characters/
// user_vocabularies/sentence_patterns; thêm radicals + vocabulary_sets + user_checkins)
// ⚠️ 2026-09-19: thứ tự PHẢI theo FK — bảng CHA (flashcard_decks, vocabulary_sets) đứng TRƯỚC
// bảng join; nếu không → "violates foreign key constraint ..._set_id_fkey".
const TABLES = [
    ["user", "users"],
    ["hanziRadical", "radicals"],
    ["mandarinVocabulary", "mandarin_vocabularies"],
    ["mandarinVocabularyRomanization", "mandarin_vocabulary_romanizations"],
    ["mandarinVocabularyMeaning", "mandarin_vocabulary_meanings"],
    ["mandarinVocabularyExample", "mandarin_vocabulary_examples"],
    ["cantoneseVocabulary", "cantonese_vocabularies"],
    ["cantoneseVocabularyRomanization", "cantonese_vocabulary_romanizations"],
    ["cantoneseVocabularyMeaning", "cantonese_vocabulary_meanings"],
    ["cantoneseVocabularyExample", "cantonese_vocabulary_examples"],
    ["flashcardDeck", "flashcard_decks"],
    ["vocabularySet", "vocabulary_sets"],
    ["flashcardDeckMandarinVocabulary", "flashcard_deck_mandarin_vocabularies"],
    ["flashcardDeckCantoneseVocabulary", "flashcard_deck_cantonese_vocabularies"],
    ["vocabularySetMandarinVocabulary", "vocabulary_set_mandarin_vocabularies"],
    ["vocabularySetCantoneseVocabulary", "vocabulary_set_cantonese_vocabularies"],
    ["grammar", "grammars"],
    ["grammarExample", "grammar_examples"],
    ["userCheckin", "user_checkins"],
    ["userFavoriteVocabulary", "user_favorite_vocabularies"],
    ["userDislikedVocabulary", "user_disliked_vocabularies"],
    ["userVocabularyMastery", "user_vocabulary_mastery"],
    ["tag", "tags"],
    ["vocabularyTag", "vocabulary_tags"],
];

const BATCH = 400;
// ⚠️ Xóa theo LÔ: Supabase có `statement_timeout` (~8s) — xóa 1 lệnh cả bảng lớn
// (VD cantonese_vocabulary_meanings 27k dòng) sẽ bị "canceling statement due to statement timeout".
const DELETE_CHUNK = Number(process.env.DELETE_CHUNK || 2000);

/** Xóa toàn bộ dòng của 1 bảng theo lô (id là PK → điều kiện khớp mọi dòng). */
async function deleteAllRows(table) {
    let total = 0;
    for (;;) {
        const { error, count } = await supabase
            .from(table)
            .delete({ count: "exact" })
            .not("id", "is", null)
            .limit(DELETE_CHUNK);
        if (error) return { error };
        total += count ?? 0;
        if (!count || count < DELETE_CHUNK) return { total };
    }
}

/** Xóa toàn bộ dữ liệu trên cloud (thứ tự FK ngược) — mirror chính xác local. */
async function resetCloud() {
    console.log("RESET: xóa toàn bộ dữ liệu trên Supabase (thứ tự FK ngược, theo lô)…");
    for (const [, table] of [...TABLES].reverse()) {
        const { error, total } = await deleteAllRows(table);
        if (error) {
            console.error(`  ✗ ${table}:`, error.message);
            process.exitCode = 1;
            return;
        }
        console.log(`  🗑 ${table}: xóa ${total} dòng`);
    }
    console.log("RESET xong.\n");
}

async function main() {
    console.log(
        `MODE: ${APPLY ? "APPLY (writes to Supabase)" : "DRY (preview)"}${RESET ? " + RESET (xóa cloud trước khi insert)" : ""}`,
    );
    if (APPLY && RESET) {
        await resetCloud();
        if (process.exitCode) {
            console.error("\n✗ RESET thất bại — DỪNG, không insert để tránh cloud nửa vời.");
            await prisma.$disconnect();
            return;
        }
    }
    for (const [model, table] of TABLES) {
        const rows = await prisma[model].findMany();
        console.log(`  ${table}: ${rows.length} rows`);
        if (!APPLY) continue;
        const payloads = rows.map((r) => {
            const p = toSnake(r);
            // UserCheckin: Prisma field `date` @map("checkin_date") — toSnake không biết map này.
            if (table === "user_checkins" && "date" in p) {
                p.checkin_date = String(p.date).slice(0, 10); // DATE → YYYY-MM-DD
                delete p.date;
            }
            return p;
        });
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
