const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
    // Remove TOCFL from hsk_level: "HSK 2 TOCFL 3" → "HSK 2"
    const r = await pool.query(
        "UPDATE vocabularies SET hsk_level = regexp_replace(hsk_level, '\\s*TOCFL\\s*\\d+(-\\d+)?', '', 'g') WHERE hsk_level LIKE '%TOCFL%'",
    );
    console.log("Updated:", r.rowCount, "rows");

    // Trim whitespace
    await pool.query("UPDATE vocabularies SET hsk_level = trim(hsk_level) WHERE hsk_level IS NOT NULL");
    console.log("Trimmed");

    await pool.end();
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
