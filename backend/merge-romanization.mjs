#!/usr/bin/env node
/**
 * merge-romanization.mjs — Gộp các vocabulary có cùng han_traditional thành 1 record.
 *
 * Lý do: trước đây các từ hán có nhiều phiên âm bị tách thành nhiều row DB riêng
 * (vd 一 → 3 row: yī|jat1, yí|jat1, yì|jat1). Nay gộp lại 1 record/hán tự để dễ map data.
 *
 * Kết quả mỗi nhóm:
 *   - Giữ 1 record "keeper" (giữ nguyên id để không phá liên kết).
 *   - Cột mới `romanization_json` (JSONB): array object phiên âm, mỗi object chứa
 *     { pinyin, jyutping, sinoVietnamese, meanings, examples } (meanings/examples từ meanings_json của record đó).
 *   - Cột cũ (pinyin/jyutping/sinoVietnamese/meanings_json) vẫn giữ:
 *     pinyin = join " / ", jyutping = join " / ", meanings_json = merge tất cả meanings/examples.
 *   - Merge liên kết (user_vocabularies, vocabulary_characters, flashcard_deck_vocabularies,
 *     vocabulary_set_vocabularies) về keeper.
 *   - Xóa các record còn lại.
 *
 * Usage:
 *   node /app/merge-romanization.mjs --dry      # preview, không ghi
 *   node /app/merge-romanization.mjs --apply    # ghi DB
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";
import dotenv from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "..", "..", ".env.dev") });

const pool = new pg.Pool({ connectionString: process.env["DATABASE_URL"] });
const dry = process.argv.includes("--dry");

/** stable UUID cho 1 romanization object: MD5(normPinyin|normJyutping) → uuid */
function romanizationId(pinyin, jyutping) {
    const normPy = String(pinyin ?? "")
        .replace(/\s+/g, "")
        .toLowerCase();
    const normJp = String(jyutping ?? "")
        .replace(/\s+/g, "")
        .toLowerCase();
    return createHash("md5")
        .update(`${normPy}|${normJp}`)
        .digest("hex")
        .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
}

function romanizationFromMeaningsJson(mj) {
    const meanings = Array.isArray(mj?.meanings) ? mj.meanings : [];
    const examples = Array.isArray(mj?.examples) ? mj.examples : [];
    return {
        meanings: meanings.map((m, i) => ({
            id: m.id,
            category: m.category ?? "",
            vietMeanings: m.vietMeanings ?? "",
            engMeanings: m.engMeanings ?? "",
            position: m.position ?? i,
            examples: (m.examples ?? []).map((ex, j) => ({
                id: ex.id,
                hanExample: ex.hanExample ?? "",
                jyutpingExample: ex.jyutpingExample ?? "",
                pinyinExample: ex.pinyinExample ?? "",
                vietExamples: ex.vietExamples ?? "",
                engExamples: ex.engExamples ?? "",
                position: ex.position ?? j,
            })),
        })),
        examples: examples.map((ex, i) => ({
            id: ex.id,
            hanExample: ex.hanExample ?? "",
            jyutpingExample: ex.jyutpingExample ?? "",
            pinyinExample: ex.pinyinExample ?? "",
            vietExamples: ex.vietExamples ?? "",
            engExamples: ex.engExamples ?? "",
            position: ex.position ?? i,
        })),
    };
}

function countContent(row) {
    const mj = row.meanings_json ?? {};
    const ms = Array.isArray(mj.meanings) ? mj.meanings.length : 0;
    const exs = Array.isArray(mj.examples) ? mj.examples.length : 0;
    const nested = Array.isArray(mj.meanings)
        ? mj.meanings.reduce((acc, m) => acc + (Array.isArray(m.examples) ? m.examples.length : 0), 0)
        : 0;
    return ms + exs + nested + (row.hsk_level ? 1 : 0) + (row.han_simplified ? 1 : 0);
}

