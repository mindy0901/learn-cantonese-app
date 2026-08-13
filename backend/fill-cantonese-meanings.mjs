/**
 * fill-cantonese-meanings.mjs — Fill eng_meanings (cccanto/CEDICT) + viet_meanings
 * (CVDICT) for PURE CANTONESE words (jyutping, no pinyin) in DB.
 *
 * Matching is broadened with OpenCC: try han_traditional, han_simplified, and
 * their converted forms (trad<->simp) against source indexes.
 * eng priority: cccanto > CEDICT. vi from CVDICT.
 * --dry preview (default), --apply writes.
 */
import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "..", ".env.dev") });
const APPLY = process.argv.includes("--apply");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const DATA = resolve(__dirname, "data");

function capitalizeSentences(s) {
    return String(s ?? "")
        .replace(/(^|[.;;])\s*(\p{L})/gu, (m, p1, p2) => p1 + p2.toUpperCase())
        .trim();
}

async function main() {
    // OpenCC
    let toSimp = (s) => s,
        toTrad = (s) => s;
    try {
        const OpenCC = await import("opencc-js");
        toSimp = OpenCC.Converter({ from: "hk", to: "cn" });
        toTrad = OpenCC.Converter({ from: "cn", to: "hk" });
    } catch {
        /* self */
    }

    // sources
    const ccc = jsonToIndex(JSON.parse(readFileSync(resolve(DATA, "cccanto.json"), "utf8")));
    const cvd = jsonToIndex(JSON.parse(readFileSync(resolve(DATA, "CVDICT.json"), "utf8")));
    const ced = jsonToIndex(JSON.parse(readFileSync(resolve(DATA, "CEDICT.json"), "utf8")));

    function jsonToIndex(arr) {
        const idx = new Map(); // s/t -> entry
        for (const e of arr) {
            if (e.s && !idx.has(e.s)) idx.set(e.s, e);
            if (e.t && !idx.has(e.t)) idx.set(e.t, e);
        }
        return idx;
    }

    const { rows } = await pool.query(
        `SELECT id, han_simplified, han_traditional, jyutping, viet_meanings, eng_meanings
         FROM vocabularies
         WHERE jyutping IS NOT NULL AND jyutping<>'' AND (pinyin IS NULL OR pinyin='')`,
    );

    const fills = [];
    for (const r of rows) {
        const forms = new Set();
        if (r.han_traditional) {
            forms.add(r.han_traditional);
            forms.add(toSimp(r.han_traditional));
        }
        if (r.han_simplified) {
            forms.add(r.han_simplified);
            forms.add(toTrad(r.han_simplified));
        }
        let en = null,
            vi = null,
            srcEn = "";
        for (const f of forms) {
            if (ccc.has(f)) {
                en = (ccc.get(f).en || []).join("; ");
                srcEn = "cccanto";
                break;
            }
        }
        if (!en) {
            for (const f of forms) {
                if (ced.has(f)) {
                    en = (ced.get(f).en || []).join("; ");
                    srcEn = "cedict";
                    break;
                }
            }
        }
        for (const f of forms) {
            if (cvd.has(f)) {
                vi = cvd.get(f).vi || "";
                break;
            }
        }
        const needEn = !r.eng_meanings || !r.eng_meanings.trim();
        const needVi = !r.viet_meanings || !r.viet_meanings.trim();
        if ((needEn && en) || (needVi && vi)) {
            fills.push({
                id: r.id,
                w: r.han_traditional || r.han_simplified,
                jy: r.jyutping,
                en: needEn ? (en ? capitalizeSentences(en) : r.eng_meanings) : r.eng_meanings,
                vi: needVi ? (vi ? capitalizeSentences(vi) : r.viet_meanings) : r.viet_meanings,
                srcEn,
                gotEn: needEn && !!en,
                gotVi: needVi && !!vi,
            });
        }
    }

    const gotEn = fills.filter((f) => f.gotEn).length;
    const gotVi = fills.filter((f) => f.gotVi).length;
    const gotBoth = fills.filter((f) => f.gotEn && f.gotVi).length;
    const srcC = fills.filter((f) => f.srcEn === "cccanto").length;
    console.log(`MODE: ${APPLY ? "APPLY" : "DRY"}  pure-cantonese rows: ${rows.length}`);
    console.log(`  fill eng_meanings: ${gotEn} (src cccanto: ${srcC})`);
    console.log(`  fill viet_meanings: ${gotVi}`);
    console.log(`  fill BOTH: ${gotBoth}`);
    console.log("\n--- samples ---");
    for (const s of fills.slice(0, 10)) console.log(`  ${s.w} ${s.jy} | en="${s.en}" (${s.srcEn}) | vi="${s.vi}"`);

    if (APPLY) {
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            let n = 0;
            for (const s of fills) {
                await client.query(
                    "UPDATE vocabularies SET eng_meanings=$1, viet_meanings=$2, updated_at=now() WHERE id=$3",
                    [s.en, s.vi, s.id],
                );
                n++;
            }
            await client.query("COMMIT");
            console.log(`\n✔ WROTE ${n} rows`);
        } catch (e) {
            await client.query("ROLLBACK");
            console.error("ROLLED BACK:", e.message);
            process.exitCode = 1;
        } finally {
            client.release();
        }
    } else {
        console.log("\n(dry run — run with --apply to write)");
    }
    await pool.end();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
