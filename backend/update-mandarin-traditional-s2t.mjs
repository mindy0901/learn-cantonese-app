/**
 * Cập nhật hanzi_traditional cho bảng mandarin_vocabularies bằng OpenCC s2t
 * (giản thể → phồn thể, chuẩn OpenCC). GHI ĐÈ TOÀN BỘ nếu có.
 *
 * Chạy: docker compose -f docker-compose.dev.yml exec -T backend \
 *         node /app/update-mandarin-traditional-s2t.mjs --dry|--apply
 */
import pg from "pg";
import fs from "fs";
import path from "path";

const DRY = process.argv.includes("--dry");
const APPLY = process.argv.includes("--apply");
const LIMIT = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] || 0);

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function backupCsv(client, table, dir) {
    const file = path.join(dir, `${table}.csv`);
    const r = await client.query(`COPY (SELECT * FROM "${table}") TO STDOUT WITH (FORMAT csv, HEADER true)`);
    const text = r.rows.map((row) => Object.values(row)[0]).join("\n") + "\n";
    fs.writeFileSync(file, text, "utf8");
    return file;
}

async function main() {
    if (!DRY && !APPLY) {
        console.error("Dùng --dry (preview) / --apply (ghi DB).");
        process.exit(1);
    }
    const mode = DRY ? "DRY" : "APPLY";

    const OpenCC = await import("opencc-js");
    const s2t = OpenCC.Converter({ from: "cn", to: "t" });

    const baseSql = `SELECT id, hanzi_simplified, hanzi_traditional FROM mandarin_vocabularies WHERE hanzi_simplified IS NOT NULL AND hanzi_simplified <> '' ORDER BY id`;
    const rows = LIMIT > 0 ? (await pool.query(`${baseSql} LIMIT $1`, [LIMIT])).rows : (await pool.query(baseSql)).rows;

    let changed = 0;
    let unchanged = 0;
    let empty = 0;
    const samples = [];
    const updates = [];

    for (const r of rows) {
        const simp = String(r.hanzi_simplified ?? "").trim();
        const trad = s2t(simp).trim();
        if (!trad) {
            empty++;
            continue;
        }
        if (trad === String(r.hanzi_traditional ?? "").trim()) {
            unchanged++;
            continue;
        }
        changed++;
        updates.push([trad, r.id]);
        if (samples.length < 15) {
            samples.push(`${simp} → ${trad} (cũ: ${r.hanzi_traditional ?? ""})`);
        }
    }

    console.log(`[${mode}] tổng: ${rows.length} | sẽ đổi: ${changed} | giữ nguyên: ${unchanged} | trống: ${empty}`);
    console.log(`[${mode}] mẫu:\n` + samples.map((s) => `  ${s}`).join("\n"));

    if (DRY) {
        console.log(`[${mode}] preview xong — chạy --apply để ghi.`);
        await pool.end();
        return;
    }

    // Backup
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const dir = `/app/_backup_mandarin_trad_s2t_${ts}`;
    fs.mkdirSync(dir, { recursive: true });
    const client = await pool.connect();
    try {
        const f = await backupCsv(client, "mandarin_vocabularies", dir);
        console.log(`[backup] → ${f}`);
    } catch (e) {
        console.error("[backup] Lỗi backup:", e.message);
        process.exit(1);
    } finally {
        client.release();
    }

    // Update (transaction)
    const c = await pool.connect();
    try {
        await c.query("BEGIN");
        for (let i = 0; i < updates.length; i += 500) {
            const batch = updates.slice(i, i + 500);
            for (const [trad, id] of batch) {
                await c.query(
                    `UPDATE mandarin_vocabularies SET hanzi_traditional = $1, updated_at = now() WHERE id = $2`,
                    [trad, id],
                );
            }
        }
        await c.query("COMMIT");
        console.log(`[${mode}] đã update ${updates.length} dòng.`);
    } catch (e) {
        await c.query("ROLLBACK");
        console.error(`[${mode}] Lỗi update:`, e.message);
        process.exit(1);
    } finally {
        c.release();
    }

    await pool.end();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
