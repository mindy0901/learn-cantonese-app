import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const r = await pool.query(`
    SELECT
      (SELECT count(*)::int FROM vocabularies) AS total,
      (SELECT count(*)::int FROM vocabularies WHERE meanings_json->'meanings' @> '[{"category":"CC-Canto"}]') AS has_ccc,
      (SELECT count(*)::int FROM vocabularies WHERE meanings_json->'meanings' @> '[{"category":"words.hk"}]') AS has_whk,
      (SELECT count(*)::int FROM vocabularies WHERE jsonb_array_length(COALESCE(meanings_json->'meanings','[]')) = 0) AS empty
`);
console.log(JSON.stringify(r.rows[0], null, 2));

// Sample: 1 từ match words.hk (vd 一) xem meanings mới
const s = await pool.query(`
    SELECT han_hongkong, jsonb_pretty(meanings_json) AS m
    FROM vocabularies WHERE han_hongkong IN ('一','好','㗎嘛')
`);
for (const row of s.rows) {
    console.log("\n=== " + row.han_hongkong + " ===");
    console.log(row.m);
}
await pool.end();
