/**
 * fill-ccc-full.mjs — Apply the FULL CC-Canto treatment to every vocabulary
 * matched by CC-Canto across the whole bank:
 *   1. Overwrite `eng_meanings` with ALL CC-Canto English meanings (every
 *      sense/reading, deduped).
 *   2. For words with MULTIPLE CC-Canto entries (multiple readings): rebuild
 *      nested `vocabulary_meanings` grouped by jyutping reading (category =
 *      reading), one row per reading with its combined English meanings.
 *      (Vietnamese left empty here — filled by a translate pass afterwards.)
 *   3. Single-reading words: overwrite eng_meanings only; existing nested rows
 *      (if any) are synced to the new eng value (keeps detail page consistent).
 *
 * Usage: node fill-ccc-full.mjs            (dry preview)
 *        node fill-ccc-full.mjs --apply    (write)
 */
import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import { randomUUID } from "crypto";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "..", ".env.dev") });
const APPLY = process.argv.includes("--apply");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const DATA = resolve(__dirname, "data");

function capitalizeSentences(s) {
    return String(s ?? "")
        .replace(/(^|[.!?;/]\s*)(\p{L})/gu, (_m, p1, p2) => p1 + p2.toLocaleUpperCase("vi"))
        .trim();
}

async function main() {
    let toSimp = (s) => s,
        toTrad = (s) => s;
    try {
        const OpenCC = await import("opencc-js");
        toSimp = OpenCC.Converter({ from: "hk", to: "cn" });
        toTrad = OpenCC.Converter({ from: "cn", to: "hk" });
    } catch {
        /* self */
    }

    const ccc = JSON.parse(readFileSync(resolve(DATA, "cccanto.json"), "utf8"));
    const byForm = new Map(); // form -> [all entries]
    for (const e of ccc) {
        for (const k of new Set([e.s, e.t].filter(Boolean))) {
            if (!byForm.has(k)) byForm.set(k, []);
            byForm.get(k).push(e);
        }
    }
    const entriesFor = (vocab) => {
        const forms = new Set();
        if (vocab.han_traditional) {
            forms.add(vocab.han_traditional);
            forms.add(toSimp(vocab.han_traditional));
        }
        if (vocab.han_simplified) {
            forms.add(vocab.han_simplified);
            forms.add(toTrad(vocab.han_simplified));
        }
        const m = new Map();
        for (const f of forms) for (const e of byForm.get(f) ?? []) m.set(e, e);
        return [...m.values()];
    };

    const { rows } = await pool.query(
        `SELECT id, han_simplified, han_traditional, pure_cantonese, viet_meanings, eng_meanings FROM vocabularies`,
    );
    const nested = await pool.query(
        `SELECT vocabulary_id, category, viet_meanings, eng_meanings FROM vocabulary_meanings`,
    );
    const nestedByVocab = new Map();
    for (const r of nested.rows) {
        if (!nestedByVocab.has(r.vocabulary_id)) nestedByVocab.set(r.vocabulary_id, []);
        nestedByVocab.get(r.vocabulary_id).push(r);
    }

    const plans = [];
    for (const r of rows) {
        const entries = entriesFor(r);
        if (!entries.length) continue;
        const groups = new Map(); // jp -> Set(en)
        for (const e of entries) {
            const jp = String(e.jp ?? "").trim();
            const en = (e.en ?? []).filter((x) => x && x !== "# adapted from cc-cedict");
            if (!groups.has(jp)) groups.set(jp, new Set());
            for (const x of en) groups.get(jp).add(x);
        }
        const groupList = [...groups.entries()].map(([jp, set]) => ({ jp, en: [...set] }));
        const fullEn = [...new Set(groupList.flatMap((g) => g.en))].join("; ");
        const norm = (s) =>
            String(s ?? "")
                .replace(/\s+/g, " ")
                .toLowerCase();
        plans.push({
            row: r,
            groups: groupList,
            fullEn,
            enChanged: norm(fullEn) !== norm((r.eng_meanings || "").trim()),
            hadNested: nestedByVocab.has(r.id),
        });
    }

    const multi = plans.filter((p) => p.groups.length > 1);
    const single = plans.filter((p) => p.groups.length === 1);
    const totalGroups = multi.reduce((a, p) => a + p.groups.length, 0) + single.length;
    const changed = plans.filter((p) => p.enChanged).length;
    const multiWithNested = multi.filter((p) => p.hadNested);
    const existingNestedAffected = multiWithNested.reduce((a, p) => a + nestedByVocab.get(p.row.id).length, 0);
    const singleWithNested = single.filter((p) => p.hadNested);

    console.log("=== FULL CC-Canto — " + (APPLY ? "APPLY" : "DRY") + " ===");
    console.log(`matched vocabularies      : ${plans.length}`);
    console.log(`  multi-reading (>1 entry): ${multi.length}  (rebuild grouped nested)`);
    console.log(`  single-reading (1 entry): ${single.length}  (eng only)`);
    console.log(`eng_meanings would change : ${changed}`);
    console.log(`nested rows to create     : ${multi.reduce((a, p) => a + p.groups.length, 0)}`);
    console.log(`existing nested rows DELETEd (multi-reading): ${existingNestedAffected}`);
    console.log(`single-reading with existing nested (eng synced): ${singleWithNested.length}`);
    console.log("--- samples ---");
    for (const p of plans.slice(0, 8)) {
        console.log(
            `  ${p.row.han_traditional || p.row.han_simplified} | ${p.groups.length} reading(s) | en="${p.fullEn.slice(0, 80)}"`,
        );
    }

    if (!APPLY) {
        console.log("\n(dry run — run with --apply to write)");
        await pool.end();
        return;
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        let enN = 0,
            delN = 0,
            insN = 0,
            syncN = 0;
        for (const p of plans) {
            if (p.enChanged) {
                await client.query("UPDATE vocabularies SET eng_meanings=$1, updated_at=now() WHERE id=$2", [
                    p.fullEn,
                    p.row.id,
                ]);
                enN++;
            }
        }
        for (const p of multi) {
            if (p.hadNested) {
                const res = await client.query("DELETE FROM vocabulary_meanings WHERE vocabulary_id=$1", [p.row.id]);
                delN += res.rowCount;
            }
            let i = 0;
            for (const g of p.groups) {
                await client.query(
                    `INSERT INTO vocabulary_meanings
                       (id, vocabulary_id, category, viet_meanings, eng_meanings, position, created_at, updated_at)
                     VALUES ($1,$2,$3,$4,$5,$6,now(),now())`,
                    [randomUUID(), p.row.id, g.jp, "", capitalizeSentences(g.en.join("; ")), i++],
                );
                insN++;
            }
        }
        for (const p of singleWithNested) {
            const res = await client.query(
                "UPDATE vocabulary_meanings SET eng_meanings=$1, updated_at=now() WHERE vocabulary_id=$2",
                [p.fullEn, p.row.id],
            );
            syncN += res.rowCount;
        }
        await client.query("COMMIT");
        console.log(
            `\n✔ WROTE: eng updated=${enN}, nested deleted=${delN}, nested inserted=${insN}, single nested synced=${syncN}`,
        );
    } catch (e) {
        await client.query("ROLLBACK");
        console.error("ROLLED BACK:", e.message);
        process.exitCode = 1;
    } finally {
        client.release();
    }
    await pool.end();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
