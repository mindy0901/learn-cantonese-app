import { Client } from "pg";
import fs from "node:fs";

const env = fs.readFileSync("/app/.env.cloud", "utf8");
const m = env.match(/['"]?DATABASE_URL['"]?\s*=\s*['"]([^'"]+)['"]/);
if (!m) {
    console.error("no DATABASE_URL in .env.cloud");
    process.exit(1);
}
const cloud = new Client({ connectionString: m[1], ssl: { rejectUnauthorized: false } });

async function main() {
    await cloud.connect();
    for (const t of [
        "users",
        "radicals",
        "han_characters",
        "cantonese_vocabularies",
        "cantonese_vocabulary_romanizations",
        "cantonese_vocabulary_meanings",
        "cantonese_vocabulary_examples",
        "cantonese_vocabulary_characters",
        "mandarin_vocabularies",
        "mandarin_vocabulary_romanizations",
        "mandarin_vocabulary_meanings",
        "mandarin_vocabulary_examples",
        "mandarin_vocabulary_characters",
        "grammars",
        "grammar_examples",
        "flashcard_decks",
        "flashcard_deck_cantonese_vocabularies",
        "flashcard_deck_mandarin_vocabularies",
        "vocabulary_sets",
        "vocabulary_set_cantonese_vocabularies",
        "vocabulary_set_mandarin_vocabularies",
    ]) {
        const r = await cloud.query(`SELECT count(*) c FROM "${t}"`);
        console.log(`${t}: ${r.rows[0].c}`);
    }
    await cloud.end();
}
main().catch((e) => {
    console.error(e.message);
    process.exit(1);
});
