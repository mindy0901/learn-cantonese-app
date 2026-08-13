import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const r1 = await pool.query(
    `SELECT count(*)::int AS c FROM vocabularies
     WHERE meanings_json IS NULL
        OR jsonb_array_length(COALESCE(meanings_json->'meanings','[]'::jsonb)) = 0`,
);
console.log("Từ có meanings_json rỗng/không meanings:", r1.rows[0].c);

const r2 = await pool.query(
    `SELECT id, han_hongkong, jsonb_array_length(COALESCE(meanings_json->'meanings','[]'::jsonb)) AS n
     FROM vocabularies WHERE han_hongkong LIKE '%' || chr(21622) || '%'`,
);
console.log("Từ chứa ký tự 喎 (U+5592 = chr(21622)):", JSON.stringify(r2.rows, null, 2));

const r3 = await pool.query("SELECT count(*)::int AS c FROM vocabularies");
console.log("Tổng vocabularies:", r3.rows[0].c);

await pool.end();
