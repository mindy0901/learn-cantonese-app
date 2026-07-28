const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
    // Check old PascalCase tables
    try {
        const r = await pool.query('SELECT count(*) as cnt FROM "Vocabulary"');
        console.log("Old Vocabulary count:", r.rows[0].cnt);
    } catch (e) {
        console.log("No Vocabulary table:", e.message);
    }
    try {
        const r = await pool.query('SELECT count(*) as cnt FROM "VocabularyCharacter"');
        console.log("Old VocabularyCharacter count:", r.rows[0].cnt);
    } catch (e) {
        console.log("No VocabularyCharacter:", e.message);
    }
    try {
        const r = await pool.query("SELECT count(*) as cnt FROM vocabularies");
        console.log("New vocabularies count:", r.rows[0].cnt);
    } catch (e) {
        console.log("No vocabularies:", e.message);
    }
    await pool.end();
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
