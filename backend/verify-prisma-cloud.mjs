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
        "han_characters",
        "vocabularies",
        "vocabulary_meanings",
        "vocabulary_characters",
        "user_vocabularies",
        "grammars",
        "sentence_patterns",
        "flashcard_decks",
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