async function main() {
    // 1) Ensure column
    if (!dry) {
        await pool.query(
            "ALTER TABLE \"vocabularies\" ADD COLUMN IF NOT EXISTS romanization_json JSONB DEFAULT '[]'::jsonb",
        );
        console.log("[apply] đã thêm cột vocabularies.romanization_json");
    } else {
        const has = await pool.query(
            `SELECT 1 FROM information_schema.columns WHERE table_name='vocabularies' AND column_name='romanization_json'`,
        );
        console.log(
            `[dry] cột romanization_json hiện có: ${has.rows.length > 0 ? "CÓ" : "CHƯA (sẽ thêm khi --apply)"}`,
        );
    }

    // 2) Groups (han_traditional có >1 record)
    const groups = await pool.query(
        `SELECT han_traditional, count(*)::int AS n, array_agg(id ORDER BY id) AS ids
         FROM vocabularies
         GROUP BY han_traditional
         HAVING count(*) > 1
         ORDER BY count(*) DESC, han_traditional`,
    );

    let totalGroups = 0;
    let totalDeleted = 0;
    let totalRomanization = 0;
    let uvMerged = 0;
    let vcMerged = 0;
    let fdvMerged = 0;
    let vsvMerged = 0;

    for (const g of groups.rows) {
        const ids = g.ids;
        const rows = (
            await pool.query(
                `SELECT id, han_traditional, han_simplified, pinyin, jyutping, sino_vietnamese,
                        hsk_level, meanings_json
                 FROM vocabularies WHERE id = ANY($1::uuid[]) ORDER BY id`,
                [ids],
            )
        ).rows;
        if (rows.length < 2) continue;

        // Chọn keeper = record giàu dữ liệu nhất (tie-break id nhỏ nhất)
        rows.sort((a, b) => countContent(b) - countContent(a) || (a.id < b.id ? -1 : 1));
        const keeper = rows[0];
        const dupes = rows.slice(1);

        // Build romanization array (dedupe theo pinyin|jyutping)
        const seen = new Set();
        const romanization = [];
        for (const r of rows) {
            const key = `${r.pinyin ?? ""}|${r.jyutping ?? ""}`;
            if (seen.has(key)) continue;
            seen.add(key);
            romanization.push({
                id: romanizationId(r.pinyin, r.jyutping),
                pinyin: r.pinyin ?? "",
                jyutping: r.jyutping ?? "",
                sinoVietnamese: r.sino_vietnamese ?? "",
                ...romanizationFromMeaningsJson(r.meanings_json),
            });
        }

        // pinyin/jyutping join (dedupe giữ thứ tự ổn định)
        const joinUnique = (arr) => {
            const out = [];
            for (const v of arr) {
                const t = (v ?? "").trim();
                if (t && !out.includes(t)) out.push(t);
            }
            return out;
        };
        const pinyins = joinUnique(rows.map((r) => r.pinyin));
        const jyutpings = joinUnique(rows.map((r) => r.jyutping));
        const sinos = joinUnique(rows.map((r) => r.sino_vietnamese));

        // Merge meanings_json: tất cả meanings + examples từ mọi record (giữ id, re-position)
        const allMeanings = [];
        const allExamples = [];
        for (const r of rows) {
            const mj = r.meanings_json ?? {};
            for (const m of Array.isArray(mj.meanings) ? mj.meanings : []) {
                allMeanings.push({
                    ...m,
                    examples: (m.examples ?? []).map((ex, j) => ({ ...ex, position: ex.position ?? j })),
                });
            }
            for (const ex of Array.isArray(mj.examples) ? mj.examples : []) {
                allExamples.push(ex);
            }
        }
        const mergedMeaningsJson = {
            meanings: allMeanings.map((m, i) => ({ ...m, position: m.position ?? i })),
            examples: allExamples.map((ex, i) => ({ ...ex, position: ex.position ?? i })),
        };

        // Merge liên kết — nhận `q` = client (transaction) hoặc pool (dry không gọi)
        async function mergeLinks(q) {
            // user_vocabularies — chuyển về keeper; merge progress nếu trùng (user_id, keeper)
            const uvRes = await q.query(
                `WITH moved AS (
                     SELECT uv.user_id,
                            bool_or(uv.important) AS important,
                            bool_or(uv.mastered) AS mastered,
                            max(uv.study_progress) AS study_progress,
                            max(uv.study_progress_at) AS study_progress_at,
                            min(uv.created_at) AS created_at,
                            max(uv.updated_at) AS updated_at
                     FROM user_vocabularies uv
                     WHERE uv.vocabulary_id = ANY($1::uuid[])
                     GROUP BY uv.user_id
                 )
                 INSERT INTO user_vocabularies
                     (id, user_id, vocabulary_id, important, mastered, study_progress, study_progress_at, created_at, updated_at)
                 SELECT gen_random_uuid(), m.user_id, $2::uuid, m.important, m.mastered, m.study_progress,
                        m.study_progress_at, m.created_at, COALESCE(m.updated_at, now())
                 FROM moved m
                 ON CONFLICT (user_id, vocabulary_id) DO UPDATE SET
                     important = user_vocabularies.important OR EXCLUDED.important,
                     mastered = user_vocabularies.mastered OR EXCLUDED.mastered,
                     study_progress = GREATEST(user_vocabularies.study_progress, EXCLUDED.study_progress),
                     study_progress_at = GREATEST(user_vocabularies.study_progress_at, EXCLUDED.study_progress_at),
                     updated_at = now()`,
                [dupes.map((d) => d.id), keeper.id],
            );
            const uvDel = await q.query(`DELETE FROM user_vocabularies WHERE vocabulary_id = ANY($1::uuid[])`, [
                dupes.map((d) => d.id),
            ]);
            return uvDel.rowCount ?? 0;
        }

        async function mergeChars(q) {
            // vocabulary_characters — chuyển các dòng chưa có ở keeper (unique han_character_id),
            // reposition để không đụng unique (vocabulary_id, position)
            const existing = await q.query(
                `SELECT han_character_id FROM vocabulary_characters WHERE vocabulary_id = $1::uuid`,
                [keeper.id],
            );
            const existingChars = new Set(existing.rows.map((r) => r.han_character_id));
            const dupChars = await q.query(
                `SELECT id, han_character_id, position FROM vocabulary_characters
                 WHERE vocabulary_id = ANY($1::uuid[]) ORDER BY position`,
                [dupes.map((d) => d.id)],
            );
            const maxPos = await q.query(
                `SELECT COALESCE(max(position), -1)::int AS m FROM vocabulary_characters WHERE vocabulary_id = $1::uuid`,
                [keeper.id],
            );
            let pos = maxPos.rows[0].m + 1;
            let moved = 0;
            for (const c of dupChars.rows) {
                if (existingChars.has(c.han_character_id)) continue;
                await q.query(
                    `INSERT INTO vocabulary_characters (id, vocabulary_id, han_character_id, position)
                     VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::int)`,
                    [keeper.id, c.han_character_id, pos++],
                );
                existingChars.add(c.han_character_id);
                moved++;
            }
            const del = await q.query(`DELETE FROM vocabulary_characters WHERE vocabulary_id = ANY($1::uuid[])`, [
                dupes.map((d) => d.id),
            ]);
            return moved;
        }

        async function mergeFdv(q) {
            const ins = await q.query(
                `INSERT INTO flashcard_deck_vocabularies (id, deck_id, vocabulary_id, position, created_at)
                 SELECT gen_random_uuid(), deck_id, $2::uuid, position, created_at
                 FROM flashcard_deck_vocabularies WHERE vocabulary_id = ANY($1::uuid[])
                 ON CONFLICT (deck_id, vocabulary_id) DO NOTHING`,
                [dupes.map((d) => d.id), keeper.id],
            );
            const del = await q.query(`DELETE FROM flashcard_deck_vocabularies WHERE vocabulary_id = ANY($1::uuid[])`, [
                dupes.map((d) => d.id),
            ]);
            return ins.rowCount ?? 0;
        }

        async function mergeVsv(q) {
            const ins = await q.query(
                `INSERT INTO vocabulary_set_vocabularies (id, set_id, vocabulary_id, position, created_at)
                 SELECT gen_random_uuid(), set_id, $2::uuid, position, created_at
                 FROM vocabulary_set_vocabularies WHERE vocabulary_id = ANY($1::uuid[])
                 ON CONFLICT (set_id, vocabulary_id) DO NOTHING`,
                [dupes.map((d) => d.id), keeper.id],
            );
            const del = await q.query(`DELETE FROM vocabulary_set_vocabularies WHERE vocabulary_id = ANY($1::uuid[])`, [
                dupes.map((d) => d.id),
            ]);
            return ins.rowCount ?? 0;
        }

        const updateFields = {
            pinyin: pinyins.length ? pinyins.join(" / ") : keeper.pinyin,
            jyutping: jyutpings.length ? jyutpings.join(" / ") : keeper.jyutping,
            sino_vietnamese: sinos.length ? sinos.join(" / ") : keeper.sino_vietnamese,
            meanings_json: JSON.stringify(mergedMeaningsJson),
            romanization_json: JSON.stringify(romanization),
        };

        if (dry) {
            totalGroups++;
            totalDeleted += dupes.length;
            totalRomanization += romanization.length;
            const shown = dupes.map((d) => `${d.pinyin ?? "-"}|${d.jyutping ?? "-"}`).join(", ");
            console.log(
                `  [dry] ${keeper.han_traditional}: keep=${keeper.id} (${keeper.pinyin}|${keeper.jyutping}) ` +
                    `+ dupes [${shown}] → romanization=${romanization.length} items`,
            );
            continue;
        }

        // apply — trong transaction
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const setClauses = [];
            const params = [keeper.id];
            for (const [col, val] of Object.entries(updateFields)) {
                setClauses.push(`${col} = $${params.length + 1}`);
                params.push(val);
            }
            await client.query(`UPDATE vocabularies SET ${setClauses.join(", ")} WHERE id = $1::uuid`, params);
            uvMerged += await mergeLinks(client);
            vcMerged += await mergeChars(client);
            fdvMerged += await mergeFdv(client);
            vsvMerged += await mergeVsv(client);
            const del = await client.query(`DELETE FROM vocabularies WHERE id = ANY($1::uuid[])`, [
                dupes.map((d) => d.id),
            ]);
            await client.query("COMMIT");
            totalGroups++;
            totalDeleted += del.rowCount ?? 0;
            totalRomanization += romanization.length;
        } catch (e) {
            await client.query("ROLLBACK");
            throw e;
        } finally {
            client.release();
        }
    }

    console.log("\n========== KẾT QUẢ ==========");
    console.log(`nhóm gộp: ${totalGroups}`);
    console.log(`record bị xóa: ${totalDeleted}`);
    console.log(`romanization items tạo: ${totalRomanization}`);
    if (!dry) {
        console.log(`user_vocabularies chuyển: ${uvMerged}`);
        console.log(`vocabulary_characters chuyển: ${vcMerged}`);
        console.log(`flashcard_deck_vocabularies chuyển: ${fdvMerged}`);
        console.log(`vocabulary_set_vocabularies chuyển: ${vsvMerged}`);
    }
    if (dry) console.log("\n[dry] chạy lại với --apply để ghi DB (đã có backup)");
    await pool.end();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
