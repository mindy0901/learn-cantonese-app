/**
 * verify-supabase.mjs — Đối chiếu LOCAL ↔ SUPABASE (đếm từng bảng, 21 bảng split).
 * - LOCAL: đọc qua Prisma (.env.dev)
 * - SUPABASE: REST API qua supabase-js (.env.supabase, service key)
 * Chạy: docker compose -f docker-compose.dev.yml exec -T backend node /app/verify-supabase.mjs
 *        ... node /app/verify-supabase.mjs --check   (chỉ kiểm tra CỘT, không đếm)
 */
import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { prisma } from "../lib/prisma.js";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "..", "..", ".env.dev") });
dotenv.config({ path: resolve(__dirname, "..", ".env.supabase") });
const CHECK_ONLY = process.argv.includes("--check");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;
if (!supabaseUrl || !supabaseKey) {
    console.error("Missing SUPABASE_URL / SUPABASE_SECRET_KEY in .env.supabase");
    process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

const toSnake = (k) => k.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());

// [prismaModel, supabaseTable]
const TABLES = [
    ["user", "users"],
    ["hanziRadical", "radicals"],
    ["mandarinVocabulary", "mandarin_vocabularies"],
    ["mandarinVocabularyRomanization", "mandarin_vocabulary_romanizations"],
    ["mandarinVocabularyMeaning", "mandarin_vocabulary_meanings"],
    ["mandarinVocabularyExample", "mandarin_vocabulary_examples"],
    ["flashcardDeckMandarinVocabulary", "flashcard_deck_mandarin_vocabularies"],
    ["vocabularySetMandarinVocabulary", "vocabulary_set_mandarin_vocabularies"],
    ["cantoneseVocabulary", "cantonese_vocabularies"],
    ["cantoneseVocabularyRomanization", "cantonese_vocabulary_romanizations"],
    ["cantoneseVocabularyMeaning", "cantonese_vocabulary_meanings"],
    ["cantoneseVocabularyExample", "cantonese_vocabulary_examples"],
    ["flashcardDeckCantoneseVocabulary", "flashcard_deck_cantonese_vocabularies"],
    ["vocabularySetCantoneseVocabulary", "vocabulary_set_cantonese_vocabularies"],
    ["grammar", "grammars"],
    ["grammarExample", "grammar_examples"],
    ["flashcardDeck", "flashcard_decks"],
    ["vocabularySet", "vocabulary_sets"],
    ["userCheckin", "user_checkins"],
    ["userFavoriteVocabulary", "user_favorite_vocabularies"],
    ["userDislikedVocabulary", "user_disliked_vocabularies"],
    ["userVocabularyMastery", "user_vocabulary_mastery"],
    ["tag", "tags"],
    ["vocabularyTag", "vocabulary_tags"],
];

const pad = (s, n) => String(s).padEnd(n);
let problems = 0;

// ── --check: đối chiếu CỘT (đọc local 200 dòng → gom key → select trên Supabase) ──
if (CHECK_ONLY) {
    console.log(`${pad("TABLE", 42)} STATUS`);
    console.log("-".repeat(76));
    for (const [model, table] of TABLES) {
        const rows = await prisma[model].findMany({ take: 200 });
        const cols = new Set();
        for (const r of rows) for (const k of Object.keys(r)) cols.add(toSnake(k));
        if (table === "user_checkins") {
            cols.delete("date");
            cols.add("checkin_date");
        }
        const list = [...cols];
        if (list.length === 0) {
            const { error } = await supabase.from(table).select("id").limit(1);
            console.log(`${pad(table, 42)} ${error ? "❌ " + error.message : "✅ (local rỗng — bảng tồn tại)"}`);
            if (error) problems++;
            continue;
        }
        const { error } = await supabase.from(table).select(list.join(",")).limit(1);
        if (error) {
            console.log(`${pad(table, 42)} ❌ ${error.message}`);
            problems++;
        } else {
            console.log(`${pad(table, 42)} ✅ đủ cột (${list.length})`);
        }
    }
    console.log("-".repeat(76));
    console.log(problems === 0 ? "✔ SCHEMA OK" : `✗ ${problems} bảng thiếu cột/bảng`);
    await prisma.$disconnect();
} else {
    console.log(`${pad("TABLE", 42)} ${pad("LOCAL", 9)} ${pad("SUPABASE", 9)} STATUS`);
    console.log("-".repeat(76));

    for (const [model, table] of TABLES) {
        const local = await prisma[model].count();
        const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
        let status;
        if (error) {
            status = `❌ ${error.message}`;
            problems++;
        } else if (count === local) {
            status = "✅ khớp";
        } else {
            status = `⚠️ lệch ${count - local}`;
            problems++;
        }
        console.log(`${pad(table, 42)} ${pad(local, 9)} ${pad(error ? "-" : count, 9)} ${status}`);
    }

    console.log("-".repeat(76));
    console.log(problems === 0 ? "✔ TẤT CẢ KHỚP" : `✗ ${problems} bảng lệch/lỗi`);
    await prisma.$disconnect();
}
